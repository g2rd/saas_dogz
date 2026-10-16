-- pgTAP: izolacja organizacji w module core. Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test');

-- Użytkownik A tworzy organizację A, użytkownik B organizację B
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.create_organization('Org A', 'org-a');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select public.create_organization('Org B', 'org-b');

-- B widzi tylko swoją organizację
select is((select count(*)::int from public.organizations), 1, 'B sees exactly one organization');
select is((select slug from public.organizations), 'org-b', 'B sees its own organization');

-- B nie widzi członków ani ustawień organizacji A
select is(
  (select count(*)::int from public.organization_members where user_id = '00000000-0000-0000-0000-0000000000a1'),
  0, 'B cannot see members of org A');

-- B nie może zmienić organizacji A
update public.organizations set name = 'hacked' where slug = 'org-a';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select is((select name from public.organizations where slug = 'org-a'), 'Org A', 'B could not rename org A');

-- A nie może dopisać się do audit_log bezpośrednio
select throws_ok(
  $$insert into public.audit_log (action) values ('forged')$$,
  '42501', null, 'authenticated cannot insert into audit_log');

-- outbox niedostępny dla zalogowanych
select is((select count(*)::int from public.outbox_events), 0, 'outbox invisible to authenticated users');

select * from finish();
rollback;
