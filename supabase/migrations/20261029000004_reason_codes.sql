-- Kody powodu zamiast polskich tekstów w rejestrach SQL (ADR 0019).
-- Teksty zapisane w bazie nie dają się przetłumaczyć na język odbiorcy: automaty zapisują teraz kod, a interfejs składa treść w swoim języku.
-- Ręczne uwagi i powody wpisane przez ludzi (note, status_reason) zostają tekstem.

alter table public.package_ledger
  add column note_code text check (note_code is null or note_code in ('undo_complete', 'restore_canceled'));

alter table public.organizations
  add column status_reason_code text check (status_reason_code is null or status_reason_code in ('access_expired'));

update public.package_ledger set note_code = 'undo_complete', note = null where note = 'Cofnięcie zakończenia zajęć';
update public.package_ledger set note_code = 'restore_canceled', note = null where note = 'Przywrócenie odwołanych zajęć';
update public.organizations set status_reason_code = 'access_expired', status_reason = null where status_reason = 'Okres dostępu dobiegł końca';

create or replace function app.drop_pending_events(p_org uuid, p_types text[], p_key text, p_value text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.outbox_events
    set processed_at = now(), last_error = 'undone_before_send', locked_until = null
    where organization_id = p_org
      and processed_at is null
      and type = any (p_types)
      and payload ->> p_key = p_value;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.undo_complete_session(p_org uuid, p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session public.training_sessions;
  v_attendee public.session_attendees;
  v_tz text;
  v_charge public.charges;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not app.has_org_role(p_org, array['owner', 'admin', 'trainer', 'assistant']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform 1 from public.training_sessions where organization_id = p_org and id = p_session for update;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  select * into v_session from public.training_sessions where organization_id = p_org and id = p_session;
  if v_session.status <> 'completed' then
    raise exception 'session is not completed' using errcode = 'DT002';
  end if;

  select coalesce((select s.timezone from public.organization_settings s where s.organization_id = p_org), 'Europe/Warsaw')
    into v_tz;
  if (v_session.completed_at at time zone v_tz)::date <> (now() at time zone v_tz)::date then
    raise exception 'undo window passed' using errcode = 'DT012';
  end if;

  select * into v_attendee from public.session_attendees where organization_id = p_org and session_id = p_session;

  -- Należność za pojedyncze zajęcia: anulujemy, o ile nie została opłacona
  for v_charge in
    select * from public.charges
      where organization_id = p_org and source_type = 'session' and source_id = p_session and voided_at is null
      for update
  loop
    if exists (select 1 from public.payment_allocations where organization_id = p_org and charge_id = v_charge.id) then
      raise exception 'session charge is paid' using errcode = 'DT010';
    end if;
    update public.charges set voided_at = now() where id = v_charge.id;
  end loop;

  if v_attendee.client_package_id is not null then
    insert into public.package_ledger (organization_id, client_package_id, delta, reason, note_code, attendee_id, created_by)
    values (p_org, v_attendee.client_package_id, 1, 'adjustment', 'undo_complete', v_attendee.id, v_user);
    perform app.drop_pending_events(p_org, array['client_package.low_balance'], 'client_package_id', v_attendee.client_package_id::text);
  end if;

  update public.training_sessions
    set status = 'scheduled', completed_at = null, client_summary = null
    where organization_id = p_org and id = p_session;
  update public.session_attendees
    set attendance = 'planned', client_package_id = null
    where organization_id = p_org and id = v_attendee.id;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, v_user, 'training_session.completion_undone', 'training_session', p_session);
end;
$$;

create or replace function public.undo_cancel_session(p_org uuid, p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session public.training_sessions;
  v_attendee public.session_attendees;
  v_offer public.slot_offers;
  v_claim record;
  v_dropped integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not app.has_org_role(p_org, array['owner', 'admin', 'trainer', 'assistant']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform 1 from public.training_sessions where organization_id = p_org and id = p_session for update;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  select * into v_session from public.training_sessions where organization_id = p_org and id = p_session;
  if v_session.status <> 'canceled' or v_session.starts_at <= now() then
    raise exception 'session cannot be restored' using errcode = 'DT002';
  end if;

  -- Termin oddany innej osobie: nie przywracamy
  if exists (
    select 1 from public.slot_offers o where o.organization_id = p_org and o.session_id = p_session and o.status = 'filled'
  ) then
    raise exception 'slot already taken' using errcode = 'DT013';
  end if;

  select * into v_attendee from public.session_attendees where organization_id = p_org and session_id = p_session;

  -- Zajęcie zabrane przy późnym odwołaniu wraca do pakietu
  if v_attendee.attendance = 'late_canceled' and v_attendee.client_package_id is not null then
    insert into public.package_ledger (organization_id, client_package_id, delta, reason, note_code, attendee_id, created_by)
    values (p_org, v_attendee.client_package_id, 1, 'adjustment', 'restore_canceled', v_attendee.id, v_user);
    perform app.drop_pending_events(p_org, array['client_package.low_balance'], 'client_package_id', v_attendee.client_package_id::text);
  end if;

  -- Kolizja z innymi zajęciami trenera zgłosi błąd 23P01 (wykluczenie terminów)
  update public.training_sessions
    set status = 'scheduled', canceled_at = null
    where organization_id = p_org and id = p_session;
  update public.session_attendees
    set attendance = 'planned', client_package_id = null
    where organization_id = p_org and id = v_attendee.id;

  -- Otwarte ogłoszenie tego terminu jest zamykane; oczekujące zgłoszenia odrzucone
  select * into v_offer from public.slot_offers where organization_id = p_org and session_id = p_session and status = 'open';
  if found then
    update public.slot_offers set status = 'closed', closed_at = now() where id = v_offer.id;
    perform app.drop_pending_events(p_org, array['slot_offer.created'], 'offer_id', v_offer.id::text);
    for v_claim in
      update public.slot_claims
        set status = 'declined', decided_at = now(), decided_by = v_user
        where offer_id = v_offer.id and status = 'pending'
        returning id, client_id
    loop
      insert into public.outbox_events (organization_id, type, payload)
      values (p_org, 'slot_claim.declined',
              jsonb_build_object('claim_id', v_claim.id, 'offer_id', v_offer.id, 'client_id', v_claim.client_id));
    end loop;
  end if;

  -- Klient jeszcze nie dostał „Zajęcia odwołane”: wycofujemy po cichu; w przeciwnym razie informujemy o przywróceniu
  v_dropped := app.drop_pending_events(p_org, array['training_session.canceled'], 'session_id', p_session::text);
  if coalesce((
    select e.last_error from public.outbox_events e
    where e.organization_id = p_org and e.type = 'training_session.canceled' and e.payload ->> 'session_id' = p_session::text
    order by e.created_at desc, e.id desc limit 1
  ), '') = 'zniesione z zaplanowaniem' then
    -- Zaplanowanie i odwołanie zniosły się w oknie, więc klient nie wie jeszcze o tych zajęciach: informujemy o zaplanowaniu
    insert into public.outbox_events (organization_id, type, payload)
    values (p_org, 'training_session.scheduled',
            jsonb_build_object('session_id', p_session, 'client_id', v_attendee.client_id, 'starts_at', v_session.starts_at));
  elsif v_dropped = 0 then
    insert into public.outbox_events (organization_id, type, payload)
    values (p_org, 'training_session.restored',
            jsonb_build_object('session_id', p_session, 'client_id', v_attendee.client_id));
  end if;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, v_user, 'training_session.cancel_undone', 'training_session', p_session);
end;
$$;

create or replace function public.admin_set_organization_status(
  p_org uuid,
  p_status text,
  p_reason text,
  p_access_until timestamptz,
  p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.organizations;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform app.assert_platform_admin(p_actor);
  if p_status not in ('trial', 'active', 'read_only', 'suspended') then
    raise exception 'invalid status' using errcode = '23514';
  end if;
  if v_reason is not null and length(v_reason) > 500 then
    raise exception 'reason too long' using errcode = '23514';
  end if;

  select * into v_old from public.organizations o where o.id = p_org for update;
  if not found then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;

  update public.organizations
    set status = p_status,
        access_until = p_access_until,
        status_reason = v_reason,
        status_reason_code = null,
        status_changed_at = now(),
        status_changed_by = p_actor
    where id = p_org;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, changes)
  values (p_org, p_actor, 'organization.status_changed', 'organization', p_org,
          jsonb_build_object('from', v_old.status, 'to', p_status, 'reason', v_reason,
                             'access_until_from', v_old.access_until, 'access_until_to', p_access_until));

  if v_old.status is distinct from p_status then
    insert into public.outbox_events (organization_id, type, payload)
    values (p_org, 'organization.status_changed',
            jsonb_build_object('organization_id', p_org, 'from', v_old.status, 'to', p_status, 'reason', v_reason,
                               'access_until', p_access_until));
  end if;
end;
$$;

create or replace function public.expire_organization_access()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    update public.organizations
      set status = 'read_only',
          status_reason = null,
          status_reason_code = 'access_expired',
          status_changed_at = now()
      where status in ('trial', 'active') and access_until is not null and access_until < now()
      returning id, access_until
  loop
    v_count := v_count + 1;
    insert into public.audit_log (organization_id, action, entity_type, entity_id, changes)
    values (v_row.id, 'organization.access_expired', 'organization', v_row.id,
            jsonb_build_object('access_until', v_row.access_until));
    insert into public.outbox_events (organization_id, type, payload)
    values (v_row.id, 'organization.status_changed',
            jsonb_build_object('organization_id', v_row.id, 'from', 'trial', 'to', 'read_only',
                               'reason', null, 'reason_code', 'access_expired', 'access_until', v_row.access_until));
  end loop;
  return v_count;
end;
$$;

create or replace function app.protect_organization_admin_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and (new.status is distinct from old.status
          or new.access_until is distinct from old.access_until
          or new.status_reason is distinct from old.status_reason
          or new.status_reason_code is distinct from old.status_reason_code
          or new.status_changed_at is distinct from old.status_changed_at
          or new.status_changed_by is distinct from old.status_changed_by) then
    raise exception 'organization status is managed by the platform owner' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.admin_organizations_overview()
returns table (
  organization_id uuid,
  name text,
  slug text,
  status text,
  access_until timestamptz,
  status_reason text,
  created_at timestamptz,
  owner_email text,
  owner_name text,
  staff_count integer,
  active_staff_7d integer,
  clients_count integer,
  new_clients_7d integer,
  portal_clients_count integer,
  sessions_7d integer,
  sessions_30d integer,
  last_sign_in_at timestamptz,
  last_activity_at timestamptz,
  notifications_30d integer,
  push_devices integer,
  notes text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    o.id,
    o.name,
    o.slug,
    o.status,
    o.access_until,
    -- Panel właściciela jest po polsku: kod powodu automatu zamieniamy na tekst
    coalesce(o.status_reason, case o.status_reason_code when 'access_expired' then 'Okres dostępu dobiegł końca' end),
    o.created_at,
    own.email::text,
    own_p.full_name,
    (select count(*)::int from public.organization_members m where m.organization_id = o.id and m.status = 'active'),
    (select count(*)::int from public.organization_members m join auth.users u on u.id = m.user_id
      where m.organization_id = o.id and m.status = 'active' and u.last_sign_in_at >= now() - interval '7 days'),
    (select count(*)::int from public.clients c where c.organization_id = o.id and c.archived_at is null),
    (select count(*)::int from public.clients c where c.organization_id = o.id and c.created_at >= now() - interval '7 days'),
    (select count(distinct a.client_id)::int from public.client_access a where a.organization_id = o.id and a.status = 'active'),
    (select count(*)::int from public.training_sessions s
      where s.organization_id = o.id and s.status <> 'canceled' and s.starts_at >= now() - interval '7 days' and s.starts_at < now() + interval '7 days'),
    (select count(*)::int from public.training_sessions s
      where s.organization_id = o.id and s.status <> 'canceled' and s.starts_at >= now() - interval '30 days' and s.starts_at < now() + interval '30 days'),
    (select max(u.last_sign_in_at) from public.organization_members m join auth.users u on u.id = m.user_id
      where m.organization_id = o.id and m.status = 'active'),
    greatest(
      (select max(al.created_at) from public.audit_log al where al.organization_id = o.id),
      (select max(s.created_at) from public.training_sessions s where s.organization_id = o.id)),
    (select count(*)::int from public.notifications n where n.organization_id = o.id and n.created_at >= now() - interval '30 days'),
    (select count(*)::int from public.push_subscriptions ps
      where ps.user_id in (select m.user_id from public.organization_members m where m.organization_id = o.id and m.status = 'active')),
    ai.notes
  from public.organizations o
  left join lateral (
    select m.user_id from public.organization_members m
    where m.organization_id = o.id and m.role = 'owner' and m.status = 'active' order by m.created_at limit 1
  ) om on true
  left join auth.users own on own.id = om.user_id
  left join public.profiles own_p on own_p.id = om.user_id
  left join public.organization_admin_info ai on ai.organization_id = o.id
  order by o.created_at desc;
$$;
