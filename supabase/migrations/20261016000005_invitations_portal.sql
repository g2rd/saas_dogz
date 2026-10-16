-- Zaproszenia klientów do panelu, zatwierdzanie psów dodanych przez klienta i dostęp klienta do danych organizacji.
-- Sekrety zaproszeń (token w linku i krótki kod) nigdy nie trafiają do bazy: przechowujemy tylko ich HMAC.

-- Zaproszenia: klient może nie mieć e-maila (zaproszenie przekazane osobiście kodem QR) ----------------------------
alter table public.invitations alter column email drop not null;
alter table public.invitations
  add constraint invitations_member_requires_email check (kind <> 'member' or email is not null);

alter table public.invitations add column code_hash text;
alter table public.invitations add column client_package_id uuid;
alter table public.invitations add column revoked_at timestamptz;
alter table public.invitations add column accepted_by uuid references auth.users (id);

create unique index invitations_code_hash_idx on public.invitations (code_hash) where code_hash is not null;
create index invitations_client_idx on public.invitations (organization_id, client_id, created_at desc)
  where kind = 'client';

alter table public.invitations
  add constraint invitations_client_fk
  foreign key (organization_id, client_id) references public.clients (organization_id, id);
alter table public.invitations
  add constraint invitations_package_fk
  foreign key (organization_id, client_package_id) references public.client_packages (organization_id, id);

-- Trener widzi zaproszenia klientów (hashe sekretów nie pozwalają ich użyć)
create policy invitations_select_client_kind on public.invitations
  for select to authenticated
  using (kind = 'client' and app.has_org_role(organization_id, array['owner', 'admin', 'trainer']));

-- Dziennik nieudanych prób odczytu zaproszeń: globalne ograniczenie zgadywania kodów.
-- Bez polityk RLS: dostęp tylko dla funkcji security definer.
create table public.invitation_lookup_failures (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create index invitation_lookup_failures_created_idx on public.invitation_lookup_failures (created_at);
alter table public.invitation_lookup_failures enable row level security;

-- Psy: zatwierdzanie przez trenera ------------------------------------------------------------------------------
alter table public.dogs
  add column approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column created_by_client boolean not null default false,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references auth.users (id);

create index dogs_pending_idx on public.dogs (organization_id) where approval_status = 'pending';

-- Klient może dodać psa swojemu kartotekowemu klientowi, ale tylko jako oczekującego na zatwierdzenie
create policy dogs_insert_client on public.dogs
  for insert to authenticated
  with check (
    client_id in (select app.client_ids_for_user())
    and approval_status = 'pending'
    and created_by_client
    and created_by = (select auth.uid())
  );

-- Pies niezatwierdzony nie może trafić do pakietu ani na zajęcia
create or replace function app.require_approved_dog()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.dog_id is not null and not exists (
    select 1 from public.dogs d
    where d.organization_id = new.organization_id
      and d.id = new.dog_id
      and d.approval_status = 'approved'
  ) then
    raise exception 'dog is not approved' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger client_packages_require_approved_dog
  before insert on public.client_packages
  for each row execute function app.require_approved_dog();

create trigger session_attendees_require_approved_dog
  before insert on public.session_attendees
  for each row execute function app.require_approved_dog();

-- Klient widzi organizację i jej ustawienia (nazwa w panelu, strefa czasowa) --------------------------------------
create policy organizations_select_client on public.organizations
  for select to authenticated
  using (app.is_client_of_org(id));

create policy organization_settings_select_client on public.organization_settings
  for select to authenticated
  using (app.is_client_of_org(organization_id));

-- create_client_invitation: unieważnia poprzednie oczekujące i tworzy nowe -----------------------------------------
create or replace function public.create_client_invitation(
  p_org uuid,
  p_client uuid,
  p_email text,
  p_package uuid,
  p_token_hash text,
  p_code_hash text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
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
  if p_package is not null and not exists (
    select 1 from public.client_packages where organization_id = p_org and id = p_package and client_id = p_client
  ) then
    raise exception 'package not found' using errcode = 'P0002';
  end if;
  if p_expires_at <= now() or coalesce(length(p_token_hash), 0) < 32 or coalesce(length(p_code_hash), 0) < 32 then
    raise exception 'invalid invitation' using errcode = '23514';
  end if;

  update public.invitations
    set revoked_at = now()
    where organization_id = p_org
      and client_id = p_client
      and kind = 'client'
      and accepted_at is null
      and revoked_at is null;

  insert into public.invitations (
    organization_id, email, kind, client_id, client_package_id, token_hash, code_hash,
    expires_at, invited_by, created_by
  )
  values (
    p_org, nullif(lower(btrim(coalesce(p_email, ''))), ''), 'client', p_client, p_package, p_token_hash, p_code_hash,
    p_expires_at, v_user, v_user
  )
  returning id into v_id;

  insert into public.outbox_events (organization_id, type, payload)
  values (p_org, 'client.invited', jsonb_build_object('invitation_id', v_id, 'client_id', p_client));

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, v_user, 'client.invited', 'invitation', v_id);

  return v_id;
end;
$$;

-- lookup_invitation: publiczny podgląd zaproszenia (bez logowania). Zwraca minimum informacji i tylko dla ważnego.
create or replace function public.lookup_invitation(p_secret_hash text, p_email text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations;
  v_status text;
  v_org_name text;
  v_first_name text;
  v_package jsonb;
begin
  if (select count(*) from public.invitation_lookup_failures where created_at > now() - interval '10 minutes') >= 100 then
    raise exception 'too many attempts' using errcode = 'DT003';
  end if;

  select * into v_invitation
    from public.invitations i
    where i.kind = 'client' and (i.token_hash = p_secret_hash or i.code_hash = p_secret_hash)
    limit 1;

  if not found then
    insert into public.invitation_lookup_failures default values;
    return jsonb_build_object('status', 'not_found');
  end if;

  v_status := case
    when v_invitation.accepted_at is not null then 'used'
    when v_invitation.revoked_at is not null then 'revoked'
    when v_invitation.expires_at <= now() then 'expired'
    else 'valid'
  end;
  if v_status <> 'valid' then
    return jsonb_build_object('status', v_status);
  end if;

  select o.name into v_org_name from public.organizations o where o.id = v_invitation.organization_id;
  select c.first_name into v_first_name
    from public.clients c
    where c.organization_id = v_invitation.organization_id and c.id = v_invitation.client_id;

  select jsonb_build_object(
           'name', p.name,
           'sessions_total', p.sessions_total,
           'price_minor', p.price_minor,
           'currency', p.currency)
    into v_package
    from public.client_packages p
    where p.organization_id = v_invitation.organization_id and p.id = v_invitation.client_package_id;

  return jsonb_build_object(
    'status', 'valid',
    'organization_name', v_org_name,
    'client_first_name', v_first_name,
    'email_required', v_invitation.email is null,
    'email_hint', case when v_invitation.email is null then null
                       else regexp_replace(v_invitation.email, '^(.).*(@.*)$', '\1***\2') end,
    'email_matches', case when p_email is null or v_invitation.email is null then null
                          else lower(btrim(p_email)) = v_invitation.email end,
    'package', v_package,
    'expires_at', v_invitation.expires_at
  );
end;
$$;

-- accept_invitation: zalogowany użytkownik dostaje dostęp do panelu klienta ----------------------------------------
create or replace function public.accept_invitation(p_secret_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_invitation public.invitations;
  v_email text;
  v_relation text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if (select count(*) from public.invitation_lookup_failures where created_at > now() - interval '10 minutes') >= 100 then
    raise exception 'too many attempts' using errcode = 'DT003';
  end if;

  -- Blokada zaproszenia; stan czytamy osobnym zapytaniem po jej uzyskaniu (READ COMMITTED).
  perform 1 from public.invitations i
    where i.kind = 'client' and (i.token_hash = p_secret_hash or i.code_hash = p_secret_hash)
    for update;
  if not found then
    insert into public.invitation_lookup_failures default values;
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;

  select * into v_invitation
    from public.invitations i
    where i.kind = 'client' and (i.token_hash = p_secret_hash or i.code_hash = p_secret_hash);

  if v_invitation.accepted_at is not null or v_invitation.revoked_at is not null or v_invitation.expires_at <= now() then
    raise exception 'invitation is no longer valid' using errcode = 'DT004';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_user;
  if v_invitation.email is not null and v_email is distinct from v_invitation.email then
    raise exception 'invitation is for another e-mail' using errcode = 'DT005';
  end if;

  v_relation := case
    when exists (
      select 1 from public.client_access a
      where a.client_id = v_invitation.client_id and a.status = 'active' and a.user_id <> v_user
    ) then 'family' else 'owner' end;

  insert into public.client_access (organization_id, client_id, user_id, relation, status, created_by)
  values (v_invitation.organization_id, v_invitation.client_id, v_user, v_relation, 'active', v_user)
  on conflict (client_id, user_id) do update set status = 'active';

  update public.invitations
    set accepted_at = now(), accepted_by = v_user
    where id = v_invitation.id;

  insert into public.outbox_events (organization_id, type, payload)
  values (v_invitation.organization_id, 'invitation.accepted',
          jsonb_build_object('invitation_id', v_invitation.id, 'client_id', v_invitation.client_id, 'user_id', v_user));

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (v_invitation.organization_id, v_user, 'invitation.accepted', 'invitation', v_invitation.id);

  return jsonb_build_object('client_id', v_invitation.client_id, 'organization_id', v_invitation.organization_id);
end;
$$;

-- revoke_client_access: trener odbiera dostęp do panelu ---------------------------------------------------------------
create or replace function public.revoke_client_access(p_org uuid, p_client uuid, p_user uuid)
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

  update public.client_access
    set status = 'revoked'
    where organization_id = p_org and client_id = p_client and user_id = p_user and status = 'active';
  if not found then
    raise exception 'access not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, changes)
  values (p_org, v_user, 'client_access.revoked', 'client', p_client, jsonb_build_object('user_id', p_user));
end;
$$;

revoke execute on function public.create_client_invitation(uuid, uuid, text, uuid, text, text, timestamptz) from public, anon;
revoke execute on function public.lookup_invitation(text, text) from public;
revoke execute on function public.accept_invitation(text) from public, anon;
revoke execute on function public.revoke_client_access(uuid, uuid, uuid) from public, anon;
grant execute on function public.create_client_invitation(uuid, uuid, text, uuid, text, text, timestamptz) to authenticated;
grant execute on function public.lookup_invitation(text, text) to anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.revoke_client_access(uuid, uuid, uuid) to authenticated;

revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
