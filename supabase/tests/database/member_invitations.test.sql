-- pgTAP: zaproszenia personelu. Kto może zapraszać jaką rolę, publiczny podgląd, przyjęcie tylko przez właściwy adres,
-- jednorazowość, odwoływanie i izolacja organizacji.
-- Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.test'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'assistant@example.test'),
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'newtrainer@example.test'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'wrong@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-owner@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.create_organization('Org A', 'org-a');
select set_config('app.org_a', (select id::text from public.organizations where slug = 'org-a'), true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select public.create_organization('Org B', 'org-b');

reset role;
insert into public.organization_members (organization_id, user_id, role)
values
  (current_setting('app.org_a')::uuid, '00000000-0000-0000-0000-0000000000e1', 'admin'),
  (current_setting('app.org_a')::uuid, '00000000-0000-0000-0000-0000000000d1', 'assistant');

-- Właściciel zaprasza trenera ----------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

select set_config('app.inv', public.create_member_invitation(
  current_setting('app.org_a')::uuid, 'NewTrainer@Example.test', 'trainer', repeat('a', 64), now() + interval '7 days')::text, true);

select is(
  (select email || ':' || role from public.invitations where id = current_setting('app.inv')::uuid),
  'newtrainer@example.test:trainer', 'owner invites a trainer; e-mail is normalised');

select throws_ok(
  format($$select public.create_member_invitation(%L::uuid, 'x@example.test', 'owner', repeat('b', 64), now() + interval '1 day')$$,
    current_setting('app.org_a')),
  '23514', null, 'the owner role cannot be offered');

select throws_ok(
  format($$select public.create_member_invitation(%L::uuid, 'nie-email', 'trainer', repeat('b', 64), now() + interval '1 day')$$,
    current_setting('app.org_a')),
  '23514', null, 'invalid e-mail is refused');

select throws_ok(
  format($$select public.create_member_invitation(%L::uuid, 'owner@example.test', 'trainer', repeat('c', 64), now() + interval '1 day')$$,
    current_setting('app.org_a')),
  'DT006', null, 'an existing member cannot be invited');

-- Administrator: trener tak, administrator nie ---------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
select lives_ok(
  format($$select public.create_member_invitation(%L::uuid, 'another@example.test', 'assistant', repeat('d', 64), now() + interval '1 day')$$,
    current_setting('app.org_a')),
  'admin invites an assistant');
select throws_ok(
  format($$select public.create_member_invitation(%L::uuid, 'adm@example.test', 'admin', repeat('e', 64), now() + interval '1 day')$$,
    current_setting('app.org_a')),
  '42501', null, 'admin cannot invite another admin');

-- Asystent i obca organizacja nie zapraszają
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
select throws_ok(
  format($$select public.create_member_invitation(%L::uuid, 'z@example.test', 'assistant', repeat('f', 64), now() + interval '1 day')$$,
    current_setting('app.org_a')),
  '42501', null, 'assistant cannot invite');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select throws_ok(
  format($$select public.create_member_invitation(%L::uuid, 'z@example.test', 'assistant', repeat('9', 64), now() + interval '1 day')$$,
    current_setting('app.org_a')),
  '42501', null, 'another organization cannot invite into org A');
select throws_ok(
  format($$select public.revoke_member_invitation(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.inv')),
  '42501', null, 'another organization cannot revoke org A invitations');

-- Podgląd publiczny ----------------------------------------------------------------------------------------------------
reset role;
set local role anon;
select is(
  public.lookup_member_invitation(repeat('a', 64), 'newtrainer@example.test') ->> 'status', 'valid',
  'anonymous preview of a valid invitation');
select is(
  public.lookup_member_invitation(repeat('a', 64), null) ->> 'email_hint', 'n***@example.test',
  'preview masks the e-mail');
select is(
  public.lookup_member_invitation(repeat('0', 64), null) ->> 'status', 'not_found',
  'unknown token is reported as not found');
select throws_ok(
  $$select public.accept_member_invitation(repeat('a', 64))$$, '42501', null, 'anonymous cannot accept');

-- Przyjęcie ---------------------------------------------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f2', true);
select throws_ok(
  $$select public.accept_member_invitation(repeat('a', 64))$$, 'DT005', null, 'wrong e-mail cannot accept');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
select is(
  public.accept_member_invitation(repeat('a', 64)) ->> 'role', 'trainer', 'matching e-mail accepts the invitation');

reset role;
select is(
  (select role from public.organization_members
     where organization_id = current_setting('app.org_a')::uuid and user_id = '00000000-0000-0000-0000-0000000000f1'),
  'trainer', 'membership is created with the invited role');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000f1', true);
select throws_ok(
  $$select public.accept_member_invitation(repeat('a', 64))$$, 'DT004', null, 'an invitation can be used only once');

-- Odwoływanie -------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config('app.inv2', public.create_member_invitation(
  current_setting('app.org_a')::uuid, 'later@example.test', 'assistant', repeat('7', 64), now() + interval '7 days')::text, true);
select lives_ok(
  format($$select public.revoke_member_invitation(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.inv2')),
  'owner revokes a pending invitation');

reset role;
select is(
  public.lookup_member_invitation(repeat('7', 64), null) ->> 'status', 'revoked', 'revoked invitation is reported as such');

select * from finish();
rollback;
