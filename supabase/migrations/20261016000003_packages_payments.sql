-- Moduły packages i payments: szablony pakietów, pakiety klientów z dziennikiem zużyć,
-- należności, wpłaty i alokacje. Zapisy przez funkcje SQL (atomowo), odczyt przez RLS.

-- package_templates -------------------------------------------------------------------------
create table public.package_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  sessions_count integer not null check (sessions_count between 1 and 500),
  validity_days integer check (validity_days is null or validity_days between 1 and 3650),
  price_minor integer not null check (price_minor >= 0),
  currency text not null default 'PLN' check (currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, id)
);

create index package_templates_org_idx on public.package_templates (organization_id, name);

create trigger package_templates_set_updated_at
  before update on public.package_templates
  for each row execute function app.set_updated_at();

-- client_packages: pakiet sprzedany klientowi (migawka nazwy, liczby zajęć i ceny) ------------------
create table public.client_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  dog_id uuid,
  package_template_id uuid,
  name text not null check (length(btrim(name)) > 0),
  sessions_total integer not null check (sessions_total > 0),
  valid_from date not null default current_date,
  valid_until date,
  price_minor integer not null check (price_minor >= 0),
  currency text not null default 'PLN' check (currency ~ '^[A-Z]{3}$'),
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, id),
  check (valid_until is null or valid_until >= valid_from),
  foreign key (organization_id, client_id) references public.clients (organization_id, id),
  foreign key (organization_id, dog_id) references public.dogs (organization_id, id),
  foreign key (organization_id, package_template_id) references public.package_templates (organization_id, id)
);

create index client_packages_client_idx on public.client_packages (organization_id, client_id, created_at desc);

create trigger client_packages_set_updated_at
  before update on public.client_packages
  for each row execute function app.set_updated_at();

-- package_ledger: dziennik zmian salda (tylko dopisywanie) ---------------------------------------------
create table public.package_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_package_id uuid not null,
  delta integer not null check (delta <> 0),
  reason text not null check (reason in ('purchase', 'session', 'late_cancel', 'adjustment', 'refund', 'expiry')),
  note text,
  attendee_id uuid,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (organization_id, client_package_id)
    references public.client_packages (organization_id, id)
);

create index package_ledger_package_idx on public.package_ledger (organization_id, client_package_id, created_at);

create or replace function app.forbid_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% on % is not allowed (append-only)', tg_op, tg_table_name using errcode = '42501';
end;
$$;

create trigger package_ledger_append_only
  before update or delete on public.package_ledger
  for each row execute function app.forbid_mutation();

-- charges: należności ------------------------------------------------------------------------------------
create table public.charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  source_type text not null default 'manual' check (source_type in ('client_package', 'session', 'manual')),
  source_id uuid,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'PLN' check (currency ~ '^[A-Z]{3}$'),
  due_date date not null,
  description text not null default '',
  voided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, id),
  foreign key (organization_id, client_id) references public.clients (organization_id, id)
);

create index charges_client_idx on public.charges (organization_id, client_id, due_date);

create trigger charges_set_updated_at
  before update on public.charges
  for each row execute function app.set_updated_at();

-- payments: wpłaty --------------------------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null default 'PLN' check (currency ~ '^[A-Z]{3}$'),
  paid_at timestamptz not null default now(),
  method text not null check (method in ('cash', 'transfer', 'blik', 'card', 'other')),
  reference text,
  recorded_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, client_id) references public.clients (organization_id, id)
);

create index payments_client_idx on public.payments (organization_id, client_id, paid_at desc);

-- payment_allocations: rozliczenie wpłaty na należności (wpłata może pokryć kilka należności) ----------------------
create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  payment_id uuid not null,
  charge_id uuid not null,
  amount_minor integer not null check (amount_minor > 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (payment_id, charge_id),
  foreign key (organization_id, payment_id) references public.payments (organization_id, id),
  foreign key (organization_id, charge_id) references public.charges (organization_id, id)
);

create index payment_allocations_charge_idx on public.payment_allocations (organization_id, charge_id);

-- Widoki (security_invoker: obowiązuje RLS tabel bazowych) ------------------------------------------------------
create view public.v_client_package_balance
with (security_invoker = true) as
select
  p.id,
  p.organization_id,
  p.client_id,
  p.dog_id,
  p.package_template_id,
  p.name,
  p.sessions_total,
  p.valid_from,
  p.valid_until,
  p.price_minor,
  p.currency,
  p.canceled_at,
  p.created_at,
  coalesce((
    select sum(l.delta)
    from public.package_ledger l
    where l.organization_id = p.organization_id and l.client_package_id = p.id
  ), 0)::integer as balance
from public.client_packages p;

create view public.v_charge_balance
with (security_invoker = true) as
select
  c.id,
  c.organization_id,
  c.client_id,
  c.source_type,
  c.source_id,
  c.amount_minor,
  c.currency,
  c.due_date,
  c.description,
  c.voided_at,
  c.created_at,
  coalesce((
    select sum(a.amount_minor)
    from public.payment_allocations a
    where a.organization_id = c.organization_id and a.charge_id = c.id
  ), 0)::integer as allocated_minor
from public.charges c;

-- Saldo klienta: należności bez anulowanych, rozliczone kwoty i suma wpłat (nadpłata = paid - allocated).
create view public.v_client_balance
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
    where p.organization_id = cl.organization_id and p.client_id = cl.id
  ), 0)::integer as paid_minor
from public.clients cl;

-- Funkcje pomocnicze RLS --------------------------------------------------------------------------------------
create or replace function app.client_can_see_package(pkg uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.client_packages p
    join public.client_access a on a.client_id = p.client_id
    where p.id = pkg
      and a.user_id = (select auth.uid())
      and a.status = 'active'
  );
$$;

create or replace function app.client_can_see_charge(ch uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.charges c
    join public.client_access a on a.client_id = c.client_id
    where c.id = ch
      and a.user_id = (select auth.uid())
      and a.status = 'active'
  );
$$;

revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;

-- RLS: zapisy tylko przez funkcje poniżej (brak polityk insert/update/delete poza szablonami) ----------------------
alter table public.package_templates enable row level security;
alter table public.client_packages enable row level security;
alter table public.package_ledger enable row level security;
alter table public.charges enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;

create policy package_templates_select on public.package_templates
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy package_templates_insert on public.package_templates
  for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

create policy package_templates_update on public.package_templates
  for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']))
  with check (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

-- Pakiety i dziennik: personel (także asystent, bez płatności) oraz klient z dostępem do swojego pakietu
create policy client_packages_select_staff on public.client_packages
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy client_packages_select_client on public.client_packages
  for select to authenticated
  using (client_id in (select app.client_ids_for_user()));

create policy package_ledger_select_staff on public.package_ledger
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy package_ledger_select_client on public.package_ledger
  for select to authenticated
  using (app.client_can_see_package(client_package_id));

-- Płatności: asystent ich nie widzi; klient widzi własne należności, wpłaty i alokacje
create policy charges_select_staff on public.charges
  for select to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

create policy charges_select_client on public.charges
  for select to authenticated
  using (client_id in (select app.client_ids_for_user()));

create policy payments_select_staff on public.payments
  for select to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

create policy payments_select_client on public.payments
  for select to authenticated
  using (client_id in (select app.client_ids_for_user()));

create policy payment_allocations_select_staff on public.payment_allocations
  for select to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

create policy payment_allocations_select_client on public.payment_allocations
  for select to authenticated
  using (app.client_can_see_charge(charge_id));

-- sell_package: pakiet + wpis „zakup" w dzienniku + należność + zdarzenie + audyt, atomowo ------------------------
create or replace function public.sell_package(
  p_org uuid,
  p_client uuid,
  p_dog uuid,
  p_template uuid,
  p_name text,
  p_sessions integer,
  p_price_minor integer,
  p_currency text,
  p_valid_from date,
  p_valid_until date,
  p_due_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_package uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not app.has_org_role(p_org, array['owner', 'admin', 'trainer']) then
    raise exception 'forbidden' using errcode = '42501';
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
  if p_template is not null and not exists (
    select 1 from public.package_templates where organization_id = p_org and id = p_template
  ) then
    raise exception 'template not found' using errcode = 'P0002';
  end if;

  insert into public.client_packages (
    organization_id, client_id, dog_id, package_template_id, name, sessions_total,
    valid_from, valid_until, price_minor, currency, created_by
  )
  values (
    p_org, p_client, p_dog, p_template, p_name, p_sessions,
    coalesce(p_valid_from, current_date), p_valid_until, p_price_minor, coalesce(p_currency, 'PLN'), v_user
  )
  returning id into v_package;

  insert into public.package_ledger (organization_id, client_package_id, delta, reason, created_by)
  values (p_org, v_package, p_sessions, 'purchase', v_user);

  if p_price_minor > 0 then
    insert into public.charges (
      organization_id, client_id, source_type, source_id, amount_minor, currency, due_date, description, created_by
    )
    values (
      p_org, p_client, 'client_package', v_package, p_price_minor, coalesce(p_currency, 'PLN'),
      coalesce(p_due_date, current_date), p_name, v_user
    );
  end if;

  insert into public.outbox_events (organization_id, type, payload)
  values (p_org, 'client_package.created',
          jsonb_build_object('client_package_id', v_package, 'client_id', p_client, 'sessions', p_sessions));

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, v_user, 'client_package.sold', 'client_package', v_package);

  return v_package;
end;
$$;

-- record_payment: wpłata + alokacje na wskazane należności (decyzję o podziale podejmuje aplikacja,
-- baza pilnuje niezmienników: należność klienta, nieanulowana, kwota nie większa niż pozostało,
-- suma alokacji nie większa niż wpłata). Niewykorzystana część wpłaty to nadpłata klienta. -------------------------
create or replace function public.record_payment(
  p_org uuid,
  p_client uuid,
  p_amount_minor integer,
  p_currency text,
  p_method text,
  p_paid_at timestamptz,
  p_reference text,
  p_allocations jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_payment uuid;
  v_alloc record;
  v_remaining integer;
  v_total integer := 0;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not app.has_org_role(p_org, array['owner', 'admin', 'trainer']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clients where organization_id = p_org and id = p_client) then
    raise exception 'client not found' using errcode = 'P0002';
  end if;

  insert into public.payments (organization_id, client_id, amount_minor, currency, paid_at, method, reference, recorded_by)
  values (p_org, p_client, p_amount_minor, coalesce(p_currency, 'PLN'), coalesce(p_paid_at, now()), p_method, p_reference, v_user)
  returning id into v_payment;

  for v_alloc in
    select (e ->> 'charge_id')::uuid as charge_id, (e ->> 'amount_minor')::integer as amount_minor
    from jsonb_array_elements(coalesce(p_allocations, '[]'::jsonb)) e
  loop
    if v_alloc.charge_id is null or v_alloc.amount_minor is null or v_alloc.amount_minor <= 0 then
      raise exception 'invalid allocation' using errcode = '23514';
    end if;

    -- Najpierw blokada wiersza należności, osobnym zapytaniem. Suma alokacji musi być liczona
    -- dopiero po jej uzyskaniu: w READ COMMITTED każde zapytanie ma własny snapshot, więc
    -- równoległa wpłata zatwierdzona w trakcie oczekiwania na blokadę jest już widoczna.
    -- (Suma w tym samym zapytaniu co FOR UPDATE użyłaby starego snapshotu i dopuściła przekroczenie.)
    perform 1
      from public.charges c
      where c.organization_id = p_org
        and c.id = v_alloc.charge_id
        and c.client_id = p_client
        and c.voided_at is null
      for update;

    if not found then
      raise exception 'charge not found' using errcode = 'P0002';
    end if;

    select c.amount_minor - coalesce((
             select sum(a.amount_minor) from public.payment_allocations a
             where a.organization_id = c.organization_id and a.charge_id = c.id
           ), 0)
      into v_remaining
      from public.charges c
      where c.organization_id = p_org and c.id = v_alloc.charge_id;

    if v_alloc.amount_minor > v_remaining then
      raise exception 'allocation exceeds remaining amount' using errcode = '23514';
    end if;

    insert into public.payment_allocations (organization_id, payment_id, charge_id, amount_minor, created_by)
    values (p_org, v_payment, v_alloc.charge_id, v_alloc.amount_minor, v_user);

    v_total := v_total + v_alloc.amount_minor;
  end loop;

  if v_total > p_amount_minor then
    raise exception 'allocations exceed payment amount' using errcode = '23514';
  end if;

  insert into public.outbox_events (organization_id, type, payload)
  values (p_org, 'payment.recorded',
          jsonb_build_object('payment_id', v_payment, 'client_id', p_client, 'amount_minor', p_amount_minor));

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, v_user, 'payment.recorded', 'payment', v_payment);

  return v_payment;
end;
$$;

-- adjust_package: ręczna korekta salda lub zwrot; saldo nie może zejść poniżej zera --------------------------------
create or replace function public.adjust_package(
  p_org uuid,
  p_package uuid,
  p_delta integer,
  p_reason text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_balance integer;
  v_entry uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not app.has_org_role(p_org, array['owner', 'admin', 'trainer']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_reason not in ('adjustment', 'refund') then
    raise exception 'invalid reason' using errcode = '23514';
  end if;

  perform 1 from public.client_packages
    where organization_id = p_org and id = p_package
    for update;
  if not found then
    raise exception 'package not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(delta), 0) into v_balance
    from public.package_ledger
    where organization_id = p_org and client_package_id = p_package;

  if v_balance + p_delta < 0 then
    raise exception 'balance cannot go below zero' using errcode = '23514';
  end if;

  insert into public.package_ledger (organization_id, client_package_id, delta, reason, note, created_by)
  values (p_org, p_package, p_delta, p_reason, p_note, v_user)
  returning id into v_entry;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, changes)
  values (p_org, v_user, 'client_package.adjusted', 'client_package', p_package,
          jsonb_build_object('delta', p_delta, 'reason', p_reason));

  return v_entry;
end;
$$;

-- void_charge: anulowanie należności (tylko gdy nic na nią nie wpłacono) ---------------------------------------------
create or replace function public.void_charge(p_org uuid, p_charge uuid)
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
  if not app.has_org_role(p_org, array['owner', 'admin', 'trainer']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  perform 1 from public.charges
    where organization_id = p_org and id = p_charge and voided_at is null
    for update;
  if not found then
    raise exception 'charge not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.payment_allocations where organization_id = p_org and charge_id = p_charge
  ) then
    raise exception 'charge has payments' using errcode = '23514';
  end if;

  update public.charges set voided_at = now() where organization_id = p_org and id = p_charge;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, v_user, 'charge.voided', 'charge', p_charge);
end;
$$;

revoke execute on function public.sell_package(uuid, uuid, uuid, uuid, text, integer, integer, text, date, date, date) from public, anon;
revoke execute on function public.record_payment(uuid, uuid, integer, text, text, timestamptz, text, jsonb) from public, anon;
revoke execute on function public.adjust_package(uuid, uuid, integer, text, text) from public, anon;
revoke execute on function public.void_charge(uuid, uuid) from public, anon;
grant execute on function public.sell_package(uuid, uuid, uuid, uuid, text, integer, integer, text, date, date, date) to authenticated;
grant execute on function public.record_payment(uuid, uuid, integer, text, text, timestamptz, text, jsonb) to authenticated;
grant execute on function public.adjust_package(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.void_charge(uuid, uuid) to authenticated;
