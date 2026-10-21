-- pgTAP: zgody na regulamin i politykę prywatności (tabela consents, wyzwalacz zakładania konta). Uruchomienie: `npx supabase test db`.
begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test', '{"consent_version": "2026-10-21", "locale": "en"}'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test', '{"consent_version": "jutro; drop table"}'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@example.test', '{}');

select is(
  (select string_agg(document || ':' || version, ', ' order by document) from public.consents where user_id = '00000000-0000-0000-0000-0000000000a1'),
  'privacy:2026-10-21, terms:2026-10-21', 'signup with a consent version stores consent to both documents');
select is((select locale from public.consents where user_id = '00000000-0000-0000-0000-0000000000a1' and document = 'terms'), 'en', 'the consent keeps the signup language');
select is((select count(*)::int from public.consents where user_id = '00000000-0000-0000-0000-0000000000b1'), 0, 'a malformed version stores no consent');
select is((select count(*)::int from public.consents where user_id = '00000000-0000-0000-0000-0000000000c1'), 0, 'no metadata means no consent');
select is((select count(*)::int from public.profiles where id in ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1')), 3, 'profiles are still created for every signup');

-- Użytkownik czyta tylko własne zgody i nie może ich zmienić ani dopisać
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select is((select count(*)::int from public.consents), 2, 'a user sees only their own consents');
select throws_ok(
  $$insert into public.consents (user_id, document, version) values ('00000000-0000-0000-0000-0000000000a1', 'terms', '2030-01-01')$$,
  '42501', null, 'a user cannot write consents directly');
select throws_ok($$update public.consents set version = '2030-01-01'$$, '42501', null, 'a user cannot edit consents');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select is((select count(*)::int from public.consents), 0, 'another user sees no consents of someone else');
reset role;

select * from finish();
rollback;
