-- pgTAP: panel właściciela platformy. Status szkoły (tylko do odczytu, zawieszona), blokada zapisów i odczytów, ochrona kolumn
-- statusu przed trenerem, funkcje admin_* tylko dla service_role, automatyczne wygaszanie dostępu i zamknięta rejestracja.
-- Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(38);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@example.test'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'marta@example.test'),
  ('00000000-0000-0000-0000-0000000000ad', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.create_organization('Org A', 'org-a');
select set_config('app.org_a', (select id::text from public.organizations where slug = 'org-a'), true);

insert into public.clients (id, organization_id, first_name, last_name)
values
  ('10000000-0000-0000-0000-000000000001', current_setting('app.org_a')::uuid, 'Anna', 'Kowalska'),
  ('10000000-0000-0000-0000-000000000003', current_setting('app.org_a')::uuid, 'Marta', 'Zielińska');

insert into public.session_types (id, organization_id, name, duration_minutes, default_price_minor)
values ('40000000-0000-0000-0000-000000000001', current_setting('app.org_a')::uuid, 'Trening', 60, 10000);

reset role;
insert into public.client_access (organization_id, client_id, user_id, relation)
values (current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c3', 'owner');
insert into public.platform_admins (user_id, note) values ('00000000-0000-0000-0000-0000000000ad', 'właściciel testowy');

-- Status domyślny i ochrona kolumn ------------------------------------------------------------------------------------------
select is((select status from public.organizations where slug = 'org-a'), 'trial', 'a new school starts in the trial status');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select throws_ok(
  $$update public.organizations set status = 'active' where slug = 'org-a'$$,
  '42501', null, 'a trainer cannot change the status of the school');
select throws_ok(
  $$update public.organizations set access_until = now() + interval '1 year' where slug = 'org-a'$$,
  '42501', null, 'a trainer cannot extend the access of the school');
select lives_ok(
  $$update public.organizations set public_name = 'Szkoła A' where slug = 'org-a'$$,
  'a trainer still edits ordinary school fields');

-- Administratorzy platformy ---------------------------------------------------------------------------------------------------
select is((select count(*)::int from public.platform_admins), 0, 'a trainer does not see platform admins');
select is((select app.is_platform_admin()), false, 'a trainer is not a platform admin');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000ad', true);
select is((select count(*)::int from public.platform_admins), 1, 'a platform admin sees only their own row');
select is((select app.is_platform_admin()), true, 'the platform admin is recognized');
select throws_ok(
  $$insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000b1')$$,
  '42501', null, 'nobody grants admin rights through the API');
select throws_ok(
  $$select public.admin_organizations_overview()$$,
  '42501', null, 'the overview is not available to logged-in users, even admins');
reset role;

-- Funkcje właściciela (service_role) -----------------------------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  format($$select public.admin_set_organization_status(%L, 'suspended', 'x', null, %L)$$,
         current_setting('app.org_a'), '00000000-0000-0000-0000-0000000000a1'),
  '42501', null, 'a trainer cannot be the actor of a status change');
select lives_ok(
  format($$select public.admin_set_organization_status(%L, 'read_only', 'Brak płatności', null, %L)$$,
         current_setting('app.org_a'), '00000000-0000-0000-0000-0000000000ad'),
  'the platform admin sets the read-only status');
select ok(
  (select count(*) = 1 from public.audit_log where action = 'organization.status_changed' and organization_id = current_setting('app.org_a')::uuid),
  'status change is recorded in the audit log');
select ok(
  (select count(*) = 1 from public.outbox_events where type = 'organization.status_changed' and organization_id = current_setting('app.org_a')::uuid),
  'status change queues a notification for the school owner');
select ok(
  (select count(*) >= 1 from public.admin_organizations_overview() where slug = 'org-a' and status = 'read_only' and owner_email = 'owner@example.test'),
  'the overview lists the school with its owner');
-- Zadania w tle (bez użytkownika) nie podlegają blokadzie
select lives_ok(
  format($$insert into public.clients (organization_id, first_name, last_name) values (%L, 'Systemowy', 'Wpis')$$, current_setting('app.org_a')),
  'service_role can still write to a read-only school');
reset role;

-- Tryb „tylko do odczytu” ----------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select ok((select count(*) >= 2 from public.clients), 'a read-only school is still readable');
select throws_ok(
  format($$insert into public.clients (organization_id, first_name, last_name) values (%L, 'Nowy', 'Klient')$$, current_setting('app.org_a')),
  'DT015', null, 'a read-only school rejects inserts');
select throws_ok(
  $$update public.clients set last_name = 'Zmiana' where id = '10000000-0000-0000-0000-000000000001'$$,
  'DT015', null, 'a read-only school rejects updates');
select throws_ok(
  format($$select public.schedule_session(%L, '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-04-01 08:00+00', null, '10000000-0000-0000-0000-000000000001', null)$$,
         current_setting('app.org_a')),
  'DT015', null, 'functions cannot write to a read-only school either');
select is((select status from public.organizations where slug = 'org-a'), 'read_only', 'the trainer sees the status of their school');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
select is((select count(*)::int from public.clients), 1, 'the client of a read-only school still sees their own record');

-- Szkoła zawieszona ---------------------------------------------------------------------------------------------------------------------
reset role;
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select public.admin_set_organization_status(current_setting('app.org_a')::uuid, 'suspended', 'Test', null, '00000000-0000-0000-0000-0000000000ad');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select is((select count(*)::int from public.clients), 0, 'a suspended school hides all data from its trainer');
select is((select count(*)::int from public.organization_members where user_id = '00000000-0000-0000-0000-0000000000a1'), 1,
  'the trainer still sees their own membership (the app shows a suspension notice)');
select is((select status from public.organizations where slug = 'org-a'), 'suspended', 'the trainer still sees the suspended status');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
select is((select count(*)::int from public.clients), 0, 'a suspended school hides data from its clients too');
select is((select status from public.organizations where slug = 'org-a'), 'suspended', 'the client can see that the school is unavailable');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select is((select count(*)::int from public.organizations where slug = 'org-a'), 0, 'an outsider never sees the school');
reset role;

-- Przywrócenie i automatyczne wygaszanie dostępu ------------------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select public.admin_set_organization_status(current_setting('app.org_a')::uuid, 'active', null, now() - interval '1 day', '00000000-0000-0000-0000-0000000000ad');
select ok(public.expire_organization_access() >= 1, 'the daily job moves schools with an expired access date to read-only');
select is((select status from public.organizations where slug = 'org-a'), 'read_only', 'the expired school is read-only');
select public.admin_set_organization_status(current_setting('app.org_a')::uuid, 'active', null, now() + interval '30 days', '00000000-0000-0000-0000-0000000000ad');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select lives_ok(
  format($$insert into public.clients (organization_id, first_name, last_name) values (%L, 'Po', 'Przywróceniu')$$, current_setting('app.org_a')),
  'an active school accepts writes again');
reset role;

-- Zamknięta rejestracja ---------------------------------------------------------------------------------------------------------------------
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select public.admin_set_signup_mode('closed', '00000000-0000-0000-0000-0000000000ad');
select public.admin_create_beta_code(repeat('a', 64), 'Anna K.', 1, null, '00000000-0000-0000-0000-0000000000ad');
reset role;

select throws_ok(
  $$insert into auth.users (id, instance_id, aud, role, email) values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'x1@example.test')$$,
  'DT016', null, 'closed signup rejects an account without proof');
select throws_ok(
  $$insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'x2@example.test', '{"beta_code_hash": "nieistniejacy"}')$$,
  'DT016', null, 'closed signup rejects an unknown code');
select lives_ok(
  $$insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'x3@example.test', jsonb_build_object('beta_code_hash', repeat('a', 64), 'full_name', 'Ania'))$$,
  'closed signup accepts a valid beta code');
select ok(
  (select u.raw_app_meta_data ? 'beta_code_id' and not (u.raw_user_meta_data ? 'beta_code_hash') and u.raw_user_meta_data ->> 'full_name' = 'Ania'
     from auth.users u where u.id = '00000000-0000-0000-0000-0000000000e3'),
  'the code leaves a trace in app metadata and is removed from user metadata');
select throws_ok(
  $$insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'x4@example.test', jsonb_build_object('beta_code_hash', repeat('a', 64)))$$,
  'DT016', null, 'a single-use code cannot be reused');

insert into public.invitations (organization_id, email, kind, role, token_hash, expires_at)
values (current_setting('app.org_a')::uuid, 'nowy@example.test', 'member', 'trainer', repeat('b', 64), now() + interval '3 days');
select lives_ok(
  $$insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000e5', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nowy@example.test', jsonb_build_object('invite_hash', repeat('b', 64)))$$,
  'closed signup accepts an account that comes from a valid invitation');
select is(public.check_signup_allowed(null, null), 'closed', 'the pre-check reports a closed signup without proof');

select * from finish();
rollback;
