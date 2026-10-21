-- pgTAP: import klientów z CSV (funkcja import_clients). Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test'),
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.create_organization('Org A', 'org-a');
select set_config('app.org_a', (select id::text from public.organizations where slug = 'org-a'), true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select public.create_organization('Org B', 'org-b');
select set_config('app.org_b', (select id::text from public.organizations where slug = 'org-b'), true);
reset role;

-- Asystent w organizacji A (bez prawa do zapisu klientów)
insert into public.organization_members (organization_id, user_id, role)
values (current_setting('app.org_a')::uuid, '00000000-0000-0000-0000-0000000000d1', 'assistant');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

select is(
  public.import_clients(current_setting('app.org_a')::uuid, '[
    {"first_name": "Anna", "last_name": "Kowalska", "email": "Anna@Example.PL", "phone": "+48600100200", "dog_name": "Burek", "breed": "Labrador"},
    {"first_name": "Jan", "last_name": "Nowak", "email": null, "phone": null, "dog_name": null, "breed": null}
  ]'::jsonb),
  '{"clients": 2, "dogs": 1, "skipped": 0}'::jsonb,
  'import creates clients and their dogs');
select is((select email from public.clients where organization_id = current_setting('app.org_a')::uuid and first_name = 'Anna'), 'anna@example.pl', 'the email is stored in lower case');
select is((select count(*)::int from public.dogs where organization_id = current_setting('app.org_a')::uuid and name = 'Burek' and approval_status = 'approved'), 1, 'the dog is approved');

-- Ten sam e-mail drugi raz: pominięty, nie zdublowany
select is(
  public.import_clients(current_setting('app.org_a')::uuid, '[{"first_name": "Anna", "last_name": "Druga", "email": "anna@example.pl"}]'::jsonb),
  '{"clients": 0, "dogs": 0, "skipped": 1}'::jsonb,
  'a client with an existing email is skipped');

-- Błędy: brak imienia cofa cały import (atomowość)
select throws_ok(
  $$select public.import_clients(current_setting('app.org_a')::uuid, '[{"first_name": "Ola"}, {"first_name": "  "}]'::jsonb)$$,
  '23514', null, 'a row without a first name fails the whole import');
select is((select count(*)::int from public.clients where organization_id = current_setting('app.org_a')::uuid and first_name = 'Ola'), 0, 'nothing is saved after a failed import');

select throws_ok(
  $$select public.import_clients(current_setting('app.org_a')::uuid, '{"first_name": "x"}'::jsonb)$$,
  '22023', null, 'rows must be a JSON array');
select throws_ok(
  $$select public.import_clients(current_setting('app.org_a')::uuid, (select jsonb_agg(jsonb_build_object('first_name', 'K' || g)) from generate_series(1, 501) g))$$,
  '22023', null, 'more than 500 rows are rejected');

-- Cudza szkoła i asystent nie importują
select throws_ok(
  $$select public.import_clients(current_setting('app.org_b')::uuid, '[{"first_name": "Obcy"}]'::jsonb)$$,
  '42501', null, 'a user cannot import into another organization');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
select throws_ok(
  $$select public.import_clients(current_setting('app.org_a')::uuid, '[{"first_name": "Asystent"}]'::jsonb)$$,
  '42501', null, 'an assistant cannot import clients');

-- Niezalogowany nie ma dostępu do funkcji
reset role;
set local role anon;
select throws_ok(
  $$select public.import_clients(current_setting('app.org_a')::uuid, '[{"first_name": "Anon"}]'::jsonb)$$,
  '42501', null, 'anonymous users cannot call the function');
reset role;

select * from finish();
rollback;
