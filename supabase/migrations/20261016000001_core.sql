-- Moduł core: profile, organizacje, członkostwa, zaproszenia, outbox, audit_log + RLS.

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- Wspólny trigger aktualizujący updated_at -------------------------------------
create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- profiles (1:1 z auth.users) ---------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  avatar_file_id uuid,
  locale text not null default 'pl',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function app.set_updated_at();

create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- organizations -----------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  public_name text,
  logo_file_id uuid,
  brand_color text,
  status text not null default 'active' check (status in ('active', 'suspended', 'archived')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint organizations_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$')
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function app.set_updated_at();

create table public.organization_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  timezone text not null default 'Europe/Warsaw',
  locale text not null default 'pl',
  currency text not null default 'PLN',
  late_cancel_hours integer not null default 24 check (late_cancel_hours >= 0),
  late_cancel_consumes_session boolean not null default true,
  reminder_hours_before integer not null default 24 check (reminder_hours_before >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create trigger organization_settings_set_updated_at
  before update on public.organization_settings
  for each row execute function app.set_updated_at();

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'trainer', 'assistant')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  primary key (organization_id, user_id)
);

create index organization_members_user_idx on public.organization_members (user_id);

create trigger organization_members_set_updated_at
  before update on public.organization_members
  for each row execute function app.set_updated_at();

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  kind text not null check (kind in ('member', 'client')),
  role text check (role in ('admin', 'trainer', 'assistant')),
  client_id uuid,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  constraint invitations_kind_consistency check (
    (kind = 'member' and role is not null and client_id is null)
    or (kind = 'client' and role is null and client_id is not null)
  )
);

create index invitations_org_idx on public.invitations (organization_id, created_at desc);

create trigger invitations_set_updated_at
  before update on public.invitations
  for each row execute function app.set_updated_at();

-- outbox_events: zdarzenia domenowe, przetwarzane tylko przez service_role ---------
create table public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  last_error text
);

create index outbox_events_pending_idx on public.outbox_events (created_at) where processed_at is null;

-- audit_log: tylko do dopisywania -------------------------------------------------
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_id uuid references auth.users (id),
  action text not null,
  entity_type text,
  entity_id uuid,
  changes jsonb,
  ip inet,
  created_at timestamptz not null default now()
);

create index audit_log_org_idx on public.audit_log (organization_id, created_at desc);

-- Funkcje pomocnicze dla RLS (schemat app nie jest wystawiony przez API) --------------
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
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
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
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any (roles)
  );
$$;

create or replace function app.shares_org_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members mine
    join public.organization_members theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid())
      and mine.status = 'active'
      and theirs.user_id = other
  );
$$;

revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;

-- RLS ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_settings enable row level security;
alter table public.organization_members enable row level security;
alter table public.invitations enable row level security;
alter table public.outbox_events enable row level security;
alter table public.audit_log enable row level security;

-- profiles: własny profil oraz profile osób z tych samych organizacji
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or app.shares_org_with(id));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- organizations: tworzenie wyłącznie przez create_organization()
create policy organizations_select on public.organizations
  for select to authenticated
  using (app.is_org_member(id));

create policy organizations_update on public.organizations
  for update to authenticated
  using (app.has_org_role(id, array['owner', 'admin']))
  with check (app.has_org_role(id, array['owner', 'admin']));

create policy organization_settings_select on public.organization_settings
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy organization_settings_update on public.organization_settings
  for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin']))
  with check (app.has_org_role(organization_id, array['owner', 'admin']));

-- organization_members: admin nie może nadawać ani zmieniać roli owner
create policy organization_members_select on public.organization_members
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy organization_members_insert on public.organization_members
  for insert to authenticated
  with check (
    app.has_org_role(organization_id, array['owner'])
    or (app.has_org_role(organization_id, array['admin']) and role <> 'owner')
  );

create policy organization_members_update on public.organization_members
  for update to authenticated
  using (
    app.has_org_role(organization_id, array['owner'])
    or (app.has_org_role(organization_id, array['admin']) and role <> 'owner')
  )
  with check (
    app.has_org_role(organization_id, array['owner'])
    or (app.has_org_role(organization_id, array['admin']) and role <> 'owner')
  );

create policy organization_members_delete on public.organization_members
  for delete to authenticated
  using (
    app.has_org_role(organization_id, array['owner'])
    or (app.has_org_role(organization_id, array['admin']) and role <> 'owner')
  );

-- invitations
create policy invitations_select on public.invitations
  for select to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin']));

create policy invitations_insert on public.invitations
  for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'admin']));

create policy invitations_delete on public.invitations
  for delete to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin']));

-- outbox_events: brak polityk, dostęp tylko dla service_role

-- audit_log: odczyt dla owner/admin, zapis tylko przez funkcje security definer
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (organization_id is not null and app.has_org_role(organization_id, array['owner', 'admin']));

revoke insert, update, delete on public.audit_log from authenticated, anon;

-- create_organization: atomowe utworzenie organizacji z właścicielem ------------------
create or replace function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  insert into public.organizations (name, slug, public_name, created_by)
  values (p_name, p_slug, p_name, v_user)
  returning id into v_org;

  insert into public.organization_settings (organization_id, created_by)
  values (v_org, v_user);

  insert into public.organization_members (organization_id, user_id, role, created_by)
  values (v_org, v_user, 'owner', v_user);

  insert into public.outbox_events (organization_id, type, payload)
  values (v_org, 'organization.created',
          jsonb_build_object('organization_id', v_org, 'created_by', v_user));

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (v_org, v_user, 'organization.created', 'organization', v_org);

  return v_org;
end;
$$;

revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
