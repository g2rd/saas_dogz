-- pgTAP: opinie testerów (tabela feedback). Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@example.test');

-- Trener A (organizacja A) i klient c1 z dostępem do organizacji A; trener B (organizacja B)
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.create_organization('Org A', 'org-a');
select set_config('app.org_a', (select id::text from public.organizations where slug = 'org-a'), true);
insert into public.clients (id, organization_id, first_name, last_name)
values ('10000000-0000-0000-0000-000000000001', current_setting('app.org_a')::uuid, 'Anna', 'Kowalska');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select public.create_organization('Org B', 'org-b');
select set_config('app.org_b', (select id::text from public.organizations where slug = 'org-b'), true);
reset role;

insert into public.client_access (organization_id, client_id, user_id, relation)
values (current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'owner');

-- Personel dodaje własne zgłoszenie
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select lives_ok(
  $$insert into public.feedback (organization_id, user_id, audience, kind, message, page, locale)
    values (current_setting('app.org_a')::uuid, '00000000-0000-0000-0000-0000000000a1', 'staff', 'problem', 'Nie widzę zajęć', '/app/sessions', 'pl')$$,
  'staff can submit feedback for their own organization');

-- Nie w cudzym imieniu, nie dla cudzej organizacji, nie w niewłaściwej roli, nie z ustawionym statusem
select throws_ok(
  $$insert into public.feedback (organization_id, user_id, audience, kind, message)
    values (current_setting('app.org_a')::uuid, '00000000-0000-0000-0000-0000000000b1', 'staff', 'idea', 'x')$$,
  '42501', null, 'feedback cannot be submitted on behalf of another user');
select throws_ok(
  $$insert into public.feedback (organization_id, user_id, audience, kind, message)
    values (current_setting('app.org_b')::uuid, '00000000-0000-0000-0000-0000000000a1', 'staff', 'idea', 'x')$$,
  '42501', null, 'feedback cannot be submitted for an organization the user does not belong to');
select throws_ok(
  $$insert into public.feedback (organization_id, user_id, audience, kind, message)
    values (current_setting('app.org_a')::uuid, '00000000-0000-0000-0000-0000000000a1', 'client', 'idea', 'x')$$,
  '42501', null, 'staff cannot submit feedback as a client');
select throws_ok(
  $$insert into public.feedback (organization_id, user_id, audience, kind, message, status)
    values (current_setting('app.org_a')::uuid, '00000000-0000-0000-0000-0000000000a1', 'staff', 'idea', 'x', 'seen')$$,
  '42501', null, 'the status is set only by the platform owner');
select throws_ok(
  $$insert into public.feedback (organization_id, user_id, audience, kind, message)
    values (current_setting('app.org_a')::uuid, '00000000-0000-0000-0000-0000000000a1', 'staff', 'idea', '   ')$$,
  '23514', null, 'an empty message is rejected');

-- Klient dodaje własne zgłoszenie; widzi tylko swoje
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select lives_ok(
  $$insert into public.feedback (organization_id, user_id, audience, kind, message)
    values (current_setting('app.org_a')::uuid, '00000000-0000-0000-0000-0000000000c1', 'client', 'idea', 'Dodajcie widok tygodnia')$$,
  'a client can submit feedback');
select is((select count(*)::int from public.feedback), 1, 'a client sees only their own feedback');

-- Trener B nie widzi zgłoszeń z organizacji A
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select is((select count(*)::int from public.feedback), 0, 'another school sees no feedback');

-- Nikt nie zmienia ani nie usuwa zgłoszeń z aplikacji
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select throws_ok($$update public.feedback set status = 'seen'$$, '42501', null, 'feedback cannot be edited by users');
select throws_ok($$delete from public.feedback$$, '42501', null, 'feedback cannot be deleted by users');
reset role;

select * from finish();
rollback;
