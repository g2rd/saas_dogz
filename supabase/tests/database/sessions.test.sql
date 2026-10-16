-- pgTAP: zajęcia. Zapisy tylko przez funkcje, zużycie pakietu przy zakończeniu, kolizje terminów trenera,
-- odwoływanie, izolacja organizacji, uprawnienia asystenta i widoczność dla klienta.
-- Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd@example.test');

-- Przygotowanie jako trener A: organizacja, dwóch klientów, pies, pakiet 10 zajęć dla Anny, typ zajęć
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.create_organization('Org A', 'org-a');
select set_config('app.org_a', (select id::text from public.organizations where slug = 'org-a'), true);

insert into public.clients (id, organization_id, first_name, last_name)
values
  ('10000000-0000-0000-0000-000000000001', current_setting('app.org_a')::uuid, 'Anna', 'Kowalska'),
  ('10000000-0000-0000-0000-000000000002', current_setting('app.org_a')::uuid, 'Piotr', 'Nowak');

insert into public.dogs (id, organization_id, client_id, name)
values ('20000000-0000-0000-0000-000000000001', current_setting('app.org_a')::uuid,
        '10000000-0000-0000-0000-000000000001', 'Burek');

select set_config('app.pkg', public.sell_package(
  current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000001', null, null,
  'Pakiet 10', 10, 80000, 'PLN', null, null, current_date + 7)::text, true);

insert into public.session_types (id, organization_id, name, duration_minutes, default_price_minor)
values ('40000000-0000-0000-0000-000000000001', current_setting('app.org_a')::uuid, 'Trening', 60, 10000);

reset role;
insert into public.organization_members (organization_id, user_id, role)
values (current_setting('app.org_a')::uuid, '00000000-0000-0000-0000-0000000000d1', 'assistant');
insert into public.client_access (organization_id, client_id, user_id, relation)
values (current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

-- S1: Anna z psem, 10:00-11:00
select set_config('app.s1', public.schedule_session(
  current_setting('app.org_a')::uuid, '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-01-01 10:00+00', 'Park',
  '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001')::text, true);

select is(
  (select ends_at - starts_at from public.training_sessions where id = current_setting('app.s1')::uuid),
  interval '60 minutes', 'session length comes from the session type');

select is(
  (select attendance from public.session_attendees where session_id = current_setting('app.s1')::uuid),
  'planned', 'attendee starts as planned');

select throws_ok(
  format($$select public.schedule_session(%L::uuid, '40000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-01-01 10:30+00', null,
    '10000000-0000-0000-0000-000000000002', null)$$, current_setting('app.org_a')),
  '23P01', null, 'trainer cannot have overlapping sessions');

select lives_ok(
  format($$select public.schedule_session(%L::uuid, '40000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-01-01 11:00+00', null,
    '10000000-0000-0000-0000-000000000001', null)$$, current_setting('app.org_a')),
  'back-to-back sessions are allowed');

-- Zakończenie S1 zużywa jedno zajęcie
select public.complete_session(current_setting('app.org_a')::uuid, current_setting('app.s1')::uuid, null, 'Dobra praca', false);

select is((select balance from public.v_client_package_balance where id = current_setting('app.pkg')::uuid), 9,
  'completing a session consumes one package session');

select is(
  (select count(*)::int from public.session_attendees
     where session_id = current_setting('app.s1')::uuid and attendance = 'attended'
       and client_package_id = current_setting('app.pkg')::uuid),
  1, 'attendee is marked attended and linked to the package');

select is((select status from public.training_sessions where id = current_setting('app.s1')::uuid), 'completed',
  'session is completed');

select throws_ok(
  format($$select public.complete_session(%L::uuid, %L::uuid, null, null, false)$$,
    current_setting('app.org_a'), current_setting('app.s1')),
  'DT002', null, 'a session cannot be completed twice');

-- Piotr nie ma pakietu
select set_config('app.s3', public.schedule_session(
  current_setting('app.org_a')::uuid, '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-01-02 10:00+00', null,
  '10000000-0000-0000-0000-000000000002', null)::text, true);

select throws_ok(
  format($$select public.complete_session(%L::uuid, %L::uuid, null, null, false)$$,
    current_setting('app.org_a'), current_setting('app.s3')),
  'DT001', null, 'completing without a package is refused');

-- Asystent może rozliczać z pakietu, ale nie bez pakietu (to tworzy należność)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
select throws_ok(
  format($$select public.complete_session(%L::uuid, %L::uuid, null, null, true)$$,
    current_setting('app.org_a'), current_setting('app.s3')),
  '42501', null, 'assistant cannot complete a session without a package');

select throws_ok(
  format($$insert into public.training_sessions (organization_id, session_type_id, trainer_id, starts_at, ends_at)
    values (%L::uuid, '40000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1',
            timestamptz '2031-01-01 10:00+00', timestamptz '2031-01-01 11:00+00')$$, current_setting('app.org_a')),
  '42501', null, 'sessions cannot be written directly');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.complete_session(current_setting('app.org_a')::uuid, current_setting('app.s3')::uuid, null, null, true);

select is(
  (select amount_minor from public.charges where source_type = 'session' and source_id = current_setting('app.s3')::uuid),
  10000, 'completing without a package charges the session price');

-- Odwołania: zwykłe nie rusza pakietu, późne zabiera zajęcie
select public.cancel_session(current_setting('app.org_a')::uuid,
  (select id from public.training_sessions where starts_at = timestamptz '2030-01-01 11:00+00'), false);

select is((select balance from public.v_client_package_balance where id = current_setting('app.pkg')::uuid), 9,
  'plain cancellation leaves the package untouched');

select set_config('app.s4', public.schedule_session(
  current_setting('app.org_a')::uuid, '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-01-03 10:00+00', null,
  '10000000-0000-0000-0000-000000000001', null)::text, true);
select public.cancel_session(current_setting('app.org_a')::uuid, current_setting('app.s4')::uuid, true);

select is((select balance from public.v_client_package_balance where id = current_setting('app.pkg')::uuid), 8,
  'late cancellation consumes a session');

select lives_ok(
  format($$select public.schedule_session(%L::uuid, '40000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-01-01 11:00+00', null,
    '10000000-0000-0000-0000-000000000001', null)$$, current_setting('app.org_a')),
  'a canceled session frees the time slot');

-- Inna organizacja
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select public.create_organization('Org B', 'org-b');

select is((select count(*)::int from public.v_session_details), 0, 'other organization sees no sessions');

select throws_ok(
  format($$select public.schedule_session(%L::uuid, '40000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-0000000000b1', timestamptz '2032-01-01 10:00+00', null,
    '10000000-0000-0000-0000-000000000001', null)$$, current_setting('app.org_a')),
  '42501', null, 'other organization cannot schedule in org A');

-- Klient widzi tylko własne zajęcia
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select ok((select count(*) from public.v_session_details where client_id = '10000000-0000-0000-0000-000000000001') > 0,
  'client sees own sessions');
select is((select count(*)::int from public.v_session_details where client_id = '10000000-0000-0000-0000-000000000002'), 0,
  'client does not see other clients'' sessions');

select * from finish();
rollback;
