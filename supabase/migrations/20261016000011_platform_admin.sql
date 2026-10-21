-- Panel właściciela platformy: status szkoły (próba / aktywna / tylko do odczytu / zawieszona), blokada dostępu na poziomie
-- bazy, zamknięta rejestracja kodami beta, przegląd użycia. Funkcje `admin_*` wywołuje wyłącznie service_role (panel /admin).

-- Statusy szkoły ----------------------------------------------------------------------------------------------
alter table public.organizations drop constraint organizations_status_check;
alter table public.organizations
  add constraint organizations_status_check
  check (status in ('trial', 'active', 'read_only', 'suspended', 'archived'));
alter table public.organizations alter column status set default 'trial';

alter table public.organizations
  add column access_until timestamptz,
  add column status_reason text,
  add column status_changed_at timestamptz,
  add column status_changed_by uuid references auth.users (id);

-- Notatki właściciela platformy o szkole: osobna tabela bez polityk (trener nigdy ich nie zobaczy)
create table public.organization_admin_info (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);
alter table public.organization_admin_info enable row level security;

-- Administratorzy platformy -------------------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

create policy platform_admins_select_own on public.platform_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.platform_admins from authenticated, anon;

-- Ustawienia platformy (np. tryb rejestracji) i kody beta --------------------------------------------------------------
create table public.platform_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);
alter table public.platform_settings enable row level security;
-- Domyślnie rejestracja jest otwarta (lokalnie i w testach); na środowisku testerów właściciel przełącza ją na „closed” w /admin
insert into public.platform_settings (key, value) values ('signup_mode', 'open');

create table public.beta_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  label text not null,
  max_uses integer not null default 1 check (max_uses >= 1),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
alter table public.beta_codes enable row level security;

-- Funkcje pomocnicze -----------------------------------------------------------------------------------------------
create or replace function app.org_status(org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select o.status from public.organizations o where o.id = org;
$$;

-- Zawieszona lub zarchiwizowana: żadnego dostępu (odczyt i zapis)
create or replace function app.org_is_blocked(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.org_status(org) in ('suspended', 'archived'), false);
$$;

-- Zamrożona: blokada wszystkich zapisów (także „tylko do odczytu”)
create or replace function app.org_is_frozen(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(app.org_status(org) in ('read_only', 'suspended', 'archived'), false);
$$;

-- Członkostwo niezależne od statusu szkoły: pozwala pokazać zawieszonemu trenerowi komunikat zamiast kreatora szkoły
create or replace function app.is_member_of(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;

create or replace function app.has_client_access_to(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_access a
    where a.organization_id = org and a.user_id = (select auth.uid()) and a.status = 'active'
  );
$$;

create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins p where p.user_id = (select auth.uid()));
$$;

-- Dotychczasowe funkcje RLS: szkoła zawieszona/zarchiwizowana nie ma żadnego dostępu
create or replace function app.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and o.status not in ('suspended', 'archived')
  );
$$;

create or replace function app.has_org_role(org uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any (roles)
      and o.status not in ('suspended', 'archived')
  );
$$;

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
      and not app.org_is_blocked(a.organization_id)
  );
$$;

create or replace function app.client_ids_for_user()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.client_id
  from public.client_access a
  where a.user_id = (select auth.uid())
    and a.status = 'active'
    and not app.org_is_blocked(a.organization_id);
$$;

create or replace function app.client_can_see_dog(dog uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dogs d
    join public.client_access a on a.client_id = d.client_id
    where d.id = dog
      and a.user_id = (select auth.uid())
      and a.status = 'active'
      and not app.org_is_blocked(a.organization_id)
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
      and not app.org_is_blocked(a.organization_id)
  );
$$;

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
      and not app.org_is_blocked(a.organization_id)
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
      and not app.org_is_blocked(a.organization_id)
  );
$$;

revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;

-- Widoczność własnego członkostwa i szkoły także po zawieszeniu (aplikacja pokazuje wtedy ekran zawieszenia) ---------------
drop policy organization_members_select on public.organization_members;
create policy organization_members_select on public.organization_members
  for select to authenticated
  using (user_id = (select auth.uid()) or app.is_org_member(organization_id));

drop policy organizations_select on public.organizations;
create policy organizations_select on public.organizations
  for select to authenticated
  using (app.is_member_of(id) or app.has_client_access_to(id));

-- Trener ani klient nie zmienia statusu ani terminu dostępu swojej szkoły ----------------------------------------------------
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
          or new.status_changed_at is distinct from old.status_changed_at
          or new.status_changed_by is distinct from old.status_changed_by) then
    raise exception 'organization status is managed by the platform owner' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger organizations_protect_admin_columns
  before update on public.organizations
  for each row execute function app.protect_organization_admin_columns();

-- Blokada zapisów dla szkoły „tylko do odczytu” i zawieszonej -------------------------------------------------------------------
-- Działa na poziomie tabel, więc obejmuje zapisy przez RLS i przez funkcje security definer. Zadania w tle i panel właściciela
-- (service_role, bez auth.uid()) nie podlegają blokadzie.
create or replace function app.enforce_org_writable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  v_org := case when tg_op = 'DELETE' then old.organization_id else new.organization_id end;
  if app.org_is_frozen(v_org) then
    raise exception 'organization is read only' using errcode = 'DT015';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clients', 'client_access', 'dogs', 'dog_notes', 'package_templates', 'client_packages', 'package_ledger', 'charges',
    'payments', 'payment_allocations', 'session_types', 'training_sessions', 'session_attendees', 'client_requests',
    'waitlist_entries', 'slot_offers', 'slot_claims', 'invitations', 'organization_settings', 'organization_members', 'files'
  ] loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I for each row execute function app.enforce_org_writable()',
      t || '_enforce_writable', t);
  end loop;
end;
$$;

-- Zamknięta rejestracja ---------------------------------------------------------------------------------------------------------
-- Sprawdza, czy rejestracja z danym dowodem (kod beta albo skrót zaproszenia) jest dozwolona; zwraca powód odmowy.
create or replace function app.signup_check(p_code_hash text, p_invite_hash text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mode text := coalesce((select s.value from public.platform_settings s where s.key = 'signup_mode'), 'open');
begin
  if v_mode <> 'closed' then
    return 'ok';
  end if;
  if coalesce(p_code_hash, '') <> '' then
    if exists (
      select 1 from public.beta_codes c
      where c.code_hash = p_code_hash and c.revoked_at is null
        and (c.expires_at is null or c.expires_at > now()) and c.used_count < c.max_uses
    ) then
      return 'ok';
    end if;
    return 'invalid_code';
  end if;
  if coalesce(p_invite_hash, '') <> '' then
    if exists (
      select 1 from public.invitations i
      where (i.token_hash = p_invite_hash or i.code_hash = p_invite_hash)
        and i.accepted_at is null and i.expires_at > now()
    ) then
      return 'ok';
    end if;
    return 'invalid_invitation';
  end if;
  return 'closed';
end;
$$;

create or replace function public.check_signup_allowed(p_code_hash text, p_invite_hash text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select app.signup_check(p_code_hash, p_invite_hash);
$$;

revoke execute on function public.check_signup_allowed(text, text) from public;
grant execute on function public.check_signup_allowed(text, text) to anon, authenticated, service_role;

-- Wyzwalacz na auth.users: ostatnia linia obrony, bo publiczny punkt rejestracji Supabase jest dostępny z kluczem anon
create or replace function app.enforce_signup_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code_hash text := new.raw_user_meta_data ->> 'beta_code_hash';
  v_invite_hash text := new.raw_user_meta_data ->> 'invite_hash';
  v_result text;
  v_code_id uuid;
begin
  v_result := app.signup_check(v_code_hash, v_invite_hash);
  if v_result <> 'ok' then
    raise exception 'signup closed: %', v_result using errcode = 'DT016';
  end if;

  if coalesce((select s.value from public.platform_settings s where s.key = 'signup_mode'), 'open') = 'closed'
     and coalesce(v_code_hash, '') <> '' then
    update public.beta_codes set used_count = used_count + 1
      where code_hash = v_code_hash returning id into v_code_id;
    -- Ślad kodu w metadanych aplikacji (użytkownik ich nie edytuje); sam skrót kodu nie zostaje w profilu
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('beta_code_id', v_code_id);
  end if;
  new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'beta_code_hash' - 'invite_hash';
  return new;
end;
$$;

create trigger a_enforce_signup_gate
  before insert on auth.users
  for each row execute function app.enforce_signup_gate();

-- Funkcje właściciela platformy (tylko service_role) ----------------------------------------------------------------------------------
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
    o.status_reason,
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

create or replace function app.assert_platform_admin(p_actor uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_actor is null or not exists (select 1 from public.platform_admins p where p.user_id = p_actor) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
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

create or replace function public.admin_set_organization_notes(p_org uuid, p_notes text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.assert_platform_admin(p_actor);
  if not exists (select 1 from public.organizations o where o.id = p_org) then
    raise exception 'organization not found' using errcode = 'P0002';
  end if;
  if length(coalesce(p_notes, '')) > 4000 then
    raise exception 'notes too long' using errcode = '23514';
  end if;
  insert into public.organization_admin_info (organization_id, notes, updated_by)
  values (p_org, nullif(btrim(coalesce(p_notes, '')), ''), p_actor)
  on conflict (organization_id) do update set notes = excluded.notes, updated_at = now(), updated_by = excluded.updated_by;
end;
$$;

create or replace function public.admin_set_signup_mode(p_mode text, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.assert_platform_admin(p_actor);
  if p_mode not in ('open', 'closed') then
    raise exception 'invalid mode' using errcode = '23514';
  end if;
  update public.platform_settings set value = p_mode, updated_at = now(), updated_by = p_actor where key = 'signup_mode';
  insert into public.audit_log (actor_id, action, entity_type, changes)
  values (p_actor, 'platform.signup_mode_changed', 'platform_settings', jsonb_build_object('mode', p_mode));
end;
$$;

create or replace function public.admin_create_beta_code(
  p_code_hash text,
  p_label text,
  p_max_uses integer,
  p_expires_at timestamptz,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform app.assert_platform_admin(p_actor);
  if coalesce(length(p_code_hash), 0) < 32 or btrim(coalesce(p_label, '')) = '' or length(p_label) > 120 then
    raise exception 'invalid code' using errcode = '23514';
  end if;
  insert into public.beta_codes (code_hash, label, max_uses, expires_at, created_by)
  values (p_code_hash, btrim(p_label), greatest(coalesce(p_max_uses, 1), 1), p_expires_at, p_actor)
  returning id into v_id;
  insert into public.audit_log (actor_id, action, entity_type, entity_id, changes)
  values (p_actor, 'platform.beta_code_created', 'beta_code', v_id, jsonb_build_object('label', btrim(p_label), 'max_uses', p_max_uses));
  return v_id;
end;
$$;

create or replace function public.admin_revoke_beta_code(p_code uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.assert_platform_admin(p_actor);
  update public.beta_codes set revoked_at = now() where id = p_code and revoked_at is null;
  insert into public.audit_log (actor_id, action, entity_type, entity_id)
  values (p_actor, 'platform.beta_code_revoked', 'beta_code', p_code);
end;
$$;

-- Automat: po upływie terminu dostępu szkoła przechodzi w tryb „tylko do odczytu” (wywoływany z zadania cyklicznego)
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
          status_reason = 'Okres dostępu dobiegł końca',
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
                               'reason', 'Okres dostępu dobiegł końca', 'access_until', v_row.access_until));
  end loop;
  return v_count;
end;
$$;

revoke execute on function
  public.admin_organizations_overview(),
  public.admin_set_organization_status(uuid, text, text, timestamptz, uuid),
  public.admin_set_organization_notes(uuid, text, uuid),
  public.admin_set_signup_mode(text, uuid),
  public.admin_create_beta_code(text, text, integer, timestamptz, uuid),
  public.admin_revoke_beta_code(uuid, uuid),
  public.expire_organization_access()
  from public, anon, authenticated;
grant execute on function
  public.admin_organizations_overview(),
  public.admin_set_organization_status(uuid, text, text, timestamptz, uuid),
  public.admin_set_organization_notes(uuid, text, uuid),
  public.admin_set_signup_mode(text, uuid),
  public.admin_create_beta_code(text, text, integer, timestamptz, uuid),
  public.admin_revoke_beta_code(uuid, uuid),
  public.expire_organization_access()
  to service_role;
