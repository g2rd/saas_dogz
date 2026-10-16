-- Wolne terminy: lista chętnych klientów, ogłoszenie zwolnionego terminu przez trenera, zgłoszenia „Biorę” w kolejności
-- (kto pierwszy), wybór przez trenera oraz prośba klienta „Nie mogę przyjść”.
-- Zapisy tylko funkcjami `security definer` (sprawdzają rolę lub dostęp klienta i przynależność do organizacji).

-- waitlist_entries: klient zapisany na listę chętnych na wolne terminy ----------------------------------------------------
create table public.waitlist_entries (
  organization_id uuid not null,
  client_id uuid not null primary key,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade
);

create index waitlist_entries_org_idx on public.waitlist_entries (organization_id);

-- slot_offers: ogłoszony wolny termin (zwolnione, odwołane zajęcia); dane terminu są kopią, żeby klient nie czytał cudzych zajęć
create table public.slot_offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  session_id uuid not null,
  session_type_id uuid not null,
  type_name text not null,
  trainer_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  note text check (note is null or length(note) <= 300),
  excluded_client_id uuid,
  status text not null default 'open' check (status in ('open', 'filled', 'closed')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, session_id) references public.training_sessions (organization_id, id)
);

create unique index slot_offers_one_open_per_session_idx on public.slot_offers (session_id) where status = 'open';
create index slot_offers_org_status_idx on public.slot_offers (organization_id, status, starts_at);

-- slot_claims: zgłoszenia „Biorę”; kolejność wyznacza created_at
create table public.slot_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  offer_id uuid not null,
  client_id uuid not null,
  dog_id uuid,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'withdrawn')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id),
  session_id uuid,
  unique (organization_id, id),
  unique (offer_id, client_id),
  foreign key (organization_id, offer_id) references public.slot_offers (organization_id, id) on delete cascade,
  foreign key (organization_id, client_id) references public.clients (organization_id, id),
  foreign key (organization_id, dog_id) references public.dogs (organization_id, id),
  foreign key (organization_id, session_id) references public.training_sessions (organization_id, id)
);

create index slot_claims_offer_idx on public.slot_claims (offer_id, created_at);
create index slot_claims_client_idx on public.slot_claims (client_id, created_at desc);

-- Prośba „Nie mogę przyjść”: klient prosi o odwołanie swoich zajęć (decyzję i rozliczenie podejmuje trener) -------------
alter table public.client_requests add column session_id uuid;
alter table public.client_requests
  add constraint client_requests_session_fk
  foreign key (organization_id, session_id) references public.training_sessions (organization_id, id);

alter table public.client_requests drop constraint client_requests_kind_check;
alter table public.client_requests
  add constraint client_requests_kind_check check (kind in ('renew', 'pay', 'end', 'cancel'));

drop index public.client_requests_open_unique_idx;
create unique index client_requests_open_unique_idx
  on public.client_requests (client_id, kind, coalesce(client_package_id, charge_id, session_id, client_id))
  where status = 'new';

-- RLS ------------------------------------------------------------------------------------------------------------------
alter table public.waitlist_entries enable row level security;
alter table public.slot_offers enable row level security;
alter table public.slot_claims enable row level security;

create policy waitlist_select_staff on public.waitlist_entries
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy waitlist_select_client on public.waitlist_entries
  for select to authenticated
  using (client_id in (select app.client_ids_for_user()));

create policy waitlist_insert_client on public.waitlist_entries
  for insert to authenticated
  with check (client_id in (select app.client_ids_for_user()) and created_by = (select auth.uid()));

create policy waitlist_delete_client on public.waitlist_entries
  for delete to authenticated
  using (client_id in (select app.client_ids_for_user()));

create policy waitlist_delete_staff on public.waitlist_entries
  for delete to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

create policy slot_offers_select_staff on public.slot_offers
  for select to authenticated
  using (app.is_org_member(organization_id));

-- Klient widzi otwarte oferty tylko, gdy jest na liście chętnych w tej organizacji
create policy slot_offers_select_client on public.slot_offers
  for select to authenticated
  using (
    status = 'open'
    and starts_at > now()
    and exists (
      select 1 from public.waitlist_entries w
      where w.organization_id = slot_offers.organization_id
        and w.client_id in (select app.client_ids_for_user())
    )
  );

create policy slot_claims_select_staff on public.slot_claims
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy slot_claims_select_client on public.slot_claims
  for select to authenticated
  using (client_id in (select app.client_ids_for_user()));

-- create_slot_offer: trener ogłasza zwolniony (odwołany) termin ------------------------------------------------------------
create or replace function public.create_slot_offer(p_org uuid, p_session uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session public.training_sessions;
  v_type_name text;
  v_excluded uuid;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not app.has_org_role(p_org, array['owner', 'admin', 'trainer', 'assistant']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_session from public.training_sessions s where s.organization_id = p_org and s.id = p_session;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;
  if v_session.status <> 'canceled' or v_session.starts_at <= now() then
    raise exception 'session is not a free upcoming slot' using errcode = 'DT007';
  end if;
  if exists (
    select 1 from public.training_sessions o
    where o.organization_id = p_org and o.trainer_id = v_session.trainer_id and o.status <> 'canceled'
      and tstzrange(o.starts_at, o.ends_at) && tstzrange(v_session.starts_at, v_session.ends_at)
  ) then
    raise exception 'slot is already taken' using errcode = '23P01';
  end if;

  select t.name into v_type_name
    from public.session_types t where t.organization_id = p_org and t.id = v_session.session_type_id;
  select a.client_id into v_excluded
    from public.session_attendees a where a.organization_id = p_org and a.session_id = p_session limit 1;

  insert into public.slot_offers (
    organization_id, session_id, session_type_id, type_name, trainer_id, starts_at, ends_at, location,
    note, excluded_client_id, created_by
  )
  values (
    p_org, p_session, v_session.session_type_id, coalesce(v_type_name, ''), v_session.trainer_id, v_session.starts_at,
    v_session.ends_at, v_session.location, nullif(btrim(coalesce(p_note, '')), ''), v_excluded, v_user
  )
  returning id into v_id;

  insert into public.outbox_events (organization_id, type, payload)
  values (p_org, 'slot_offer.created',
          jsonb_build_object('offer_id', v_id, 'session_id', p_session, 'exclude_client_id', v_excluded));

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, v_user, 'slot_offer.created', 'slot_offer', v_id);

  return v_id;
exception
  when unique_violation then
    raise exception 'offer already open' using errcode = 'DT008';
end;
$$;

-- close_slot_offer: trener zamyka ogłoszenie; oczekujące zgłoszenia są odrzucane (z powiadomieniem) -----------------------
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

-- claim_slot: klient z listy chętnych zgłasza „Biorę” (idempotentnie) ---------------------------------------------------------
create or replace function public.claim_slot(p_org uuid, p_offer uuid, p_client uuid, p_dog uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_offer public.slot_offers;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.client_access a
    where a.organization_id = p_org and a.client_id = p_client and a.user_id = v_user and a.status = 'active'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.waitlist_entries w where w.organization_id = p_org and w.client_id = p_client) then
    raise exception 'not on the waitlist' using errcode = '42501';
  end if;

  -- Blokada oferty serializuje równoległe zgłoszenia, a stan czytamy dopiero po jej uzyskaniu
  perform 1 from public.slot_offers o where o.organization_id = p_org and o.id = p_offer for update;
  if not found then
    raise exception 'offer not found' using errcode = 'P0002';
  end if;
  select * into v_offer from public.slot_offers o where o.id = p_offer;
  if v_offer.status <> 'open' or v_offer.starts_at <= now() then
    raise exception 'offer is not open' using errcode = 'DT009';
  end if;

  if p_dog is not null and not exists (
    select 1 from public.dogs d
    where d.organization_id = p_org and d.id = p_dog and d.client_id = p_client and d.approval_status = 'approved'
  ) then
    raise exception 'dog not found' using errcode = 'P0002';
  end if;

  select c.id into v_id from public.slot_claims c
    where c.offer_id = p_offer and c.client_id = p_client and c.status = 'pending';
  if found then
    return jsonb_build_object('id', v_id, 'created', false);
  end if;

  insert into public.slot_claims (organization_id, offer_id, client_id, dog_id)
  values (p_org, p_offer, p_client, p_dog)
  on conflict (offer_id, client_id) do update
    set status = 'pending', dog_id = excluded.dog_id, created_at = now(), decided_at = null, decided_by = null
  returning id into v_id;

  insert into public.outbox_events (organization_id, type, payload)
  values (p_org, 'slot_claim.created', jsonb_build_object('claim_id', v_id, 'offer_id', p_offer, 'client_id', p_client));

  return jsonb_build_object('id', v_id, 'created', true);
end;
$$;

-- withdraw_slot_claim: klient wycofuje swoje oczekujące zgłoszenie ----------------------------------------------------------
create or replace function public.withdraw_slot_claim(p_org uuid, p_claim uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  update public.slot_claims c
    set status = 'withdrawn', decided_at = now()
    where c.organization_id = p_org and c.id = p_claim and c.status = 'pending'
      and exists (
        select 1 from public.client_access a
        where a.client_id = c.client_id and a.user_id = v_user and a.status = 'active'
      );
  if not found then
    raise exception 'claim not found' using errcode = 'P0002';
  end if;
end;
$$;

-- accept_slot_claim: trener wybiera zgłoszenie; powstają zajęcia, pozostali są odrzucani, wybrany dostaje komunikat ---------------
create or replace function public.accept_slot_claim(p_org uuid, p_claim uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_claim public.slot_claims;
  v_offer public.slot_offers;
  v_session uuid;
  v_other record;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not app.has_org_role(p_org, array['owner', 'admin', 'trainer', 'assistant']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into v_claim from public.slot_claims c where c.organization_id = p_org and c.id = p_claim;
  if not found then
    raise exception 'claim not found' using errcode = 'P0002';
  end if;

  perform 1 from public.slot_offers o where o.organization_id = p_org and o.id = v_claim.offer_id for update;
  select * into v_offer from public.slot_offers o where o.id = v_claim.offer_id;
  select * into v_claim from public.slot_claims c where c.id = p_claim;

  if v_offer.status <> 'open' or v_claim.status <> 'pending' then
    raise exception 'offer is not open' using errcode = 'DT009';
  end if;
  if v_offer.starts_at <= now() then
    raise exception 'offer is not open' using errcode = 'DT009';
  end if;

  -- Rezerwacja zwykłą funkcją planowania (kolizje terminu trenera, zatwierdzony pies, uprawnienia)
  v_session := public.schedule_session(
    p_org, v_offer.session_type_id, v_offer.trainer_id, v_offer.starts_at, v_offer.location,
    v_claim.client_id, v_claim.dog_id);

  update public.slot_claims
    set status = 'accepted', decided_at = now(), decided_by = v_user, session_id = v_session
    where id = p_claim;
  update public.slot_offers set status = 'filled', closed_at = now() where id = v_offer.id;

  insert into public.outbox_events (organization_id, type, payload)
  values (p_org, 'slot_claim.accepted',
          jsonb_build_object('claim_id', p_claim, 'client_id', v_claim.client_id, 'session_id', v_session,
                             'offer_id', v_offer.id));

  for v_other in
    update public.slot_claims
      set status = 'declined', decided_at = now(), decided_by = v_user
      where offer_id = v_offer.id and status = 'pending' and id <> p_claim
      returning id, client_id
  loop
    insert into public.outbox_events (organization_id, type, payload)
    values (p_org, 'slot_claim.declined',
            jsonb_build_object('claim_id', v_other.id, 'offer_id', v_offer.id, 'client_id', v_other.client_id));
  end loop;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, v_user, 'slot_claim.accepted', 'slot_claim', p_claim);

  return v_session;
end;
$$;

-- create_client_request: nowa wersja z opcjonalną sesją (rodzaj „cancel”: klient nie może przyjść) -----------------------------
drop function public.create_client_request(uuid, uuid, text, uuid, uuid, text);

create or replace function public.create_client_request(
  p_org uuid,
  p_client uuid,
  p_kind text,
  p_package uuid,
  p_charge uuid,
  p_note text,
  p_session uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_kind not in ('renew', 'pay', 'end', 'cancel') then
    raise exception 'invalid request kind' using errcode = '23514';
  end if;
  if (p_kind = 'cancel') <> (p_session is not null) then
    raise exception 'session is required for cancel requests only' using errcode = '23514';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'note too long' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.client_access a
    where a.organization_id = p_org and a.client_id = p_client and a.user_id = v_user and a.status = 'active'
  ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_package is not null and not exists (
    select 1 from public.client_packages p
    where p.organization_id = p_org and p.id = p_package and p.client_id = p_client
  ) then
    raise exception 'package not found' using errcode = 'P0002';
  end if;
  if p_charge is not null and not exists (
    select 1 from public.charges c
    where c.organization_id = p_org and c.id = p_charge and c.client_id = p_client and c.voided_at is null
  ) then
    raise exception 'charge not found' using errcode = 'P0002';
  end if;
  if p_session is not null and not exists (
    select 1
      from public.session_attendees sa
      join public.training_sessions s on s.organization_id = sa.organization_id and s.id = sa.session_id
      where sa.organization_id = p_org and sa.session_id = p_session and sa.client_id = p_client
        and sa.attendance = 'planned' and s.status = 'scheduled' and s.starts_at > now()
  ) then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  perform 1 from public.clients c where c.organization_id = p_org and c.id = p_client for update;

  select r.id into v_id
    from public.client_requests r
    where r.client_id = p_client
      and r.kind = p_kind
      and coalesce(r.client_package_id, r.charge_id, r.session_id, r.client_id)
          = coalesce(p_package, p_charge, p_session, p_client)
      and r.status = 'new';
  if found then
    return jsonb_build_object('id', v_id, 'created', false);
  end if;

  insert into public.client_requests (organization_id, client_id, client_package_id, charge_id, session_id, kind, note, created_by)
  values (p_org, p_client, p_package, p_charge, p_session, p_kind, v_note, v_user)
  returning id into v_id;

  insert into public.outbox_events (organization_id, type, payload)
  values (p_org, 'client_request.created',
          jsonb_build_object('request_id', v_id, 'client_id', p_client, 'kind', p_kind,
                             'client_package_id', p_package, 'charge_id', p_charge, 'session_id', p_session));

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, changes)
  values (p_org, v_user, 'client_request.created', 'client_request', v_id, jsonb_build_object('kind', p_kind));

  return jsonb_build_object('id', v_id, 'created', true);
end;
$$;

revoke execute on function public.create_slot_offer(uuid, uuid, text) from public, anon;
revoke execute on function public.close_slot_offer(uuid, uuid) from public, anon;
revoke execute on function public.claim_slot(uuid, uuid, uuid, uuid) from public, anon;
revoke execute on function public.withdraw_slot_claim(uuid, uuid) from public, anon;
revoke execute on function public.accept_slot_claim(uuid, uuid) from public, anon;
revoke execute on function public.create_client_request(uuid, uuid, text, uuid, uuid, text, uuid) from public, anon;
grant execute on function public.create_slot_offer(uuid, uuid, text) to authenticated;
grant execute on function public.close_slot_offer(uuid, uuid) to authenticated;
grant execute on function public.claim_slot(uuid, uuid, uuid, uuid) to authenticated;
grant execute on function public.withdraw_slot_claim(uuid, uuid) to authenticated;
grant execute on function public.accept_slot_claim(uuid, uuid) to authenticated;
grant execute on function public.create_client_request(uuid, uuid, text, uuid, uuid, text, uuid) to authenticated;
