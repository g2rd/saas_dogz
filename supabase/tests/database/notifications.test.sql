-- pgTAP: powiadomienia i prośby klienta. Izolacja skrzynek, kolumny dozwolone do zmiany, idempotentne prośby klienta,
-- uprawnienia funkcji procesora outbox i idempotencja reguł dziennych.
-- Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(30);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@example.test'),
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd@example.test');

-- Trener A: organizacja, dwóch klientów (Anna z kontem c1, Piotr z kontem e1), pakiet Anny
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.create_organization('Org A', 'org-a');
select set_config('app.org_a', (select id::text from public.organizations where slug = 'org-a'), true);

insert into public.clients (id, organization_id, first_name, last_name)
values
  ('10000000-0000-0000-0000-000000000001', current_setting('app.org_a')::uuid, 'Anna', 'Kowalska'),
  ('10000000-0000-0000-0000-000000000002', current_setting('app.org_a')::uuid, 'Piotr', 'Nowak');

select set_config('app.pkg', public.sell_package(
  current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000001', null, null,
  'Pakiet 10', 10, 80000, 'PLN', null, null, current_date + 7)::text, true);

insert into public.session_types (id, organization_id, name, duration_minutes, default_price_minor)
values ('40000000-0000-0000-0000-000000000001', current_setting('app.org_a')::uuid, 'Trening', 60, 10000);

reset role;
insert into public.organization_members (organization_id, user_id, role)
values (current_setting('app.org_a')::uuid, '00000000-0000-0000-0000-0000000000d1', 'assistant');
insert into public.client_access (organization_id, client_id, user_id, relation)
values
  (current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'owner'),
  (current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000e1', 'owner');

-- Organizacja B
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select public.create_organization('Org B', 'org-b');

-- Prośby klienta ------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);

select set_config('app.req', (public.create_client_request(
  current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000001', 'renew',
  current_setting('app.pkg')::uuid, null, 'Chcę kolejny pakiet') ->> 'id'), true);

select is(
  (select kind || ':' || status from public.client_requests where id = current_setting('app.req')::uuid),
  'renew:new', 'client creates a renewal request');

select is(
  (public.create_client_request(
    current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000001', 'renew',
    current_setting('app.pkg')::uuid, null, null) ->> 'created')::boolean,
  false, 'repeating an open request does not create a duplicate');

select is((select count(*)::int from public.client_requests), 1, 'only one open request exists');

select throws_ok(
  format($$select public.create_client_request(%L::uuid, '10000000-0000-0000-0000-000000000002', 'end', null, null, null)$$,
    current_setting('app.org_a')),
  '42501', null, 'client cannot answer on behalf of another client');

select throws_ok(
  format($$select public.create_client_request(%L::uuid, '10000000-0000-0000-0000-000000000001', 'renew',
    '99999999-9999-9999-9999-999999999999', null, null)$$, current_setting('app.org_a')),
  'P0002', null, 'request for an unknown package is refused');

select throws_ok(
  format($$select public.create_client_request(%L::uuid, '10000000-0000-0000-0000-000000000001', 'refund', null, null, null)$$,
    current_setting('app.org_a')),
  '23514', null, 'unknown request kind is refused');

select throws_ok(
  format($$insert into public.client_requests (organization_id, client_id, kind)
    values (%L::uuid, '10000000-0000-0000-0000-000000000001', 'end')$$, current_setting('app.org_a')),
  '42501', null, 'requests cannot be inserted directly');

-- Widoczność próśb
select is((select count(*)::int from public.client_requests), 1, 'client sees own request');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
select is((select count(*)::int from public.client_requests), 0, 'another client does not see it');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select is((select count(*)::int from public.client_requests), 0, 'other organization does not see it');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
select is((select count(*)::int from public.client_requests), 0, 'assistant does not see client requests');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select is((select count(*)::int from public.client_requests), 1, 'trainer sees the request');

select throws_ok(
  format($$update public.client_requests set note = 'zmiana' where id = %L::uuid$$, current_setting('app.req')),
  '42501', null, 'staff cannot rewrite the content of a request');

update public.client_requests
  set status = 'seen', seen_at = now(), seen_by = '00000000-0000-0000-0000-0000000000a1'
  where id = current_setting('app.req')::uuid;
select is((select status from public.client_requests where id = current_setting('app.req')::uuid), 'seen',
  'staff marks a request as seen');

-- Zdarzenie w outbox
reset role;
select is(
  (select count(*)::int from public.outbox_events
     where type = 'client_request.created' and payload ->> 'request_id' = current_setting('app.req')),
  1, 'request writes an outbox event');

-- Skrzynka powiadomień ---------------------------------------------------------------------------------------------------
insert into public.notifications (organization_id, recipient_user_id, audience, client_id, type, title, dedupe_key)
values
  (current_setting('app.org_a')::uuid, '00000000-0000-0000-0000-0000000000c1', 'client',
   '10000000-0000-0000-0000-000000000001', 'client_package.low_balance', 'Ostatnie zajęcia', 'k1'),
  (current_setting('app.org_a')::uuid, '00000000-0000-0000-0000-0000000000a1', 'staff',
   null, 'client_request.created', 'Prośba klienta', 'k2');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select is((select count(*)::int from public.notifications), 1, 'client sees only own notifications');

update public.notifications set read_at = now() where dedupe_key = 'k1';
select ok((select read_at is not null from public.notifications where dedupe_key = 'k1'), 'user marks own notification as read');

select throws_ok(
  $$update public.notifications set title = 'podmiana' where dedupe_key = 'k1'$$,
  '42501', null, 'user cannot change notification content');

select throws_ok(
  format($$insert into public.notifications (organization_id, recipient_user_id, audience, type, title, dedupe_key)
    values (%L::uuid, '00000000-0000-0000-0000-0000000000c1', 'client', 'x', 'fałszywe', 'k9')$$, current_setting('app.org_a')),
  '42501', null, 'user cannot create notifications');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
select is((select count(*)::int from public.notifications), 0, 'another user sees none of them');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select is((select count(*)::int from public.notification_log), 0, 'delivery log is not exposed to users');

-- Preferencje i subskrypcje push
select lives_ok(
  $$insert into public.notification_preferences (user_id, sms) values ('00000000-0000-0000-0000-0000000000a1', true)$$,
  'user saves own preferences');

select throws_ok(
  $$insert into public.notification_preferences (user_id) values ('00000000-0000-0000-0000-0000000000c1')$$,
  '42501', null, 'user cannot write preferences of someone else');

insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
values ('00000000-0000-0000-0000-0000000000a1', 'https://push.example.test/abc123', 'key', 'auth');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select is((select count(*)::int from public.push_subscriptions), 0, 'push subscriptions are private');

-- Funkcje procesora ---------------------------------------------------------------------------------------------------------
select throws_ok($$select * from public.claim_outbox_events(5)$$, '42501', null,
  'users cannot claim outbox events');
select throws_ok($$select public.enqueue_daily_notification_events()$$, '42501', null,
  'users cannot run daily rules');

reset role;
-- Dane deweloperskie w lokalnej bazie nie mogą zakłócać testu (transakcja jest wycofywana)
update public.outbox_events set processed_at = now()
  where processed_at is null and coalesce(payload ->> 'request_id', '') <> current_setting('app.req');
set local role service_role;
select ok((select count(*) from public.claim_outbox_events(100)) > 0, 'service role claims pending events');
select is((select count(*)::int from public.claim_outbox_events(100)), 0, 'claimed events are locked for other workers');

-- Reguły dzienne: należność za 1 dzień, zaległa, zajęcia za 2 godziny; ponowne uruchomienie nic nie dubluje
reset role;
insert into public.charges (organization_id, client_id, amount_minor, due_date, description)
values
  (current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000002', 5000, current_date + 1, 'Wkrótce'),
  (current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000002', 7000, current_date - 10, 'Zaległa');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.schedule_session(
  current_setting('app.org_a')::uuid, '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', now() + interval '2 hours', null,
  '10000000-0000-0000-0000-000000000001', null);
reset role;

set local role service_role;
select ok(public.enqueue_daily_notification_events() >= 3, 'daily rules enqueue due, overdue and session reminder events');
select is(public.enqueue_daily_notification_events(), 0, 'running daily rules again enqueues nothing new');
reset role;

select * from finish();
rollback;
