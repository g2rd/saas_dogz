-- Powiadomienia: skrzynka w aplikacji, preferencje kanałów, dziennik dostarczeń, subskrypcje web push,
-- prośby klienta („Odnów pakiet”, „Zapłacę”, „Kończę współpracę”) oraz przetwarzanie outbox i reguły dzienne.
-- Zapisy powiadomień i dostarczeń wykonuje wyłącznie service_role (procesor outbox); użytkownik czyta i oznacza jako przeczytane.

-- Outbox: blokada przetwarzania i deduplikacja zdarzeń z reguł dziennych -------------------------------------------
alter table public.outbox_events add column locked_until timestamptz;

create unique index outbox_events_dedupe_idx
  on public.outbox_events ((payload ->> 'dedupe_key'))
  where payload ? 'dedupe_key';

-- notifications: skrzynka w aplikacji (dzwonek) ----------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  audience text not null check (audience in ('staff', 'client')),
  client_id uuid,
  type text not null,
  title text not null,
  body text not null default '',
  link text,
  data jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_user_id, dedupe_key),
  foreign key (organization_id, client_id) references public.clients (organization_id, id) on delete cascade
);

create index notifications_recipient_idx on public.notifications (recipient_user_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_user_id) where read_at is null;

-- notification_preferences: wybór kanałów (w aplikacji jest zawsze) ---------------------------------------------------
create table public.notification_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  push boolean not null default true,
  email boolean not null default true,
  sms boolean not null default false,
  updated_at timestamptz not null default now()
);

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function app.set_updated_at();

-- notification_log: dziennik dostarczeń per kanał; unikalność daje idempotencję ponowień --------------------------------
create table public.notification_log (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel text not null check (channel in ('push', 'email', 'sms')),
  status text not null check (status in ('sent', 'failed', 'skipped', 'preview')),
  detail text,
  attempts integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, channel)
);

-- push_subscriptions: subskrypcje web push urządzeń użytkownika ------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null check (length(endpoint) between 10 and 2000),
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

-- client_requests: odpowiedzi klienta na powiadomienie (tylko informacja dla trenera, bez akceptacji) -------------------
create table public.client_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  client_package_id uuid,
  charge_id uuid,
  kind text not null check (kind in ('renew', 'pay', 'end')),
  note text check (note is null or length(note) <= 500),
  status text not null default 'new' check (status in ('new', 'seen')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  seen_by uuid references auth.users (id),
  unique (organization_id, id),
  foreign key (organization_id, client_id) references public.clients (organization_id, id),
  foreign key (organization_id, client_package_id) references public.client_packages (organization_id, id),
  foreign key (organization_id, charge_id) references public.charges (organization_id, id)
);

create index client_requests_org_idx on public.client_requests (organization_id, status, created_at desc);
create index client_requests_client_idx on public.client_requests (client_id, created_at desc);

-- Jedna otwarta prośba tego samego rodzaju dla tego samego pakietu lub należności
create unique index client_requests_open_unique_idx
  on public.client_requests (client_id, kind, coalesce(client_package_id, charge_id, client_id))
  where status = 'new';

-- RLS ------------------------------------------------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_log enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.client_requests enable row level security;

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_user_id = (select auth.uid()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));

-- Użytkownik może zmieniać wyłącznie znacznik przeczytania
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy notification_preferences_insert_own on public.notification_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- notification_log: bez polityk, tylko service_role

create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

create policy client_requests_select_staff on public.client_requests
  for select to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

create policy client_requests_select_client on public.client_requests
  for select to authenticated
  using (client_id in (select app.client_ids_for_user()));

create policy client_requests_update_staff on public.client_requests
  for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']))
  with check (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

-- Personel zmienia tylko status obejrzenia; treść prośby jest niezmienna
revoke update on public.client_requests from authenticated;
grant update (status, seen_at, seen_by) on public.client_requests to authenticated;

-- create_client_request: klient odpowiada na powiadomienie; idempotentne dla otwartej prośby -------------------------
create or replace function public.create_client_request(
  p_org uuid,
  p_client uuid,
  p_kind text,
  p_package uuid,
  p_charge uuid,
  p_note text
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
  if p_kind not in ('renew', 'pay', 'end') then
    raise exception 'invalid request kind' using errcode = '23514';
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

  -- Blokada kartoteki klienta serializuje równoległe kliknięcia; stan czytamy dopiero po jej uzyskaniu
  perform 1 from public.clients c where c.organization_id = p_org and c.id = p_client for update;

  select r.id into v_id
    from public.client_requests r
    where r.client_id = p_client
      and r.kind = p_kind
      and coalesce(r.client_package_id, r.charge_id, r.client_id) = coalesce(p_package, p_charge, p_client)
      and r.status = 'new';
  if found then
    return jsonb_build_object('id', v_id, 'created', false);
  end if;

  insert into public.client_requests (organization_id, client_id, client_package_id, charge_id, kind, note, created_by)
  values (p_org, p_client, p_package, p_charge, p_kind, v_note, v_user)
  returning id into v_id;

  insert into public.outbox_events (organization_id, type, payload)
  values (p_org, 'client_request.created',
          jsonb_build_object('request_id', v_id, 'client_id', p_client, 'kind', p_kind,
                             'client_package_id', p_package, 'charge_id', p_charge));

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, changes)
  values (p_org, v_user, 'client_request.created', 'client_request', v_id, jsonb_build_object('kind', p_kind));

  return jsonb_build_object('id', v_id, 'created', true);
end;
$$;

-- claim_outbox_events: procesor pobiera partię zdarzeń z blokadą (FOR UPDATE SKIP LOCKED); po 5 próbach zdarzenie zalega --
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

-- enqueue_daily_notification_events: reguły dzienne zapisują zdarzenia do outbox (idempotentnie po dedupe_key) -----------
create or replace function public.enqueue_daily_notification_events(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
  v_total integer := 0;
begin
  -- Zbliżający się termin płatności (do 3 dni, w strefie organizacji)
  insert into public.outbox_events (organization_id, type, payload)
  select b.organization_id, 'charge.due',
         jsonb_build_object('charge_id', b.id, 'client_id', b.client_id, 'dedupe_key', 'charge.due:' || b.id)
    from public.v_charge_balance b
    join public.organization_settings s on s.organization_id = b.organization_id
    where b.voided_at is null
      and b.amount_minor > b.allocated_minor
      and b.due_date >= (p_now at time zone s.timezone)::date
      and b.due_date <= (p_now at time zone s.timezone)::date + 3
  on conflict ((payload ->> 'dedupe_key')) where payload ? 'dedupe_key' do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  -- Płatność po terminie: pierwszy raz i potem co 7 dni
  insert into public.outbox_events (organization_id, type, payload)
  select b.organization_id, 'charge.overdue',
         jsonb_build_object(
           'charge_id', b.id, 'client_id', b.client_id,
           'dedupe_key', 'charge.overdue:' || b.id || ':' || (((p_now at time zone s.timezone)::date - b.due_date) / 7))
    from public.v_charge_balance b
    join public.organization_settings s on s.organization_id = b.organization_id
    where b.voided_at is null
      and b.amount_minor > b.allocated_minor
      and b.due_date < (p_now at time zone s.timezone)::date
  on conflict ((payload ->> 'dedupe_key')) where payload ? 'dedupe_key' do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  -- Przypomnienie o zajęciach (reminder_hours_before godzin przed startem)
  insert into public.outbox_events (organization_id, type, payload)
  select t.organization_id, 'training_session.reminder',
         jsonb_build_object(
           'session_id', t.id, 'client_id', a.client_id, 'starts_at', t.starts_at,
           'dedupe_key', 'session.reminder:' || t.id || ':' || a.client_id)
    from public.training_sessions t
    join public.session_attendees a on a.organization_id = t.organization_id and a.session_id = t.id
    join public.organization_settings s on s.organization_id = t.organization_id
    where t.status = 'scheduled'
      and a.attendance = 'planned'
      and t.starts_at > p_now
      and t.starts_at <= p_now + make_interval(hours => s.reminder_hours_before)
  on conflict ((payload ->> 'dedupe_key')) where payload ? 'dedupe_key' do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  return v_total;
end;
$$;

revoke execute on function public.create_client_request(uuid, uuid, text, uuid, uuid, text) from public, anon;
revoke execute on function public.claim_outbox_events(integer) from public, anon, authenticated;
revoke execute on function public.enqueue_daily_notification_events(timestamptz) from public, anon, authenticated;
grant execute on function public.create_client_request(uuid, uuid, text, uuid, uuid, text) to authenticated;
grant execute on function public.claim_outbox_events(integer) to service_role;
grant execute on function public.enqueue_daily_notification_events(timestamptz) to service_role;
