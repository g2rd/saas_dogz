-- pgTAP: wolne terminy. Lista chętnych, ogłoszenia, zgłoszenia „Biorę” w kolejności, wybór przez trenera, wycofanie,
-- zamknięcie ogłoszenia, prośba „Nie mogę przyjść” i izolacja organizacji.
-- Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(28);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'other@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'anna@example.test'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'piotr@example.test'),
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

insert into public.dogs (id, organization_id, client_id, name)
values ('20000000-0000-0000-0000-000000000002', current_setting('app.org_a')::uuid,
        '10000000-0000-0000-0000-000000000002', 'Luna');

insert into public.session_types (id, organization_id, name, duration_minutes, default_price_minor)
values ('40000000-0000-0000-0000-000000000001', current_setting('app.org_a')::uuid, 'Trening', 60, 10000);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select public.create_organization('Org B', 'org-b');

reset role;
insert into public.client_access (organization_id, client_id, user_id, relation)
values
  (current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'owner'),
  (current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c2', 'owner'),
  (current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c3', 'owner');

-- Anna ma zajęcia, które odwołuje trener ---------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

select set_config('app.s1', public.schedule_session(
  current_setting('app.org_a')::uuid, '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-03-01 10:00+00', 'Park',
  '10000000-0000-0000-0000-000000000001', null)::text, true);

select throws_ok(
  format($$select public.create_slot_offer(%L::uuid, %L::uuid, null)$$, current_setting('app.org_a'), current_setting('app.s1')),
  'DT007', null, 'a scheduled session cannot be offered as a free slot');

select public.cancel_session(current_setting('app.org_a')::uuid, current_setting('app.s1')::uuid, false);

select set_config('app.offer', public.create_slot_offer(
  current_setting('app.org_a')::uuid, current_setting('app.s1')::uuid, 'Zwolnił się termin')::text, true);

select is((select status || ':' || type_name from public.slot_offers where id = current_setting('app.offer')::uuid),
  'open:Trening', 'owner offers the canceled session as a free slot');

select throws_ok(
  format($$select public.create_slot_offer(%L::uuid, %L::uuid, null)$$, current_setting('app.org_a'), current_setting('app.s1')),
  'DT008', null, 'only one open offer per session');

reset role;
select is(
  (select payload ->> 'exclude_client_id' from public.outbox_events
     where type = 'slot_offer.created' and payload ->> 'offer_id' = current_setting('app.offer')),
  '10000000-0000-0000-0000-000000000001', 'the canceling client is excluded from the broadcast');

-- Lista chętnych i widoczność ofert ------------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
select is((select count(*)::int from public.slot_offers), 0, 'a client who is not on the waitlist sees no offers');
select throws_ok(
  format($$select public.claim_slot(%L::uuid, %L::uuid, '10000000-0000-0000-0000-000000000002', null)$$,
    current_setting('app.org_a'), current_setting('app.offer')),
  '42501', null, 'claiming requires being on the waitlist');

insert into public.waitlist_entries (organization_id, client_id, created_by)
values (current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c2');
select is((select count(*)::int from public.slot_offers), 1, 'a waitlisted client sees the open offer');

select throws_ok(
  $$insert into public.waitlist_entries (organization_id, client_id, created_by)
    values ((select organization_id from public.clients where id = '10000000-0000-0000-0000-000000000003'),
            '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c2')$$,
  '42501', null, 'a client cannot put someone else on the waitlist');

-- Zgłoszenia „Biorę” w kolejności ----------------------------------------------------------------------------------------------
select set_config('app.claim_piotr', (public.claim_slot(
  current_setting('app.org_a')::uuid, current_setting('app.offer')::uuid,
  '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002') ->> 'id'), true);

select is(
  (public.claim_slot(current_setting('app.org_a')::uuid, current_setting('app.offer')::uuid,
    '10000000-0000-0000-0000-000000000002', null) ->> 'created')::boolean,
  false, 'repeating a claim does not create a duplicate');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
insert into public.waitlist_entries (organization_id, client_id, created_by)
values (current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c3');

select throws_ok(
  format($$select public.claim_slot(%L::uuid, %L::uuid, '10000000-0000-0000-0000-000000000002', null)$$,
    current_setting('app.org_a'), current_setting('app.offer')),
  '42501', null, 'a client cannot claim on behalf of another client');

select set_config('app.claim_marta', (public.claim_slot(
  current_setting('app.org_a')::uuid, current_setting('app.offer')::uuid,
  '10000000-0000-0000-0000-000000000003', null) ->> 'id'), true);

select is((select count(*)::int from public.slot_claims), 1, 'a client sees only their own claim');

-- Zgłoszenia w jednej transakcji testowej mają ten sam czas; wymuszamy kolejność Piotr, potem Marta
reset role;
update public.slot_claims set created_at = created_at - interval '1 minute' where id = current_setting('app.claim_piotr')::uuid;
set local role authenticated;

-- Trener widzi kolejkę i wybiera ---------------------------------------------------------------------------------------------------
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select is(
  (select string_agg(c.first_name, ',' order by sc.created_at)
     from public.slot_claims sc join public.clients c on c.id = sc.client_id
     where sc.offer_id = current_setting('app.offer')::uuid),
  'Piotr,Marta', 'the trainer sees claims in the order they were made');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select throws_ok(
  format($$select public.accept_slot_claim(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.claim_marta')),
  '42501', null, 'another organization cannot accept claims');
select is((select count(*)::int from public.slot_offers), 0, 'another organization does not see offers');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config('app.new_session', public.accept_slot_claim(
  current_setting('app.org_a')::uuid, current_setting('app.claim_marta')::uuid)::text, true);

select is(
  (select c.first_name from public.session_attendees a join public.clients c on c.id = a.client_id
     where a.session_id = current_setting('app.new_session')::uuid),
  'Marta', 'accepting a claim schedules the session for the chosen client (not necessarily the first)');

select is(
  (select string_agg(status, ',' order by status) from public.slot_claims where offer_id = current_setting('app.offer')::uuid),
  'accepted,declined', 'the chosen claim is accepted and the other is declined');

select is((select status from public.slot_offers where id = current_setting('app.offer')::uuid), 'filled', 'the offer is filled');

select throws_ok(
  format($$select public.accept_slot_claim(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.claim_piotr')),
  'DT009', null, 'a filled offer cannot be accepted again');

reset role;
select is(
  (select count(*)::int from public.outbox_events
     where payload ->> 'offer_id' = current_setting('app.offer')
       and type in ('slot_claim.accepted', 'slot_claim.declined')),
  2, 'accepting writes events for the chosen and the declined client');

-- Zamknięcie ogłoszenia i wycofanie zgłoszenia ---------------------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config('app.s3', public.schedule_session(
  current_setting('app.org_a')::uuid, '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-03-02 10:00+00', null,
  '10000000-0000-0000-0000-000000000001', null)::text, true);
select public.cancel_session(current_setting('app.org_a')::uuid, current_setting('app.s3')::uuid, false);
select set_config('app.offer2', public.create_slot_offer(
  current_setting('app.org_a')::uuid, current_setting('app.s3')::uuid, null)::text, true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
select set_config('app.claim2', (public.claim_slot(
  current_setting('app.org_a')::uuid, current_setting('app.offer2')::uuid,
  '10000000-0000-0000-0000-000000000002', null) ->> 'id'), true);
select lives_ok(
  format($$select public.withdraw_slot_claim(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.claim2')),
  'a client withdraws their own pending claim');
select is((select status from public.slot_claims where id = current_setting('app.claim2')::uuid), 'withdrawn', 'the claim is withdrawn');

select set_config('app.claim2', (public.claim_slot(
  current_setting('app.org_a')::uuid, current_setting('app.offer2')::uuid,
  '10000000-0000-0000-0000-000000000002', null) ->> 'id'), true);
select is((select status from public.slot_claims where id = current_setting('app.claim2')::uuid), 'pending',
  'a withdrawn claim can be made again');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.close_slot_offer(current_setting('app.org_a')::uuid, current_setting('app.offer2')::uuid);
select is((select status from public.slot_claims where id = current_setting('app.claim2')::uuid), 'declined',
  'closing an offer declines pending claims');
select throws_ok(
  format($$select public.close_slot_offer(%L::uuid, %L::uuid)$$, current_setting('app.org_a'), current_setting('app.offer2')),
  'DT009', null, 'a closed offer cannot be closed again');

-- Prośba „Nie mogę przyjść” ---------------------------------------------------------------------------------------------------------------
select set_config('app.s4', public.schedule_session(
  current_setting('app.org_a')::uuid, '40000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000a1', timestamptz '2030-03-03 10:00+00', null,
  '10000000-0000-0000-0000-000000000002', null)::text, true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
select is(
  (public.create_client_request(current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000002', 'cancel',
    null, null, 'Choroba', current_setting('app.s4')::uuid) ->> 'created')::boolean,
  true, 'a client asks to cancel their own session');
select is(
  (public.create_client_request(current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000002', 'cancel',
    null, null, null, current_setting('app.s4')::uuid) ->> 'created')::boolean,
  false, 'repeating the cancel request is idempotent');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c3', true);
select throws_ok(
  format($$select public.create_client_request(%L::uuid, '10000000-0000-0000-0000-000000000003', 'cancel', null, null, null, %L::uuid)$$,
    current_setting('app.org_a'), current_setting('app.s4')),
  'P0002', null, 'a client cannot ask to cancel someone else''s session');
select throws_ok(
  format($$select public.create_client_request(%L::uuid, '10000000-0000-0000-0000-000000000003', 'cancel', null, null, null, null)$$,
    current_setting('app.org_a')),
  '23514', null, 'a cancel request needs a session');

select * from finish();
rollback;
