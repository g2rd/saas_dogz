-- Moduł scheduling (wersja minimalna): typy zajęć, zajęcia indywidualne z klientem i psem,
-- oznaczanie jako odbyte (atomowo zużywa zajęcie z pakietu) i odwoływanie.
-- Zapisy przez funkcje SQL, odczyt przez RLS. Zajęcia grupowe, serie i miejsca dojdą później.

create extension if not exists btree_gist with schema extensions;

-- session_types ----------------------------------------------------------------------------------
create table public.session_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  default_price_minor integer not null default 0 check (default_price_minor >= 0),
  currency text not null default 'PLN' check (currency ~ '^[A-Z]{3}$'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, id)
);

create index session_types_org_idx on public.session_types (organization_id, name);

create trigger session_types_set_updated_at
  before update on public.session_types
  for each row execute function app.set_updated_at();

-- training_sessions ------------------------------------------------------------------------------
create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  session_type_id uuid not null,
  trainer_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'canceled')),
  client_summary text,
  completed_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, id),
  check (ends_at > starts_at),
  foreign key (organization_id, session_type_id) references public.session_types (organization_id, id),
  foreign key (organization_id, trainer_id)
    references public.organization_members (organization_id, user_id),
  -- Trener nie może prowadzić dwóch zajęć naraz (odwołane zwalniają termin).
  constraint training_sessions_no_trainer_overlap exclude using gist (
    organization_id with =,
    trainer_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'canceled')
);

create index training_sessions_org_start_idx on public.training_sessions (organization_id, starts_at);

create trigger training_sessions_set_updated_at
  before update on public.training_sessions
  for each row execute function app.set_updated_at();

-- session_attendees ----------------------------------------------------------------------------------
create table public.session_attendees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  session_id uuid not null,
  client_id uuid not null,
  dog_id uuid,
  attendance text not null default 'planned'
    check (attendance in ('planned', 'attended', 'canceled', 'late_canceled', 'no_show')),
  client_package_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, id),
  unique (session_id, client_id),
  foreign key (organization_id, session_id)
    references public.training_sessions (organization_id, id) on delete cascade,
  foreign key (organization_id, client_id) references public.clients (organization_id, id),
  foreign key (organization_id, dog_id) references public.dogs (organization_id, id),
  foreign key (organization_id, client_package_id) references public.client_packages (organization_id, id)
);

create index session_attendees_client_idx on public.session_attendees (organization_id, client_id);

create trigger session_attendees_set_updated_at
  before update on public.session_attendees
  for each row execute function app.set_updated_at();

-- Wpisy dziennika pakietu wskazują teraz na uczestnika zajęć
alter table public.package_ledger
  add constraint package_ledger_attendee_fk
  foreign key (organization_id, attendee_id) references public.session_attendees (organization_id, id);

-- Widok szczegółów zajęć (security_invoker: RLS obowiązuje) ------------------------------------------------
create view public.v_session_details
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
  a.client_package_id
from public.training_sessions s
join public.session_types t on t.organization_id = s.organization_id and t.id = s.session_type_id
left join public.profiles p on p.id = s.trainer_id
left join public.session_attendees a on a.organization_id = s.organization_id and a.session_id = s.id
left join public.clients c on c.organization_id = a.organization_id and c.id = a.client_id
left join public.dogs d on d.organization_id = a.organization_id and d.id = a.dog_id;

-- Funkcje pomocnicze ----------------------------------------------------------------------------------------
create or replace function app.is_client_of_org(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_access a
    where a.organization_id = org
      and a.user_id = (select auth.uid())
      and a.status = 'active'
  );
$$;

create or replace function app.client_can_see_session(sess uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.session_attendees sa
    join public.client_access a on a.client_id = sa.client_id
    where sa.session_id = sess
      and a.user_id = (select auth.uid())
      and a.status = 'active'
  );
$$;

-- Wybiera i blokuje pakiet klienta z wolnym zajęciem: wskazany albo pierwszy kończący się ważnością.
-- Blokada wiersza pakietu, a saldo liczone osobnym zapytaniem już po jej uzyskaniu (READ COMMITTED),
-- więc równoległe rozliczenia nie zużyją tego samego ostatniego zajęcia.
create or replace function app.pick_package(p_org uuid, p_client uuid, p_date date, p_preferred uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate uuid;
  v_balance integer;
begin
  for v_candidate in
    select p.id
    from public.client_packages p
    where p.organization_id = p_org
      and p.client_id = p_client
      and p.canceled_at is null
      and p.valid_from <= p_date
      and (p.valid_until is null or p.valid_until >= p_date)
      and (p_preferred is null or p.id = p_preferred)
    order by p.valid_until nulls last, p.created_at
  loop
    perform 1 from public.client_packages where organization_id = p_org and id = v_candidate for update;

    select coalesce(sum(l.delta), 0) into v_balance
      from public.package_ledger l
      where l.organization_id = p_org and l.client_package_id = v_candidate;

    if v_balance >= 1 then
      return v_candidate;
    end if;
  end loop;

  return null;
end;
$$;

revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;

-- RLS --------------------------------------------------------------------------------------------------------
alter table public.session_types enable row level security;
alter table public.training_sessions enable row level security;
alter table public.session_attendees enable row level security;

create policy session_types_select_staff on public.session_types
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy session_types_select_client on public.session_types
  for select to authenticated
  using (app.is_client_of_org(organization_id));

create policy session_types_insert on public.session_types
  for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

create policy session_types_update on public.session_types
  for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']))
  with check (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

-- Zajęcia i uczestnicy: personel widzi wszystko w organizacji, klient swoje; zapis tylko przez funkcje
create policy training_sessions_select_staff on public.training_sessions
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy training_sessions_select_client on public.training_sessions
  for select to authenticated
  using (app.client_can_see_session(id));

create policy session_attendees_select_staff on public.session_attendees
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy session_attendees_select_client on public.session_attendees
  for select to authenticated
  using (client_id in (select app.client_ids_for_user()));

-- schedule_session: zajęcia + uczestnik + zdarzenie + audyt, atomowo -----------------------------------------------
create or replace function public.schedule_session(
  p_org uuid,
  p_type uuid,
  p_trainer uuid,
  p_starts_at timestamptz,
  p_location text,
  p_client uuid,
  p_dog uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_duration integer;
  v_session uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not app.has_org_role(p_org, array['owner', 'admin', 'trainer', 'assistant']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select t.duration_minutes into v_duration
    from public.session_types t
    where t.organization_id = p_org and t.id = p_type and t.archived_at is null;
  if not found then
    raise exception 'session type not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = p_trainer and m.status = 'active'
      and m.role in ('owner', 'admin', 'trainer')
  ) then
    raise exception 'trainer not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.clients where organization_id = p_org and id = p_client and archived_at is null
  ) then
    raise exception 'client not found' using errcode = 'P0002';
  end if;

  if p_dog is not null and not exists (
    select 1 from public.dogs where organization_id = p_org and id = p_dog and client_id = p_client
  ) then
    raise exception 'dog not found' using errcode = 'P0002';
  end if;

  insert into public.training_sessions (
    organization_id, session_type_id, trainer_id, starts_at, ends_at, location, created_by
  )
  values (
    p_org, p_type, p_trainer, p_starts_at, p_starts_at + make_interval(mins => v_duration),
    nullif(btrim(coalesce(p_location, '')), ''), v_user
  )
  returning id into v_session;

  insert into public.session_attendees (organization_id, session_id, client_id, dog_id, created_by)
  values (p_org, v_session, p_client, p_dog, v_user);

  insert into public.outbox_events (organization_id, type, payload)
  values (p_org, 'training_session.scheduled',
          jsonb_build_object('session_id', v_session, 'client_id', p_client, 'starts_at', p_starts_at));

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, v_user, 'training_session.scheduled', 'training_session', v_session);

  return v_session;
end;
$$;

-- complete_session: odbyte zajęcia zużywają jedno zajęcie z pakietu (wskazanego lub wybranego automatycznie).
-- Bez pakietu: błąd DT001, chyba że p_without_package (wtedy należność za pojedyncze zajęcia z ceny typu). -------------
create or replace function public.complete_session(
  p_org uuid,
  p_session uuid,
  p_package uuid,
  p_note text,
  p_without_package boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session public.training_sessions;
  v_attendee public.session_attendees;
  v_type public.session_types;
  v_tz text;
  v_date date;
  v_package uuid;
  v_package_name text;
  v_balance integer;
  v_charge uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not app.has_org_role(p_org, array['owner', 'admin', 'trainer', 'assistant']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(p_without_package, false) and not app.has_org_role(p_org, array['owner', 'admin', 'trainer']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Blokada zajęć; stan czytamy osobnym zapytaniem po jej uzyskaniu.
  perform 1 from public.training_sessions where organization_id = p_org and id = p_session for update;
  if not found then
    raise exception 'session not found' using errcode = 'P0002';
  end if;

  select * into v_session from public.training_sessions where organization_id = p_org and id = p_session;
  if v_session.status <> 'scheduled' then
    raise exception 'session is not scheduled' using errcode = 'DT002';
  end if;

  select * into v_attendee from public.session_attendees where organization_id = p_org and session_id = p_session;
  if not found then
    raise exception 'session has no attendee' using errcode = 'P0002';
  end if;

  select coalesce(
           (select s.timezone from public.organization_settings s where s.organization_id = p_org),
           'Europe/Warsaw')
    into v_tz;
  v_date := (v_session.starts_at at time zone v_tz)::date;

  v_package := app.pick_package(p_org, v_attendee.client_id, v_date, p_package);

  if v_package is null then
    if p_package is not null or not coalesce(p_without_package, false) then
      raise exception 'no package with free sessions' using errcode = 'DT001';
    end if;

    select * into v_type from public.session_types where organization_id = p_org and id = v_session.session_type_id;
    if v_type.default_price_minor > 0 then
      insert into public.charges (
        organization_id, client_id, source_type, source_id, amount_minor, currency, due_date, description, created_by
      )
      values (
        p_org, v_attendee.client_id, 'session', p_session, v_type.default_price_minor, v_type.currency,
        v_date, v_type.name, v_user
      )
      returning id into v_charge;
    end if;
  else
    insert into public.package_ledger (organization_id, client_package_id, delta, reason, attendee_id, created_by)
    values (p_org, v_package, -1, 'session', v_attendee.id, v_user);

    select coalesce(sum(l.delta), 0), (select p.name from public.client_packages p where p.organization_id = p_org and p.id = v_package)
      into v_balance, v_package_name
      from public.package_ledger l
      where l.organization_id = p_org and l.client_package_id = v_package;
  end if;

  update public.training_sessions
    set status = 'completed',
        completed_at = now(),
        client_summary = nullif(btrim(coalesce(p_note, '')), '')
    where organization_id = p_org and id = p_session;

  update public.session_attendees
    set attendance = 'attended', client_package_id = v_package
    where organization_id = p_org and id = v_attendee.id;

  insert into public.outbox_events (organization_id, type, payload)
  values (p_org, 'training_session.completed',
          jsonb_build_object('session_id', p_session, 'client_id', v_attendee.client_id, 'package_id', v_package));

  if v_package is not null and v_balance <= 2 then
    insert into public.outbox_events (organization_id, type, payload)
    values (p_org, 'client_package.low_balance',
            jsonb_build_object('client_package_id', v_package, 'client_id', v_attendee.client_id, 'balance', v_balance));
  end if;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, v_user, 'training_session.completed', 'training_session', p_session);

  return jsonb_build_object(
    'package_id', v_package,
    'package_name', v_package_name,
    'balance_after', v_balance,
    'charge_id', v_charge
  );
end;
$$;

-- cancel_session: odwołanie; z p_consume zajęcie przepada (późne odwołanie), o ile klient ma pakiet ----------------
create or replace function public.cancel_session(p_org uuid, p_session uuid, p_consume boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_session public.training_sessions;
  v_attendee public.session_attendees;
  v_tz text;
  v_date date;
  v_package uuid;
  v_balance integer;
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
  if v_session.status <> 'scheduled' then
    raise exception 'session is not scheduled' using errcode = 'DT002';
  end if;

  select * into v_attendee from public.session_attendees where organization_id = p_org and session_id = p_session;

  if coalesce(p_consume, false) then
    select coalesce(
             (select s.timezone from public.organization_settings s where s.organization_id = p_org),
             'Europe/Warsaw')
      into v_tz;
    v_date := (v_session.starts_at at time zone v_tz)::date;
    v_package := app.pick_package(p_org, v_attendee.client_id, v_date, null);

    if v_package is not null then
      insert into public.package_ledger (organization_id, client_package_id, delta, reason, attendee_id, created_by)
      values (p_org, v_package, -1, 'late_cancel', v_attendee.id, v_user);

      select coalesce(sum(l.delta), 0) into v_balance
        from public.package_ledger l
        where l.organization_id = p_org and l.client_package_id = v_package;
    end if;
  end if;

  update public.training_sessions
    set status = 'canceled', canceled_at = now()
    where organization_id = p_org and id = p_session;

  update public.session_attendees
    set attendance = case when coalesce(p_consume, false) then 'late_canceled' else 'canceled' end,
        client_package_id = v_package
    where organization_id = p_org and id = v_attendee.id;

  insert into public.outbox_events (organization_id, type, payload)
  values (p_org, 'training_session.canceled',
          jsonb_build_object('session_id', p_session, 'client_id', v_attendee.client_id, 'consumed', v_package is not null));

  if v_package is not null and v_balance <= 2 then
    insert into public.outbox_events (organization_id, type, payload)
    values (p_org, 'client_package.low_balance',
            jsonb_build_object('client_package_id', v_package, 'client_id', v_attendee.client_id, 'balance', v_balance));
  end if;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, changes)
  values (p_org, v_user, 'training_session.canceled', 'training_session', p_session,
          jsonb_build_object('consumed', v_package is not null));

  return jsonb_build_object('consumed', v_package is not null, 'package_id', v_package, 'balance_after', v_balance);
end;
$$;

revoke execute on function public.schedule_session(uuid, uuid, uuid, timestamptz, text, uuid, uuid) from public, anon;
revoke execute on function public.complete_session(uuid, uuid, uuid, text, boolean) from public, anon;
revoke execute on function public.cancel_session(uuid, uuid, boolean) from public, anon;
grant execute on function public.schedule_session(uuid, uuid, uuid, timestamptz, text, uuid, uuid) to authenticated;
grant execute on function public.complete_session(uuid, uuid, uuid, text, boolean) to authenticated;
grant execute on function public.cancel_session(uuid, uuid, boolean) to authenticated;
