-- pgTAP: zaproszenia klientów (publiczny podgląd, akceptacja, unieważnianie, ograniczenie prób),
-- psy dodane przez klienta (zatwierdzanie) i dostęp klienta do organizacji.
-- Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(23);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd@example.test');

-- Trener A: organizacja, klienci Anna i Piotr, pakiet dla Anny
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

select lives_ok(
  format($$select public.create_client_invitation(%L::uuid, '10000000-0000-0000-0000-000000000001', 'C@Example.test',
    %L::uuid, repeat('a', 64), repeat('b', 64), now() + interval '7 days')$$,
    current_setting('app.org_a'), current_setting('app.pkg')),
  'trainer creates an invitation for a client');

select is((select count(*)::int from public.invitations where kind = 'client'), 1,
  'trainer sees client invitations');

-- Publiczny podgląd (bez logowania)
set local role anon;
select set_config('request.jwt.claim.sub', '', true);

select is(public.lookup_invitation(repeat('b', 64))->>'status', 'valid', 'anon can look up a valid invitation by code hash');
select is(public.lookup_invitation(repeat('a', 64))->'package'->>'name', 'Pakiet 10', 'lookup shows the package to confirm');
select ok(public.lookup_invitation(repeat('a', 64))->>'email_hint' like 'c***@%', 'e-mail is masked in the lookup');
select is(public.lookup_invitation(repeat('a', 64), 'c@example.test')->>'email_matches', 'true', 'matching e-mail is recognized (case-insensitive)');
select is(public.lookup_invitation(repeat('a', 64), 'ktos@example.test')->>'email_matches', 'false', 'wrong e-mail is detected');
select is(public.lookup_invitation(repeat('z', 64))->>'status', 'not_found', 'unknown secret is not found');

select throws_ok(
  $$select public.accept_invitation(repeat('a', 64))$$,
  '42501', null, 'accepting is not even callable without signing in');

-- Konto z innym e-mailem nie przyjmie zaproszenia przypisanego do konkretnego adresu
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
select throws_ok(
  $$select public.accept_invitation(repeat('a', 64))$$,
  'DT005', null, 'an account with another e-mail cannot accept');

-- Właściwy klient
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select public.accept_invitation(repeat('a', 64));

select is(
  (select count(*)::int from public.client_access
     where user_id = '00000000-0000-0000-0000-0000000000c1' and status = 'active' and relation = 'owner'),
  1, 'accepting creates active owner access');

select throws_ok(
  $$select public.accept_invitation(repeat('a', 64))$$,
  'DT004', null, 'an invitation is single-use');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(public.lookup_invitation(repeat('a', 64))->>'status', 'used', 'a used invitation reports its status only');

-- Klient widzi swoją organizację i dodaje psa do zatwierdzenia
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select is((select count(*)::int from public.organizations), 1, 'client sees its organization');

select lives_ok(
  format($$insert into public.dogs (id, organization_id, client_id, name, approval_status, created_by_client, created_by)
    values ('20000000-0000-0000-0000-0000000000f1', %L::uuid, '10000000-0000-0000-0000-000000000001',
            'Rex', 'pending', true, '00000000-0000-0000-0000-0000000000c1')$$, current_setting('app.org_a')),
  'client can add a dog awaiting approval');

select throws_ok(
  format($$insert into public.dogs (organization_id, client_id, name, approval_status, created_by_client, created_by)
    values (%L::uuid, '10000000-0000-0000-0000-000000000001', 'Szef', 'approved', true,
            '00000000-0000-0000-0000-0000000000c1')$$, current_setting('app.org_a')),
  '42501', null, 'client cannot add an already approved dog');

update public.dogs set approval_status = 'approved' where id = '20000000-0000-0000-0000-0000000000f1';
select is((select approval_status from public.dogs where id = '20000000-0000-0000-0000-0000000000f1'), 'pending',
  'client cannot approve its own dog');

-- Trener: niezatwierdzony pies nie wejdzie do pakietu, zatwierdzony tak
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select throws_ok(
  format($$select public.sell_package(%L::uuid, '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-0000000000f1', null, 'Dla Rexa', 1, 0, 'PLN', null, null, null)$$, current_setting('app.org_a')),
  '23514', null, 'a pending dog cannot be assigned to a package');

update public.dogs set approval_status = 'approved', reviewed_at = now(), reviewed_by = '00000000-0000-0000-0000-0000000000a1'
  where id = '20000000-0000-0000-0000-0000000000f1';
select lives_ok(
  format($$select public.sell_package(%L::uuid, '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-0000000000f1', null, 'Dla Rexa', 1, 0, 'PLN', null, null, null)$$, current_setting('app.org_a')),
  'an approved dog can be assigned to a package');

-- Nowe zaproszenie unieważnia poprzednie oczekujące
select public.create_client_invitation(current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000002',
  null, null, repeat('c', 64), repeat('d', 64), now() + interval '7 days');
select public.create_client_invitation(current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000002',
  null, null, repeat('e', 64), repeat('f', 64), now() + interval '7 days');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select is(public.lookup_invitation(repeat('c', 64))->>'status', 'revoked', 'a newer invitation revokes the previous one');

-- Inna organizacja nie zaprosi cudzego klienta
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select public.create_organization('Org B', 'org-b');
select throws_ok(
  format($$select public.create_client_invitation(%L::uuid, '10000000-0000-0000-0000-000000000001', null, null,
    repeat('1', 64), repeat('2', 64), now() + interval '7 days')$$, current_setting('app.org_a')),
  '42501', null, 'other organization cannot invite our client');

-- Trener odbiera dostęp: klient przestaje widzieć swoje dane
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.revoke_client_access(current_setting('app.org_a')::uuid, '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-0000000000c1');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select is((select count(*)::int from public.clients), 0, 'revoked access hides the client''s data');

-- Ograniczenie zgadywania: po 100 nieudanych próbach podgląd jest blokowany
reset role;
insert into public.invitation_lookup_failures (created_at) select now() from generate_series(1, 100);
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$select public.lookup_invitation(repeat('9', 64))$$,
  'DT003', null, 'too many failed attempts are throttled');

select * from finish();
rollback;
