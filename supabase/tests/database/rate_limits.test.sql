-- pgTAP: limity nadużyć w bazie (zaproszenia i opinie). Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(5);

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.create_organization('Org A', 'org-a');
select set_config('app.org', (select id::text from public.organizations where slug = 'org-a'), true);
reset role;

-- Zaproszenia: 200 na dobę na szkołę, 201. odrzucone, a limit dotyczy tylko tej szkoły
insert into public.invitations (organization_id, email, kind, role, token_hash, expires_at)
select current_setting('app.org')::uuid, 'u' || g || '@example.test', 'member', 'assistant', md5(g::text) || md5(g::text), now() + interval '7 days'
from generate_series(1, 200) g;
select is((select count(*)::int from public.invitations where organization_id = current_setting('app.org')::uuid), 200, '200 invitations fit in a day');
select throws_ok(
  $$insert into public.invitations (organization_id, email, kind, role, token_hash, expires_at)
    values (current_setting('app.org')::uuid, 'ostatnie@example.test', 'member', 'assistant', md5('x') || md5('x'), now() + interval '7 days')$$,
  'DT017', null, 'the 201st invitation in a day is rejected');

-- Starsze zaproszenia (sprzed doby) nie liczą się do limitu
update public.invitations set created_at = now() - interval '2 days' where organization_id = current_setting('app.org')::uuid;
select lives_ok(
  $$insert into public.invitations (organization_id, email, kind, role, token_hash, expires_at)
    values (current_setting('app.org')::uuid, 'nowe@example.test', 'member', 'assistant', md5('y') || md5('y'), now() + interval '7 days')$$,
  'invitations older than a day do not count');

-- Opinie: 5 na 10 minut na osobę
insert into public.feedback (organization_id, user_id, audience, kind, message)
select current_setting('app.org')::uuid, '00000000-0000-0000-0000-0000000000a1', 'staff', 'other', 'Zgłoszenie ' || g from generate_series(1, 5) g;
select is((select count(*)::int from public.feedback where user_id = '00000000-0000-0000-0000-0000000000a1'), 5, 'five feedback messages fit in ten minutes');
select throws_ok(
  $$insert into public.feedback (organization_id, user_id, audience, kind, message)
    values (current_setting('app.org')::uuid, '00000000-0000-0000-0000-0000000000a1', 'staff', 'other', 'szóste')$$,
  'DT017', null, 'the sixth feedback message in ten minutes is rejected');

select * from finish();
rollback;
