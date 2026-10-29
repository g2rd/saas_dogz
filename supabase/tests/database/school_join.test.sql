-- pgTAP: stały link szkoły i prośby o dołączenie. Kto zarządza linkiem, publiczny podgląd, prośba tylko przez aktywny link, jednokrotność,
-- akceptacja (nowa i istniejąca kartoteka), odrzucenie, izolacja organizacji i brak zapisu wprost.
-- Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(23);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'assistant@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client1@example.test'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'client2@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other-owner@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.create_organization('Org A', 'org-a');
select set_config('app.org_a', (select id::text from public.organizations where slug = 'org-a'), true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select public.create_organization('Org B', 'org-b');
select set_config('app.org_b', (select id::text from public.organizations where slug = 'org-b'), true);

reset role;
insert into public.organization_members (organization_id, user_id, role)
values (current_setting('app.org_a')::uuid, '00000000-0000-0000-0000-0000000000d1', 'assistant');

-- Link szkoły: tylko właściciel i administrator ------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
select throws_ok(
  format($$select public.rotate_school_join_link(%L::uuid, repeat('a', 40))$$, current_setting('app.org_a')),
  '42501', null, 'an assistant cannot create the school link');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.rotate_school_join_link(current_setting('app.org_a')::uuid, repeat('a', 40));
select is((select count(*)::int from public.school_join_links), 1, 'the owner creates the school link and reads it');
select throws_ok(
  format($$select public.rotate_school_join_link(%L::uuid, 'short')$$, current_setting('app.org_a')),
  '23514', null, 'a short token is rejected');
select throws_ok(
  $$insert into public.school_join_links (organization_id, token) values (current_setting('app.org_a')::uuid, repeat('z', 40))$$,
  '42501', null, 'the link cannot be written directly');

select public.rotate_school_join_link(current_setting('app.org_a')::uuid, repeat('b', 40));
select is((select token from public.school_join_links), repeat('b', 40), 'rotation leaves one active link with the new token');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select is((select count(*)::int from public.school_join_links), 0, 'another school does not see this link');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
select is((select count(*)::int from public.school_join_links), 0, 'an assistant does not see the link');

-- Publiczny podgląd: tylko aktywny link, tylko nazwa szkoły -------------------------------------------------------------------
select is(public.lookup_school_join(repeat('b', 40)) ->> 'name', 'Org A', 'the active link shows the school name');
select is(public.lookup_school_join(repeat('a', 40)), null, 'the replaced link no longer works');

-- Prośba klienta --------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select throws_ok(
  $$select public.request_school_join(repeat('a', 40), 'Ola', 'Klientka', '600100200', null)$$,
  'P0002', null, 'the replaced link cannot be used for a request');
select set_config('app.req1', public.request_school_join(repeat('b', 40), ' Ola ', 'Klientka', '600100200', 'Mam labradora')::text, true);
select is(
  (select first_name || ':' || email || ':' || status from public.join_requests where id = current_setting('app.req1')::uuid),
  'Ola:client1@example.test:pending', 'a request is stored as pending with the account e-mail');
select is(public.request_school_join(repeat('b', 40), 'Ola', 'Klientka', null, null), current_setting('app.req1')::uuid, 'sending again returns the same pending request');
select throws_ok(
  $$update public.join_requests set status = 'approved'$$, '42501', null, 'a requester cannot approve their own request');

-- Personel: akceptacja i odrzucenie -------------------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
select set_config('app.req2', public.request_school_join(repeat('b', 40), 'Ewa', 'Druga', null, null)::text, true);
select is((select count(*)::int from public.join_requests), 1, 'a requester sees only their own requests');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select throws_ok(
  format($$select public.decide_join_request(%L::uuid, %L::uuid, true)$$, current_setting('app.org_b'), current_setting('app.req1')),
  'P0002', null, 'another school cannot decide this request');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select is((select count(*)::int from public.join_requests), 2, 'staff see the school requests');
select set_config('app.client1', public.decide_join_request(current_setting('app.org_a')::uuid, current_setting('app.req1')::uuid, true)::text, true);
select is(
  (select c.first_name || ':' || c.email from public.clients c where c.id = current_setting('app.client1')::uuid),
  'Ola:client1@example.test', 'approval creates the client record from the request');
select throws_ok(
  format($$select public.decide_join_request(%L::uuid, %L::uuid, false)$$, current_setting('app.org_a'), current_setting('app.req1')),
  'DT019', null, 'a decided request cannot be decided again');

select public.decide_join_request(current_setting('app.org_a')::uuid, current_setting('app.req2')::uuid, false);
select is((select status from public.join_requests where id = current_setting('app.req2')::uuid), 'rejected', 'a rejected request stays as rejected');

reset role;
select is(
  (select status from public.client_access where client_id = current_setting('app.client1')::uuid and user_id = '00000000-0000-0000-0000-0000000000c1'),
  'active', 'approval gives the client access to the portal');
select is(
  (select count(*)::int from public.outbox_events where organization_id = current_setting('app.org_a')::uuid and type in ('join_request.created', 'join_request.approved')),
  3, 'created (twice) and approved events are queued; the repeated request and the rejection add none');

-- Zamknięta rejestracja: token aktywnego linku szkoły jest dowodem, wycofany lub obcy nie
update public.platform_settings set value = 'closed' where key = 'signup_mode';
select is(app.signup_check(null, repeat('b', 40)), 'ok', 'closed signup accepts the active school link token');
select is(app.signup_check(null, repeat('a', 40)), 'invalid_invitation', 'closed signup rejects a replaced school link token');

select * from finish();
rollback;
