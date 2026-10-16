-- Moduły clients i dogs: kartoteka klientów, dostęp do panelu klienta, psy, notatki o psach, pliki.

-- files: metadane plików w Storage (zdjęcia psów, logo; później filmy) --------------------
create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  bucket text not null,
  path text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  duration_seconds integer,
  owner_type text,
  owner_id uuid,
  status text not null default 'pending' check (status in ('pending', 'ready', 'deleted')),
  retention_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, id),
  unique (bucket, path)
);

create index files_org_idx on public.files (organization_id, created_at desc);

create trigger files_set_updated_at
  before update on public.files
  for each row execute function app.set_updated_at();

-- clients: kartoteka (osoba lub rodzina), niezależna od konta logowania -----------------------
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  first_name text not null check (length(btrim(first_name)) > 0),
  last_name text not null default '',
  email text check (email is null or email = lower(email)),
  phone text,
  assigned_trainer_id uuid,
  status text not null default 'active' check (status in ('lead', 'active', 'inactive')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, id),
  -- Przypisany trener musi należeć do tej samej organizacji.
  foreign key (organization_id, assigned_trainer_id)
    references public.organization_members (organization_id, user_id)
);

create index clients_org_name_idx on public.clients (organization_id, last_name, first_name);
create index clients_org_trainer_idx on public.clients (organization_id, assigned_trainer_id);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function app.set_updated_at();

-- client_access: konta z dostępem do panelu klienta (rodzina = kilka osób do jednego klienta)
create table public.client_access (
  organization_id uuid not null,
  client_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  relation text not null default 'family' check (relation in ('owner', 'family')),
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  primary key (client_id, user_id),
  foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete cascade
);

create index client_access_user_idx on public.client_access (user_id) where status = 'active';

create trigger client_access_set_updated_at
  before update on public.client_access
  for each row execute function app.set_updated_at();

-- dogs ------------------------------------------------------------------------------
create table public.dogs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  client_id uuid not null,
  name text not null check (length(btrim(name)) > 0),
  breed text,
  birth_date date,
  sex text not null default 'unknown' check (sex in ('male', 'female', 'unknown')),
  photo_file_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (organization_id, id),
  foreign key (organization_id, client_id)
    references public.clients (organization_id, id) on delete cascade,
  foreign key (organization_id, photo_file_id)
    references public.files (organization_id, id)
);

create index dogs_client_idx on public.dogs (organization_id, client_id);

create trigger dogs_set_updated_at
  before update on public.dogs
  for each row execute function app.set_updated_at();

-- dog_notes: notatki zdrowotne/behawioralne; widoczne dla klienta tylko po zaznaczeniu ----------
create table public.dog_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  dog_id uuid not null,
  kind text not null default 'other' check (kind in ('health', 'behavior', 'vaccination', 'other')),
  content text not null check (length(btrim(content)) > 0),
  visible_to_client boolean not null default false,
  valid_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  foreign key (organization_id, dog_id)
    references public.dogs (organization_id, id) on delete cascade
);

create index dog_notes_dog_idx on public.dog_notes (organization_id, dog_id, created_at desc);

create trigger dog_notes_set_updated_at
  before update on public.dog_notes
  for each row execute function app.set_updated_at();

-- Funkcje pomocnicze RLS -------------------------------------------------------------------
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
    and a.status = 'active';
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
  );
$$;

revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;

-- RLS ---------------------------------------------------------------------------------------
alter table public.files enable row level security;
alter table public.clients enable row level security;
alter table public.client_access enable row level security;
alter table public.dogs enable row level security;
alter table public.dog_notes enable row level security;

-- files: odczyt dla personelu; zapis dla owner/admin/trainer
create policy files_select on public.files
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy files_insert on public.files
  for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

create policy files_update on public.files
  for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']))
  with check (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

-- clients: personel widzi wszystkich klientów organizacji (widoczność per trener
-- pojawi się razem ze współdzieleniem klientów w planie Szkoła); klient widzi tylko siebie.
create policy clients_select_staff on public.clients
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy clients_select_self on public.clients
  for select to authenticated
  using (id in (select app.client_ids_for_user()));

create policy clients_insert on public.clients
  for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

create policy clients_update on public.clients
  for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']))
  with check (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

-- Brak polityki delete: klientów archiwizujemy (archived_at), usuwa tylko procedura RODO.

-- client_access
create policy client_access_select on public.client_access
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or app.has_org_role(organization_id, array['owner', 'admin', 'trainer'])
  );

create policy client_access_insert on public.client_access
  for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

create policy client_access_update on public.client_access
  for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']))
  with check (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

create policy client_access_delete on public.client_access
  for delete to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

-- dogs
create policy dogs_select_staff on public.dogs
  for select to authenticated
  using (app.is_org_member(organization_id));

create policy dogs_select_client on public.dogs
  for select to authenticated
  using (client_id in (select app.client_ids_for_user()));

create policy dogs_insert on public.dogs
  for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

create policy dogs_update on public.dogs
  for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']))
  with check (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

-- dog_notes: asystent ich nie widzi; klient tylko notatki oznaczone jako widoczne
create policy dog_notes_select_staff on public.dog_notes
  for select to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

create policy dog_notes_select_client on public.dog_notes
  for select to authenticated
  using (visible_to_client and app.client_can_see_dog(dog_id));

create policy dog_notes_insert on public.dog_notes
  for insert to authenticated
  with check (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

create policy dog_notes_update on public.dog_notes
  for update to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']))
  with check (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

create policy dog_notes_delete on public.dog_notes
  for delete to authenticated
  using (app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

-- profiles.avatar_file_id i organizations.logo_file_id wskazują teraz na files
alter table public.profiles
  add constraint profiles_avatar_file_fk foreign key (avatar_file_id) references public.files (id) on delete set null;
alter table public.organizations
  add constraint organizations_logo_file_fk foreign key (logo_file_id) references public.files (id) on delete set null;
