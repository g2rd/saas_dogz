-- pgTAP: ustawienia szkoły (waluta, strefa, język). Blokada zmiany waluty przy rekordach z kwotami (DT018),
-- walidacja strefy i kształtu pól, przepisanie cennika, audit_log, uprawnienia ról.
-- Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(14);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'trainer@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.create_organization('Org Settings', 'org-settings');
select set_config('app.org', (select id::text from public.organizations where slug = 'org-settings'), true);

-- Cennik do przepisania po zmianie waluty
insert into public.session_types (id, organization_id, name, duration_minutes, default_price_minor)
values ('40000000-0000-0000-0000-000000000001', current_setting('app.org')::uuid, 'Trening', 60, 10000);
insert into public.package_templates (id, organization_id, name, sessions_count, price_minor)
values ('50000000-0000-0000-0000-000000000001', current_setting('app.org')::uuid, 'Pakiet 10', 10, 80000);

reset role;
insert into public.organization_members (organization_id, user_id, role)
values (current_setting('app.org')::uuid, '00000000-0000-0000-0000-0000000000b1', 'trainer');

-- Właściciel zmienia ustawienia, dopóki nie ma kwot ----------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

select lives_ok(
  format($$update public.organization_settings set currency = 'EUR', timezone = 'Europe/Berlin', locale = 'en' where organization_id = %L$$, current_setting('app.org')),
  'the owner can change currency, time zone and language while there are no money records');
select is((select currency from public.organization_settings where organization_id = current_setting('app.org')::uuid), 'EUR', 'the currency was saved');
select is((select currency from public.session_types where id = '40000000-0000-0000-0000-000000000001'), 'EUR', 'the session type price list moves to the new currency');
select is((select currency from public.package_templates where id = '50000000-0000-0000-0000-000000000001'), 'EUR', 'the package template price list moves to the new currency');
select is((select price_minor from public.package_templates where id = '50000000-0000-0000-0000-000000000001'), 80000, 'the amounts in the price list stay unchanged');

-- Walidacja
select throws_ok(
  format($$update public.organization_settings set timezone = 'Mars/Olympus' where organization_id = %L$$, current_setting('app.org')),
  '23514', null, 'an unknown time zone is rejected');
select throws_ok(
  format($$update public.organization_settings set currency = 'eur' where organization_id = %L$$, current_setting('app.org')),
  '23514', null, 'a malformed currency code is rejected');
select throws_ok(
  format($$update public.organization_settings set late_cancel_hours = 9999 where organization_id = %L$$, current_setting('app.org')),
  '23514', null, 'the late-cancellation threshold is capped');

-- Po sprzedaży pakietu waluta jest zablokowana -----------------------------------------------------------------------------------
insert into public.clients (id, organization_id, first_name, last_name)
values ('10000000-0000-0000-0000-000000000001', current_setting('app.org')::uuid, 'Anna', 'Kowalska');
select public.sell_package(
  current_setting('app.org')::uuid, '10000000-0000-0000-0000-000000000001', null, null,
  'Pakiet 10', 10, 80000, null, null, null, current_date + 7);

select throws_ok(
  format($$update public.organization_settings set currency = 'GBP' where organization_id = %L$$, current_setting('app.org')),
  'DT018', null, 'the currency cannot change once the school has money records');
select lives_ok(
  format($$update public.organization_settings set currency = 'EUR', timezone = 'Europe/London' where organization_id = %L$$, current_setting('app.org')),
  'the other settings can still change (the same currency is not a change)');

-- Dziennik zmian
reset role;
select is((select count(*)::int from public.audit_log where organization_id = current_setting('app.org')::uuid and action = 'organization.settings_updated'), 2,
  'every effective change lands in the audit log');
select is((select changes -> 'to' ->> 'currency' from public.audit_log where organization_id = current_setting('app.org')::uuid and action = 'organization.settings_updated' order by created_at desc, id limit 1), 'EUR',
  'the audit entry keeps the new values');

-- Trener i obca osoba nie zmienią ustawień (RLS: polityka dla owner/admin)
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
update public.organization_settings set locale = 'de' where organization_id = current_setting('app.org')::uuid;
select is((select locale from public.organization_settings where organization_id = current_setting('app.org')::uuid), 'en', 'a trainer cannot change the school settings');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
update public.organization_settings set locale = 'de' where organization_id = current_setting('app.org')::uuid;
reset role;
select is((select locale from public.organization_settings where organization_id = current_setting('app.org')::uuid), 'en', 'an outsider cannot change another school''s settings');

select * from finish();
rollback;
