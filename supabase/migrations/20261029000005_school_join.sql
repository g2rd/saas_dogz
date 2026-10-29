-- Stały link i kod QR szkoły z akceptacją trenera (ADR 0021).
-- Szkoła ma jeden aktywny link dołączenia (wydruk, wizytówka, strona). Klient zakłada konto, wysyła prośbę z imieniem i telefonem,
-- a trener ją akceptuje (powstaje kartoteka klienta i dostęp do panelu) albo odrzuca. Sam link nie daje dostępu do żadnych danych.

-- school_join_links: aktywny token szkoły (czytają tylko właściciel i administrator; zmiany wyłącznie funkcjami) -----------------
create table public.school_join_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Token jest jawny, bo link ma być widoczny po każdym otwarciu ekranu (wydruk QR); daje wyłącznie prawo do wysłania prośby o dołączenie
  token text not null unique check (length(token) >= 32),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create unique index school_join_links_active_idx on public.school_join_links (organization_id) where revoked_at is null;

alter table public.school_join_links enable row level security;

create policy school_join_links_select on public.school_join_links
  for select to authenticated
  using (revoked_at is null and app.has_org_role(organization_id, array['owner', 'admin']));

revoke insert, update, delete on public.school_join_links from authenticated;

-- join_requests: prośby o dołączenie do szkoły -------------------------------------------------------------------------------
create table public.join_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Nazwa szkoły w chwili prośby: osoba bez dostępu nie widzi tabeli organizations, a ma zobaczyć, o co prosiła
  organization_name text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  first_name text not null check (length(btrim(first_name)) > 0 and length(first_name) <= 100),
  last_name text not null default '' check (length(last_name) <= 100),
  email text,
  phone text check (phone is null or length(phone) <= 40),
  note text check (note is null or length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  client_id uuid,
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, client_id) references public.clients (organization_id, id)
);

-- Jedna oczekująca prośba na osobę i szkołę
create unique index join_requests_pending_idx on public.join_requests (organization_id, user_id) where status = 'pending';
create index join_requests_org_idx on public.join_requests (organization_id, status, created_at desc);
create index join_requests_user_idx on public.join_requests (user_id);

alter table public.join_requests enable row level security;

-- Autor widzi własne prośby (także po odrzuceniu), personel szkoły prośby swojej szkoły
create policy join_requests_select on public.join_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

revoke insert, update, delete on public.join_requests from authenticated;

-- rotate_school_join_link: nowy link (stary przestaje działać); właściciel i administrator --------------------------------------
create or replace function public.rotate_school_join_link(p_org uuid, p_token text)
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
  if not app.has_org_role(p_org, array['owner', 'admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if app.org_is_frozen(p_org) then
    raise exception 'organization is read only' using errcode = 'DT015';
  end if;
  if p_token is null or length(p_token) < 32 then
    raise exception 'invalid token' using errcode = '23514';
  end if;

  update public.school_join_links set revoked_at = now() where organization_id = p_org and revoked_at is null;
  insert into public.school_join_links (organization_id, token, created_by) values (p_org, p_token, v_user);

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, v_user, 'school_join_link.rotated', 'organization', p_org);
end;
$$;

-- lookup_school_join: publiczny podgląd linku (bez logowania); tylko nazwa szkoły, i to dla aktywnego linku w działającej szkole ---
create or replace function public.lookup_school_join(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('name', o.name)
  from public.school_join_links l
  join public.organizations o on o.id = l.organization_id
  where l.token = p_token and l.revoked_at is null and o.status not in ('suspended', 'archived');
$$;

-- request_school_join: zalogowany użytkownik prosi o dołączenie przez link szkoły -------------------------------------------------
create or replace function public.request_school_join(
  p_token text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_org public.organizations;
  v_email text;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select o.* into v_org
    from public.school_join_links l
    join public.organizations o on o.id = l.organization_id
    where l.token = p_token and l.revoked_at is null and o.status not in ('suspended', 'archived');
  if not found then
    raise exception 'join link not found' using errcode = 'P0002';
  end if;
  if app.org_is_frozen(v_org.id) then
    raise exception 'organization is read only' using errcode = 'DT015';
  end if;

  -- Personel i klienci szkoły już mają dostęp
  if exists (select 1 from public.organization_members m where m.organization_id = v_org.id and m.user_id = v_user and m.status = 'active')
     or exists (select 1 from public.client_access a where a.organization_id = v_org.id and a.user_id = v_user and a.status = 'active') then
    raise exception 'already a member' using errcode = 'DT006';
  end if;

  -- Powtórzone wysłanie nie tworzy drugiej prośby
  select r.id into v_id from public.join_requests r where r.organization_id = v_org.id and r.user_id = v_user and r.status = 'pending';
  if found then
    return v_id;
  end if;

  -- Ograniczenie nadużyć: najwyżej 5 oczekujących próśb jednej osoby i 10 prośb na dobę
  if (select count(*) from public.join_requests r where r.user_id = v_user and r.status = 'pending') >= 5
     or (select count(*) from public.join_requests r where r.user_id = v_user and r.created_at > now() - interval '1 day') >= 10 then
    raise exception 'too many requests' using errcode = 'DT003';
  end if;

  if btrim(coalesce(p_first_name, '')) = '' or length(p_first_name) > 100 or length(coalesce(p_last_name, '')) > 100
     or length(coalesce(p_phone, '')) > 40 or length(coalesce(p_note, '')) > 500 then
    raise exception 'invalid request' using errcode = '23514';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_user;

  insert into public.join_requests (organization_id, organization_name, user_id, first_name, last_name, email, phone, note)
  values (v_org.id, v_org.name, v_user, btrim(p_first_name), btrim(coalesce(p_last_name, '')), v_email,
          nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  insert into public.outbox_events (organization_id, type, payload)
  values (v_org.id, 'join_request.created',
          jsonb_build_object('request_id', v_id, 'name', btrim(btrim(p_first_name) || ' ' || btrim(coalesce(p_last_name, '')))));

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (v_org.id, v_user, 'join_request.created', 'join_request', v_id);

  return v_id;
end;
$$;

-- decide_join_request: akceptacja (nowa kartoteka albo istniejąca) lub odrzucenie; właściciel, administrator i trener -----------
create or replace function public.decide_join_request(p_org uuid, p_request uuid, p_approve boolean, p_client uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_request public.join_requests;
  v_client uuid;
  v_relation text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not app.has_org_role(p_org, array['owner', 'admin', 'trainer']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if app.org_is_frozen(p_org) then
    raise exception 'organization is read only' using errcode = 'DT015';
  end if;

  -- Blokada prośby; stan czytamy osobnym zapytaniem po jej uzyskaniu (READ COMMITTED)
  perform 1 from public.join_requests r where r.id = p_request and r.organization_id = p_org for update;
  if not found then
    raise exception 'request not found' using errcode = 'P0002';
  end if;
  select * into v_request from public.join_requests r where r.id = p_request and r.organization_id = p_org;
  if v_request.status <> 'pending' then
    raise exception 'request is already decided' using errcode = 'DT019';
  end if;

  if not p_approve then
    update public.join_requests set status = 'rejected', decided_by = v_user, decided_at = now() where id = p_request;
    insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
    values (p_org, v_user, 'join_request.rejected', 'join_request', p_request);
    return null;
  end if;

  if p_client is null then
    insert into public.clients (organization_id, first_name, last_name, email, phone, status, created_by)
    values (p_org, v_request.first_name, v_request.last_name, v_request.email, v_request.phone, 'active', v_user)
    returning id into v_client;
  else
    if not exists (select 1 from public.clients c where c.organization_id = p_org and c.id = p_client and c.archived_at is null) then
      raise exception 'client not found' using errcode = 'P0002';
    end if;
    v_client := p_client;
  end if;

  v_relation := case
    when exists (
      select 1 from public.client_access a
      where a.client_id = v_client and a.status = 'active' and a.user_id <> v_request.user_id
    ) then 'family' else 'owner' end;

  insert into public.client_access (organization_id, client_id, user_id, relation, status, created_by)
  values (p_org, v_client, v_request.user_id, v_relation, 'active', v_user)
  on conflict (client_id, user_id) do update set status = 'active';

  update public.join_requests
    set status = 'approved', client_id = v_client, decided_by = v_user, decided_at = now()
    where id = p_request;

  insert into public.outbox_events (organization_id, type, payload)
  values (p_org, 'join_request.approved',
          jsonb_build_object('request_id', p_request, 'client_id', v_client, 'user_id', v_request.user_id));

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, v_user, 'join_request.approved', 'join_request', p_request);

  return v_client;
end;
$$;

revoke execute on function
  public.rotate_school_join_link(uuid, text),
  public.lookup_school_join(text),
  public.request_school_join(text, text, text, text, text),
  public.decide_join_request(uuid, uuid, boolean, uuid)
  from public, anon;
grant execute on function
  public.rotate_school_join_link(uuid, text),
  public.request_school_join(text, text, text, text, text),
  public.decide_join_request(uuid, uuid, boolean, uuid)
  to authenticated;
grant execute on function public.lookup_school_join(text) to anon, authenticated;

-- Zamknięta rejestracja: token stałego linku szkoły jest dowodem uprawniającym do założenia konta klienta
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
    ) or exists (
      -- Stały link szkoły: jego token wystarcza do założenia konta, które może tylko wysłać prośbę o dołączenie
      select 1 from public.school_join_links l where l.token = p_invite_hash and l.revoked_at is null
    ) then
      return 'ok';
    end if;
    return 'invalid_invitation';
  end if;
  return 'closed';
end;
$$;
