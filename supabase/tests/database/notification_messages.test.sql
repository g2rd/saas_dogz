-- pgTAP: powiadomienia wielojęzyczne (klucz komunikatu + parametry). Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.create_organization('Org A', 'org-a');
select set_config('app.org', (select id::text from public.organizations where slug = 'org-a'), true);
reset role;

-- Zapis procesora (service_role / właściciel bazy): klucz i parametry
insert into public.notifications (organization_id, recipient_user_id, audience, type, title, body, message_key, message_params, dedupe_key)
values (current_setting('app.org')::uuid, '00000000-0000-0000-0000-0000000000a1', 'staff', 'payment.recorded', 'Zaksięgowano wpłatę', '',
        'payment_recorded', '{"amountMinor": 5000, "currency": "PLN"}', 'k1');

-- Starsze powiadomienie bez klucza (sprzed etapu 4) nadal jest poprawne
insert into public.notifications (organization_id, recipient_user_id, audience, type, title, dedupe_key)
values (current_setting('app.org')::uuid, '00000000-0000-0000-0000-0000000000a1', 'staff', 'x', 'Stary tytuł', 'k2');

select is((select message_key from public.notifications where dedupe_key = 'k2'), null, 'a legacy notification has no message key');
select is((select message_params from public.notifications where dedupe_key = 'k2'), '{}'::jsonb, 'a legacy notification has empty params');
select is((select message_params ->> 'currency' from public.notifications where dedupe_key = 'k1'), 'PLN', 'params are stored as JSON');

select throws_ok(
  $$insert into public.notifications (organization_id, recipient_user_id, audience, type, title, message_key, dedupe_key)
    values (current_setting('app.org')::uuid, '00000000-0000-0000-0000-0000000000a1', 'staff', 'x', 't', 'Bad Key!', 'k3')$$,
  '23514', null, 'a message key must be a simple lower-case identifier');
select throws_ok(
  $$insert into public.notifications (organization_id, recipient_user_id, audience, type, title, message_params, dedupe_key)
    values (current_setting('app.org')::uuid, '00000000-0000-0000-0000-0000000000a1', 'staff', 'x', 't', '[1,2]', 'k4')$$,
  '23514', null, 'params must be a JSON object');

-- Użytkownik widzi swoje klucze i parametry, ale nie może ich zmienić (tylko read_at)
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select is((select message_key from public.notifications where dedupe_key = 'k1'), 'payment_recorded', 'the recipient reads the message key');
select throws_ok(
  $$update public.notifications set message_key = 'org_suspended' where dedupe_key = 'k1'$$,
  '42501', null, 'the recipient cannot change the message key');
select throws_ok(
  $$update public.notifications set message_params = '{}' where dedupe_key = 'k1'$$,
  '42501', null, 'the recipient cannot change the params');
reset role;

select * from finish();
rollback;
