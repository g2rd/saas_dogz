-- pgTAP: język profilu ustawiany przy rejestracji z metadanych `locale` (wielojęzyczność).
-- Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'en@example.test', '{"locale": "en", "full_name": "Anna"}'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'none@example.test', '{}'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bad@example.test', '{"locale": "<script>"}'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'upper@example.test', '{"locale": "DE"}');

select is((select locale from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'en', 'the profile gets the locale sent at signup');
select is((select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'), 'Anna', 'the full name is still stored');
select is((select locale from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'), 'pl', 'no locale means the default (pl)');
select is((select locale from public.profiles where id = '00000000-0000-0000-0000-0000000000a3'), 'pl', 'garbage in the locale falls back to the default');
select is((select locale from public.profiles where id = '00000000-0000-0000-0000-0000000000a4'), 'de', 'the locale is normalized to lower case');

-- Waluta szkoły: nowe rekordy z kwotami dostają walutę z ustawień szkoły (nie stałą PLN) ------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.create_organization('Org GB', 'org-gb');
select set_config('app.org', (select id::text from public.organizations where slug = 'org-gb'), true);
reset role;
update public.organization_settings set currency = 'GBP' where organization_id = current_setting('app.org')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
insert into public.session_types (id, organization_id, name, duration_minutes, default_price_minor)
values ('40000000-0000-0000-0000-000000000001', current_setting('app.org')::uuid, 'Training', 60, 5000);
insert into public.clients (id, organization_id, first_name, last_name)
values ('10000000-0000-0000-0000-000000000001', current_setting('app.org')::uuid, 'Anna', 'Smith');
select set_config('app.pkg', public.sell_package(
  current_setting('app.org')::uuid, '10000000-0000-0000-0000-000000000001', null, null,
  'Pack 5', 5, 20000, null, null, null, current_date + 7)::text, true);
select public.record_payment(
  current_setting('app.org')::uuid, '10000000-0000-0000-0000-000000000001', 1000, null, 'cash', null, null, '[]'::jsonb);
reset role;

select is((select currency from public.session_types where id = '40000000-0000-0000-0000-000000000001'), 'GBP', 'a new session type gets the school currency');
select is((select currency from public.client_packages where id = current_setting('app.pkg')::uuid), 'GBP', 'a sold package gets the school currency');
select is((select count(*)::int from public.charges where organization_id = current_setting('app.org')::uuid and currency = 'GBP'), 1, 'the charge for the package is in the school currency');
select is((select count(*)::int from public.payments where organization_id = current_setting('app.org')::uuid and currency = 'GBP'), 1, 'a recorded payment is in the school currency');

select * from finish();
rollback;
