-- pgTAP: cofanie pomyłek. Okno 30 s przed wysyłką powiadomień, cofnięcie zakończenia (do końca dnia) i odwołania zajęć,
-- storno wpłaty, anulowanie pakietu, kompensaty w rejestrach i uprawnienia.
-- Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(31);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'assistant@example.test'),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'marta@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.create_organization('Org A', 'org-a');
select set_config('app.org_a', (select id::text from public.organizations where slug = 'org-a'), true);

insert into public.clients (id, organization_id, first_name, last_name)
values
  ('10000000-0000-0000-0000-000000000001', current_setting('app.org_a')::uuid, 'Anna', 'Kowalska'),
  ('10000000-0000-0000-0000-000000000002', current_setting('app.org_a')::uuid, 'Piotr', 'Nowak'),
  ('10000000-0000-0000-0000-000000000003', current_setting('app.org_a')::uuid, 'Marta', 'Zielińska');

insert into public.session_types (id, organization_id, name, duration_minutes, default_price_minor)
values ('40000000-0000-0000-0000-000000000001', current_setting('app.org_a')::uuid, 'Trening', 60, 10000);

select set_config('app.pkg', public.sell_package(
  current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000001', null, null,
  'Pakiet 5', 5, 50000, 'PLN', null, null, current_date + 7)::text, true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select public.create_organization('Org B', 'org-b');

reset role;
insert into public.organization_members (organization_id, user_id, role)
values (current_setting('app.org_a')::uuid, '00000000-0000-0000-0000-0000000000d1', 'assistant');
insert into public.client_access (organization_id, client_id, user_id, relation)
values (current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c3', 'owner');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

-- Okno 30 s i znoszenie zaplanowania z odwołaniem --------------------------------------------------------------------------------
select set_config('app.s0', public.schedule_session(
  current_setting('app.org_a')::uuid, '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-04-01 08:00+00', null,
  '10000000-0000-0000-0000-000000000001', null)::text, true);

reset role;
select ok(
  (select not_before > now() + interval '20 seconds' from public.outbox_events
     where type = 'training_session.scheduled' and payload ->> 'session_id' = current_setting('app.s0')),
  'events caused by the trainer wait 30 s before they can be sent');

set local role service_role;
select is((select count(*)::int from public.claim_outbox_events(100)
             where payload ->> 'session_id' = current_setting('app.s0')), 0,
  'the worker cannot claim an event inside the undo window');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.cancel_session(current_setting('app.org_a')::uuid, current_setting('app.s0')::uuid, false);
reset role;
select is((select count(*)::int from public.outbox_events
             where processed_at is null and payload ->> 'session_id' = current_setting('app.s0')), 0,
  'scheduling and canceling within the window cancel each other out (nobody is notified)');

-- Cofnięcie zakończenia zajęć ---------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config('app.s1', public.schedule_session(
  current_setting('app.org_a')::uuid, '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-04-02 08:00+00', null,
  '10000000-0000-0000-0000-000000000001', null)::text, true);
select public.complete_session(current_setting('app.org_a')::uuid, current_setting('app.s1')::uuid, null, 'ok', false);
select is((select balance from public.v_client_package_balance where id = current_setting('app.pkg')::uuid), 4, 'completing consumes a session');

select public.undo_complete_session(current_setting('app.org_a')::uuid, current_setting('app.s1')::uuid);
select is((select balance from public.v_client_package_balance where id = current_setting('app.pkg')::uuid), 5,
  'undoing the completion returns the session to the package');
select is((select status from public.training_sessions where id = current_setting('app.s1')::uuid), 'scheduled', 'the session is scheduled again');
select is((select attendance from public.session_attendees where session_id = current_setting('app.s1')::uuid), 'planned', 'the attendee is planned again');
select is((select count(*)::int from public.package_ledger
             where client_package_id = current_setting('app.pkg')::uuid and reason = 'adjustment' and delta = 1),
  1, 'the ledger keeps a compensating entry instead of deleting history');
select throws_ok(
  format($$select public.undo_complete_session(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.s1')),
  'DT002', null, 'a session that is not completed cannot be undone');

-- Zajęcia bez pakietu: należność jest anulowana, a opłaconej nie wolno cofnąć
select set_config('app.s2', public.schedule_session(
  current_setting('app.org_a')::uuid, '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-04-03 08:00+00', null,
  '10000000-0000-0000-0000-000000000002', null)::text, true);
select public.complete_session(current_setting('app.org_a')::uuid, current_setting('app.s2')::uuid, null, null, true);
select public.undo_complete_session(current_setting('app.org_a')::uuid, current_setting('app.s2')::uuid);
select ok((select voided_at is not null from public.charges where source_type = 'session' and source_id = current_setting('app.s2')::uuid),
  'undoing a completion without a package voids the unpaid session charge');

select public.complete_session(current_setting('app.org_a')::uuid, current_setting('app.s2')::uuid, null, null, true);
select set_config('app.charge2', (select id::text from public.charges
  where source_type = 'session' and source_id = current_setting('app.s2')::uuid and voided_at is null), true);
select set_config('app.pay2', public.record_payment(
  current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000002', 10000, 'PLN', 'cash', null, null,
  jsonb_build_array(jsonb_build_object('charge_id', current_setting('app.charge2'), 'amount_minor', 10000)))::text, true);
select throws_ok(
  format($$select public.undo_complete_session(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.s2')),
  'DT010', null, 'a paid session charge blocks the undo (void the payment first)');

-- Storno wpłaty ---------------------------------------------------------------------------------------------------------------------------
select is((select allocated_minor from public.v_charge_balance where id = current_setting('app.charge2')::uuid), 10000, 'the payment settled the charge');
select public.void_payment(current_setting('app.org_a')::uuid, current_setting('app.pay2')::uuid);
select is((select allocated_minor from public.v_charge_balance where id = current_setting('app.charge2')::uuid), 0, 'voiding the payment frees the charge');
select is((select paid_minor from public.v_client_balance where client_id = '10000000-0000-0000-0000-000000000002'), 0,
  'the voided payment no longer counts as paid');
select ok((select voided_at is not null from public.payments where id = current_setting('app.pay2')::uuid), 'the payment stays in history as voided');
select throws_ok(
  format($$select public.void_payment(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.pay2')),
  'DT014', null, 'a payment can be voided only once');
select lives_ok(
  format($$select public.undo_complete_session(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.s2')),
  'after voiding the payment the completion can be undone');

-- Okno „do końca dnia”
select set_config('app.s3', public.schedule_session(
  current_setting('app.org_a')::uuid, '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-04-04 08:00+00', null,
  '10000000-0000-0000-0000-000000000001', null)::text, true);
select public.complete_session(current_setting('app.org_a')::uuid, current_setting('app.s3')::uuid, null, null, false);
reset role;
update public.training_sessions set completed_at = now() - interval '2 days' where id = current_setting('app.s3')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select throws_ok(
  format($$select public.undo_complete_session(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.s3')),
  'DT012', null, 'the completion can be undone only until the end of the day');

-- Przywrócenie odwołanych zajęć --------------------------------------------------------------------------------------------------------
select set_config('app.s4', public.schedule_session(
  current_setting('app.org_a')::uuid, '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-04-05 08:00+00', null,
  '10000000-0000-0000-0000-000000000001', null)::text, true);
select public.cancel_session(current_setting('app.org_a')::uuid, current_setting('app.s4')::uuid, true);
select is((select balance from public.v_client_package_balance where id = current_setting('app.pkg')::uuid), 3,
  'a late cancellation takes a session (the completion from s3 plus the late cancel)');
select public.undo_cancel_session(current_setting('app.org_a')::uuid, current_setting('app.s4')::uuid);
select is((select balance from public.v_client_package_balance where id = current_setting('app.pkg')::uuid), 4, 'restoring returns the session to the package');
select is((select status from public.training_sessions where id = current_setting('app.s4')::uuid), 'scheduled', 'the canceled session is scheduled again');
reset role;
select is((select count(*)::int from public.outbox_events
             where type in ('training_session.canceled', 'training_session.restored')
               and payload ->> 'session_id' = current_setting('app.s4') and processed_at is null), 0,
  'restoring inside the window sends nobody anything');

-- Po wysłaniu „Zajęcia odwołane” przywrócenie wysyła informację
reset role;
update public.outbox_events set processed_at = now(), created_at = created_at - interval '1 hour' where payload ->> 'session_id' = current_setting('app.s4');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.cancel_session(current_setting('app.org_a')::uuid, current_setting('app.s4')::uuid, false);
reset role;
update public.outbox_events set processed_at = now() where type = 'training_session.canceled' and payload ->> 'session_id' = current_setting('app.s4');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.undo_cancel_session(current_setting('app.org_a')::uuid, current_setting('app.s4')::uuid);
reset role;
select is((select count(*)::int from public.outbox_events
             where type = 'training_session.restored' and payload ->> 'session_id' = current_setting('app.s4')), 1,
  'restoring after the client was notified sends a “restored” message');

-- Termin oddany innej osobie i zajęcia z przeszłości
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config('app.s5', public.schedule_session(
  current_setting('app.org_a')::uuid, '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-04-06 08:00+00', null,
  '10000000-0000-0000-0000-000000000001', null)::text, true);
select public.cancel_session(current_setting('app.org_a')::uuid, current_setting('app.s5')::uuid, false);
select set_config('app.offer', public.create_slot_offer(
  current_setting('app.org_a')::uuid, current_setting('app.s5')::uuid, null)::text, true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
insert into public.waitlist_entries (organization_id, client_id, created_by)
values (current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c3');
select set_config('app.claim', (public.claim_slot(
  current_setting('app.org_a')::uuid, current_setting('app.offer')::uuid,
  '10000000-0000-0000-0000-000000000003', null) ->> 'id'), true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.accept_slot_claim(current_setting('app.org_a')::uuid, current_setting('app.claim')::uuid);
select throws_ok(
  format($$select public.undo_cancel_session(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.s5')),
  'DT013', null, 'a slot already given to someone else cannot be restored');

select set_config('app.s6', public.schedule_session(
  current_setting('app.org_a')::uuid, '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', timestamptz '2020-01-01 08:00+00', null,
  '10000000-0000-0000-0000-000000000001', null)::text, true);
select public.cancel_session(current_setting('app.org_a')::uuid, current_setting('app.s6')::uuid, false);
select throws_ok(
  format($$select public.undo_cancel_session(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.s6')),
  'DT002', null, 'a canceled session from the past cannot be restored');

-- Zamknięcie ogłoszenia w oknie wycofuje powiadomienie o wolnym terminie
select set_config('app.s7', public.schedule_session(
  current_setting('app.org_a')::uuid, '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-04-07 08:00+00', null,
  '10000000-0000-0000-0000-000000000001', null)::text, true);
select public.cancel_session(current_setting('app.org_a')::uuid, current_setting('app.s7')::uuid, false);
select set_config('app.offer2', public.create_slot_offer(
  current_setting('app.org_a')::uuid, current_setting('app.s7')::uuid, null)::text, true);
select public.close_slot_offer(current_setting('app.org_a')::uuid, current_setting('app.offer2')::uuid);
reset role;
select is((select count(*)::int from public.outbox_events
             where type = 'slot_offer.created' and payload ->> 'offer_id' = current_setting('app.offer2') and processed_at is null), 0,
  'closing an offer inside the window cancels the pending announcement');

-- Anulowanie pakietu ------------------------------------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config('app.pkg2', public.sell_package(
  current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000003', null, null,
  'Pakiet testowy', 3, 30000, 'PLN', null, null, current_date + 7)::text, true);
select public.cancel_package(current_setting('app.org_a')::uuid, current_setting('app.pkg2')::uuid);
select ok((select canceled_at is not null from public.client_packages where id = current_setting('app.pkg2')::uuid), 'an unused package can be canceled');
select ok((select voided_at is not null from public.charges where source_type = 'client_package' and source_id = current_setting('app.pkg2')::uuid),
  'canceling the package voids its unpaid charge');
select throws_ok(
  format($$select public.cancel_package(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.pkg')),
  'DT011', null, 'a package that was already used cannot be canceled');

-- Uprawnienia ------------------------------------------------------------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
select throws_ok(
  format($$select public.void_payment(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.pay2')),
  '42501', null, 'an assistant cannot void payments');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select throws_ok(
  format($$select public.undo_cancel_session(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.s4')),
  '42501', null, 'another organization cannot restore sessions');

select * from finish();
rollback;
