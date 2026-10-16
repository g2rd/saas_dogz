-- Cofanie pomyłek: 30-sekundowe okno przed wysłaniem powiadomień wywołanych przez trenera, cofnięcie zakończenia i odwołania
-- zajęć, storno wpłaty i anulowanie pakietu. Rejestry zostają „tylko do dopisywania”: cofnięcie to zapis kompensujący z wpisem
-- w audycie, a nie kasowanie historii.

-- Outbox: opóźnienie wysyłki (okno cofnięcia) ---------------------------------------------------------------------------------
alter table public.outbox_events add column not_before timestamptz;

create or replace function public.claim_outbox_events(p_limit integer default 20)
returns setof public.outbox_events
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with picked as (
    select e.id
      from public.outbox_events e
      where e.processed_at is null
        and e.attempts < 5
        and (e.not_before is null or e.not_before <= now())
        and (e.locked_until is null or e.locked_until < now())
      order by e.created_at
      limit greatest(least(p_limit, 100), 1)
      for update skip locked
  )
  update public.outbox_events e
    set locked_until = now() + interval '5 minutes',
        attempts = e.attempts + 1
    from picked
    where e.id = picked.id
    returning e.*;
end;
$$;

revoke execute on function public.claim_outbox_events(integer) from public, anon, authenticated;
grant execute on function public.claim_outbox_events(integer) to service_role;

-- Wycofanie z kolejki zdarzeń, które jeszcze nie wyszły; zwraca liczbę wycofanych
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
    set processed_at = now(), last_error = 'cofnięte przed wysłaniem', locked_until = null
    where organization_id = p_org
      and processed_at is null
      and type = any (p_types)
      and payload ->> p_key = p_value;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Zdarzenia wywołane akcją trenera czekają 30 s (okno „Cofnij”); zaplanowanie i odwołanie tych samych zajęć w tym czasie znoszą się.
create or replace function app.outbox_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dropped integer;
begin
  if new.type in (
    'training_session.scheduled', 'training_session.canceled', 'training_session.restored',
    'slot_offer.created', 'slot_claim.accepted', 'slot_claim.declined',
    'payment.recorded', 'payment.voided', 'client_package.low_balance'
  ) and new.not_before is null then
    new.not_before := now() + interval '30 seconds';
  end if;

  if new.type = 'training_session.canceled' and new.organization_id is not null then
    v_dropped := app.drop_pending_events(new.organization_id, array['training_session.scheduled'], 'session_id', new.payload ->> 'session_id');
    if v_dropped > 0 then
      new.processed_at := now();
      new.last_error := 'zniesione z zaplanowaniem';
    end if;
  end if;
  return new;
end;
$$;

create trigger outbox_events_before_insert
  before insert on public.outbox_events
  for each row execute function app.outbox_before_insert();

-- Storno wpłaty: wpłata zostaje w historii jako anulowana, alokacje są zdejmowane z należności -------------------------------------
alter table public.payments add column voided_at timestamptz;
alter table public.payments add column voided_by uuid references auth.users (id);

create or replace view public.v_client_balance
with (security_invoker = true) as
select
  cl.organization_id,
  cl.id as client_id,
  coalesce((
    select sum(c.amount_minor)
    from public.charges c
    where c.organization_id = cl.organization_id and c.client_id = cl.id and c.voided_at is null
  ), 0)::integer as charged_minor,
  coalesce((
    select sum(a.amount_minor)
    from public.payment_allocations a
    join public.charges c on c.organization_id = a.organization_id and c.id = a.charge_id
    where c.organization_id = cl.organization_id and c.client_id = cl.id and c.voided_at is null
  ), 0)::integer as allocated_minor,
  coalesce((
    select sum(p.amount_minor)
    from public.payments p
    where p.organization_id = cl.organization_id and p.client_id = cl.id and p.voided_at is null
  ), 0)::integer as paid_minor
from public.clients cl;

create or replace function public.void_payment(p_org uuid, p_payment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_payment public.payments;
  v_dropped integer;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not app.has_org_role(p_org, array['owner', 'admin', 'trainer']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform 1 from public.payments where organization_id = p_org and id = p_payment for update;
  if not found then
    raise exception 'payment not found' using errcode = 'P0002';
  end if;
  select * into v_payment from public.payments where organization_id = p_org and id = p_payment;
  if v_payment.voided_at is not null then
    raise exception 'payment already voided' using errcode = 'DT014';
  end if;

  delete from public.payment_allocations where organization_id = p_org and payment_id = p_payment;
  update public.payments set voided_at = now(), voided_by = v_user where organization_id = p_org and id = p_payment;

  -- Klient jeszcze nie dostał „Zaksięgowano wpłatę”: wycofujemy je po cichu; w przeciwnym razie informujemy o anulowaniu
  v_dropped := app.drop_pending_events(p_org, array['payment.recorded'], 'payment_id', p_payment::text);
  if v_dropped = 0 then
    insert into public.outbox_events (organization_id, type, payload)
    values (p_org, 'payment.voided',
            jsonb_build_object('payment_id', p_payment, 'client_id', v_payment.client_id,
                               'amount_minor', v_payment.amount_minor, 'currency', v_payment.currency));
  end if;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, changes)
  values (p_org, v_user, 'payment.voided', 'payment', p_payment, jsonb_build_object('amount_minor', v_payment.amount_minor));
end;
$$;

-- Anulowanie pakietu: tylko nieużywany; nieopłacona należność za pakiet jest anulowana razem z nim --------------------------------
create or replace function public.cancel_package(p_org uuid, p_package uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_charge public.charges;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not app.has_org_role(p_org, array['owner', 'admin', 'trainer']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform 1 from public.client_packages where organization_id = p_org and id = p_package and canceled_at is null for update;
  if not found then
    raise exception 'package not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.package_ledger l
    where l.organization_id = p_org and l.client_package_id = p_package and l.reason <> 'purchase'
  ) then
    raise exception 'package was used' using errcode = 'DT011';
  end if;

  for v_charge in
    select * from public.charges
      where organization_id = p_org and source_type = 'client_package' and source_id = p_package and voided_at is null
      for update
  loop
    if exists (select 1 from public.payment_allocations where organization_id = p_org and charge_id = v_charge.id) then
      raise exception 'package charge is paid' using errcode = 'DT010';
    end if;
    update public.charges set voided_at = now() where id = v_charge.id;
  end loop;

  update public.client_packages set canceled_at = now() where organization_id = p_org and id = p_package;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, v_user, 'client_package.canceled', 'client_package', p_package);
end;
$$;

-- Cofnięcie zakończenia zajęć (do końca dnia): zajęcie wraca do pakietu, nieopłacona należność za zajęcia jest anulowana ----------
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
    insert into public.package_ledger (organization_id, client_package_id, delta, reason, note, attendee_id, created_by)
    values (p_org, v_attendee.client_package_id, 1, 'adjustment', 'Cofnięcie zakończenia zajęć', v_attendee.id, v_user);
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

-- Przywrócenie odwołanych zajęć (przed ich rozpoczęciem): zajęcie wraca do pakietu, ogłoszenie terminu jest zamykane -----------------
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
    insert into public.package_ledger (organization_id, client_package_id, delta, reason, note, attendee_id, created_by)
    values (p_org, v_attendee.client_package_id, 1, 'adjustment', 'Przywrócenie odwołanych zajęć', v_attendee.id, v_user);
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

-- close_slot_offer: zamknięcie ogłoszenia wycofuje jeszcze niewysłane powiadomienie o wolnym terminie ------------------------------
create or replace function public.close_slot_offer(p_org uuid, p_offer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_claim record;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not app.has_org_role(p_org, array['owner', 'admin', 'trainer', 'assistant']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform 1 from public.slot_offers o where o.organization_id = p_org and o.id = p_offer for update;
  if not found then
    raise exception 'offer not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.slot_offers o where o.id = p_offer and o.status = 'open') then
    raise exception 'offer is not open' using errcode = 'DT009';
  end if;

  update public.slot_offers set status = 'closed', closed_at = now() where id = p_offer;
  perform app.drop_pending_events(p_org, array['slot_offer.created'], 'offer_id', p_offer::text);

  for v_claim in
    update public.slot_claims
      set status = 'declined', decided_at = now(), decided_by = v_user
      where offer_id = p_offer and status = 'pending'
      returning id, client_id
  loop
    insert into public.outbox_events (organization_id, type, payload)
    values (p_org, 'slot_claim.declined',
            jsonb_build_object('claim_id', v_claim.id, 'offer_id', p_offer, 'client_id', v_claim.client_id));
  end loop;
end;
$$;

revoke execute on function public.void_payment(uuid, uuid) from public, anon;
revoke execute on function public.cancel_package(uuid, uuid) from public, anon;
revoke execute on function public.undo_complete_session(uuid, uuid) from public, anon;
revoke execute on function public.undo_cancel_session(uuid, uuid) from public, anon;
revoke execute on function public.close_slot_offer(uuid, uuid) from public, anon;
grant execute on function public.void_payment(uuid, uuid) to authenticated;
grant execute on function public.cancel_package(uuid, uuid) to authenticated;
grant execute on function public.undo_complete_session(uuid, uuid) to authenticated;
grant execute on function public.undo_cancel_session(uuid, uuid) to authenticated;
grant execute on function public.close_slot_offer(uuid, uuid) to authenticated;


-- v_session_details: dodajemy czas zakończenia zajęć (do okna „Cofnij zakończenie”)
create or replace view public.v_session_details
with (security_invoker = true) as
select
  s.id,
  s.organization_id,
  s.session_type_id,
  t.name as type_name,
  t.duration_minutes,
  t.default_price_minor,
  t.currency,
  s.trainer_id,
  p.full_name as trainer_name,
  s.starts_at,
  s.ends_at,
  s.location,
  s.status,
  s.client_summary,
  a.id as attendee_id,
  a.client_id,
  c.first_name as client_first_name,
  c.last_name as client_last_name,
  a.dog_id,
  d.name as dog_name,
  a.attendance,
  a.client_package_id,
  s.completed_at
from public.training_sessions s
join public.session_types t on t.organization_id = s.organization_id and t.id = s.session_type_id
left join public.profiles p on p.id = s.trainer_id
left join public.session_attendees a on a.organization_id = s.organization_id and a.session_id = s.id
left join public.clients c on c.organization_id = a.organization_id and c.id = a.client_id
left join public.dogs d on d.organization_id = a.organization_id and d.id = a.dog_id;

revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
