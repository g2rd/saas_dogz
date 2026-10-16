-- pgTAP: pakiety, należności i wpłaty. Zapisy tylko przez funkcje, odczyt przez RLS,
-- izolacja organizacji, widoczność dla asystenta i klienta, dziennik tylko do dopisywania.
-- Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(20);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd@example.test');

-- Przygotowanie jako trener A: organizacja, klient i sprzedaż pakietu (10 zajęć za 800 zł)
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.create_organization('Org A', 'org-a');
select set_config('app.org_a', (select id::text from public.organizations where slug = 'org-a'), true);

insert into public.clients (id, organization_id, first_name, last_name)
values ('10000000-0000-0000-0000-000000000001', current_setting('app.org_a')::uuid, 'Anna', 'Kowalska');

select set_config('app.pkg', public.sell_package(
  current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000001', null, null,
  'Pakiet 10 zajęć', 10, 80000, 'PLN', null, null, current_date + 7)::text, true);

-- Asystent i klient z dostępem (dodani jako superużytkownik, jak przy zaproszeniach)
reset role;
insert into public.organization_members (organization_id, user_id, role)
values (current_setting('app.org_a')::uuid, '00000000-0000-0000-0000-0000000000d1', 'assistant');
insert into public.client_access (organization_id, client_id, user_id, relation)
values (current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config('app.charge', (select id::text from public.charges limit 1), true);

select is((select balance from public.v_client_package_balance where id = current_setting('app.pkg')::uuid), 10,
  'purchase puts the full session count on the ledger');

select is((select allocated_minor from public.v_charge_balance where id = current_setting('app.charge')::uuid), 0,
  'new charge starts unpaid');

-- Wpłata częściowa 300 zł
select public.record_payment(
  current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000001', 30000, 'PLN', 'cash', null, 'zaliczka',
  jsonb_build_array(jsonb_build_object('charge_id', current_setting('app.charge'), 'amount_minor', 30000)));

select is((select allocated_minor from public.v_charge_balance where id = current_setting('app.charge')::uuid), 30000,
  'partial payment is allocated to the charge');

select throws_ok(
  format($$select public.record_payment(%L::uuid, %L::uuid, 60000, 'PLN', 'cash', null, null,
    jsonb_build_array(jsonb_build_object('charge_id', %L, 'amount_minor', 60000)))$$,
    current_setting('app.org_a'), '10000000-0000-0000-0000-000000000001', current_setting('app.charge')),
  '23514', null, 'cannot allocate more than the charge has left');

select throws_ok(
  format($$select public.record_payment(%L::uuid, %L::uuid, 10000, 'PLN', 'cash', null, null,
    jsonb_build_array(jsonb_build_object('charge_id', %L, 'amount_minor', 20000)))$$,
    current_setting('app.org_a'), '10000000-0000-0000-0000-000000000001', current_setting('app.charge')),
  '23514', null, 'allocations cannot exceed the payment amount');

select public.record_payment(
  current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000001', 50000, 'PLN', 'transfer', null, null,
  jsonb_build_array(jsonb_build_object('charge_id', current_setting('app.charge'), 'amount_minor', 50000)));

select is((select allocated_minor from public.v_charge_balance where id = current_setting('app.charge')::uuid), 80000,
  'second payment settles the charge; failed attempts left nothing behind');

select throws_ok(
  format($$select public.adjust_package(%L::uuid, %L::uuid, -11, 'adjustment', 'za dużo')$$,
    current_setting('app.org_a'), current_setting('app.pkg')),
  '23514', null, 'balance cannot go below zero');

select public.adjust_package(current_setting('app.org_a')::uuid, current_setting('app.pkg')::uuid, -1, 'adjustment', 'korekta');
select is((select balance from public.v_client_package_balance where id = current_setting('app.pkg')::uuid), 9,
  'adjustment changes the balance through the ledger');

select throws_ok(
  format($$select public.void_charge(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.charge')),
  '23514', null, 'a charge with payments cannot be voided');

select throws_ok(
  format($$insert into public.package_ledger (organization_id, client_package_id, delta, reason)
    values (%L::uuid, %L::uuid, 5, 'adjustment')$$, current_setting('app.org_a'), current_setting('app.pkg')),
  '42501', null, 'ledger cannot be written directly');

select throws_ok(
  format($$insert into public.charges (organization_id, client_id, amount_minor, due_date)
    values (%L::uuid, '10000000-0000-0000-0000-000000000001', 100, current_date)$$, current_setting('app.org_a')),
  '42501', null, 'charges cannot be written directly');

-- Inna organizacja nie widzi niczego i nie może sprzedawać w cudzej
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select public.create_organization('Org B', 'org-b');

select is(
  (select (select count(*) from public.client_packages) + (select count(*) from public.charges)
     + (select count(*) from public.payments) + (select count(*) from public.package_ledger))::int,
  0, 'other organization sees no packages, charges, payments or ledger');

select throws_ok(
  format($$select public.sell_package(%L::uuid, '10000000-0000-0000-0000-000000000001', null, null,
    'Włamanie', 1, 0, 'PLN', null, null, null)$$, current_setting('app.org_a')),
  '42501', null, 'other organization cannot sell packages in org A');

-- Asystent widzi pakiety, ale nie płatności
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
select is((select count(*)::int from public.client_packages), 1, 'assistant sees packages');
select is((select count(*)::int from public.charges), 0, 'assistant does not see charges');

-- Klient widzi swój pakiet, należność i dziennik, ale nie może sprzedawać
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select is((select count(*)::int from public.client_packages), 1, 'client sees own package');
select is((select count(*)::int from public.charges), 1, 'client sees own charge');
select is((select count(*)::int from public.package_ledger), 2, 'client sees own ledger entries');

select throws_ok(
  format($$select public.sell_package(%L::uuid, '10000000-0000-0000-0000-000000000001', null, null,
    'Darmowy', 1, 0, 'PLN', null, null, null)$$, current_setting('app.org_a')),
  '42501', null, 'client cannot sell packages');

-- Dziennik jest tylko do dopisywania nawet dla właściciela tabeli
reset role;
select throws_ok(
  $$update public.package_ledger set delta = 99$$,
  '42501', null, 'ledger rows cannot be updated, even by a superuser');

select * from finish();
rollback;
