-- Zaproszenia personelu (trenerzy, asystenci, administratorzy) na tej samej tabeli `invitations`, co zaproszenia klientów.
-- Sekret (token w linku) nie trafia do bazy, tylko jego HMAC. Przyjęcie tworzy `organization_members` w jednej transakcji.

-- create_member_invitation: właściciel zaprasza każdą rolę poza właścicielem, administrator tylko trenera i asystenta --
create or replace function public.create_member_invitation(
  p_org uuid,
  p_email text,
  p_role text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not app.has_org_role(p_org, array['owner', 'admin']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'trainer', 'assistant') then
    raise exception 'invalid role' using errcode = '23514';
  end if;
  -- Administrator nie nadaje roli administratora
  if p_role = 'admin' and not app.has_org_role(p_org, array['owner']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid e-mail' using errcode = '23514';
  end if;
  if p_expires_at <= now() or coalesce(length(p_token_hash), 0) < 32 then
    raise exception 'invalid invitation' using errcode = '23514';
  end if;
  if exists (
    select 1
      from public.organization_members m
      join auth.users u on u.id = m.user_id
      where m.organization_id = p_org and lower(u.email) = v_email and m.status = 'active'
  ) then
    raise exception 'already a member' using errcode = 'DT006';
  end if;

  -- Nowe zaproszenie na ten adres unieważnia poprzednie oczekujące
  update public.invitations
    set revoked_at = now()
    where organization_id = p_org
      and kind = 'member'
      and email = v_email
      and accepted_at is null
      and revoked_at is null;

  insert into public.invitations (organization_id, email, kind, role, token_hash, expires_at, invited_by, created_by)
  values (p_org, v_email, 'member', p_role, p_token_hash, p_expires_at, v_user, v_user)
  returning id into v_id;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, changes)
  values (p_org, v_user, 'member.invited', 'invitation', v_id, jsonb_build_object('role', p_role));

  return v_id;
end;
$$;

-- lookup_member_invitation: publiczny podgląd zaproszenia personelu (bez logowania), tylko minimum informacji ------------
create or replace function public.lookup_member_invitation(p_token_hash text, p_email text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.invitations;
  v_status text;
begin
  if (select count(*) from public.invitation_lookup_failures where created_at > now() - interval '10 minutes') >= 100 then
    raise exception 'too many attempts' using errcode = 'DT003';
  end if;

  select * into v_invitation
    from public.invitations i
    where i.kind = 'member' and i.token_hash = p_token_hash;

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

  return jsonb_build_object(
    'status', 'valid',
    'organization_name', (select o.name from public.organizations o where o.id = v_invitation.organization_id),
    'role', v_invitation.role,
    'email_hint', regexp_replace(v_invitation.email, '^(.).*(@.*)$', '\1***\2'),
    'email_matches', case when p_email is null then null else lower(btrim(p_email)) = v_invitation.email end,
    'expires_at', v_invitation.expires_at
  );
end;
$$;

-- accept_member_invitation: zalogowany użytkownik z właściwym adresem e-mail zostaje członkiem organizacji -----------
create or replace function public.accept_member_invitation(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_invitation public.invitations;
  v_email text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if (select count(*) from public.invitation_lookup_failures where created_at > now() - interval '10 minutes') >= 100 then
    raise exception 'too many attempts' using errcode = 'DT003';
  end if;

  -- Blokada zaproszenia; stan czytamy osobnym zapytaniem po jej uzyskaniu (READ COMMITTED).
  perform 1 from public.invitations i where i.kind = 'member' and i.token_hash = p_token_hash for update;
  if not found then
    insert into public.invitation_lookup_failures default values;
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;

  select * into v_invitation from public.invitations i where i.kind = 'member' and i.token_hash = p_token_hash;

  if v_invitation.accepted_at is not null or v_invitation.revoked_at is not null or v_invitation.expires_at <= now() then
    raise exception 'invitation is no longer valid' using errcode = 'DT004';
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_user;
  if v_email is distinct from v_invitation.email then
    raise exception 'invitation is for another e-mail' using errcode = 'DT005';
  end if;

  if exists (
    select 1 from public.organization_members m
    where m.organization_id = v_invitation.organization_id and m.user_id = v_user
  ) then
    raise exception 'already a member' using errcode = 'DT006';
  end if;

  insert into public.organization_members (organization_id, user_id, role, status, created_by)
  values (v_invitation.organization_id, v_user, v_invitation.role, 'active', v_invitation.invited_by);

  update public.invitations
    set accepted_at = now(), accepted_by = v_user
    where id = v_invitation.id;

  insert into public.outbox_events (organization_id, type, payload)
  values (v_invitation.organization_id, 'member.joined',
          jsonb_build_object('invitation_id', v_invitation.id, 'user_id', v_user, 'role', v_invitation.role));

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, changes)
  values (v_invitation.organization_id, v_user, 'member.joined', 'invitation', v_invitation.id,
          jsonb_build_object('role', v_invitation.role));

  return jsonb_build_object('organization_id', v_invitation.organization_id, 'role', v_invitation.role);
end;
$$;

-- revoke_member_invitation: właściciel lub administrator odwołuje oczekujące zaproszenie ---------------------------------
create or replace function public.revoke_member_invitation(p_org uuid, p_invitation uuid)
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

  update public.invitations
    set revoked_at = now()
    where organization_id = p_org and id = p_invitation and kind = 'member'
      and accepted_at is null and revoked_at is null;
  if not found then
    raise exception 'invitation not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id)
  values (p_org, v_user, 'member.invitation_revoked', 'invitation', p_invitation);
end;
$$;

revoke execute on function public.create_member_invitation(uuid, text, text, text, timestamptz) from public, anon;
revoke execute on function public.lookup_member_invitation(text, text) from public;
revoke execute on function public.accept_member_invitation(text) from public, anon;
revoke execute on function public.revoke_member_invitation(uuid, uuid) from public, anon;
grant execute on function public.create_member_invitation(uuid, text, text, text, timestamptz) to authenticated;
grant execute on function public.lookup_member_invitation(text, text) to anon, authenticated;
grant execute on function public.accept_member_invitation(text) to authenticated;
grant execute on function public.revoke_member_invitation(uuid, uuid) to authenticated;
