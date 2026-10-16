-- pgTAP: izolacja klientów i psów między organizacjami oraz widoczność dla klienta.
-- Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@example.test'),
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@example.test'),
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'c@example.test');

set local role authenticated;

-- A: organizacja z klientem, psem i dwiema notatkami (jedna widoczna dla klienta)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select public.create_organization('Org A', 'org-a');

insert into public.clients (id, organization_id, first_name, last_name)
select '10000000-0000-0000-0000-000000000001', id, 'Anna', 'Kowalska'
from public.organizations where slug = 'org-a';

insert into public.dogs (id, organization_id, client_id, name)
select '20000000-0000-0000-0000-000000000001', organization_id, id, 'Burek'
from public.clients where id = '10000000-0000-0000-0000-000000000001';

insert into public.dog_notes (organization_id, dog_id, kind, content, visible_to_client)
select organization_id, id, 'behavior', 'Prywatna notatka trenera', false
from public.dogs where id = '20000000-0000-0000-0000-000000000001';

insert into public.dog_notes (organization_id, dog_id, kind, content, visible_to_client)
select organization_id, id, 'health', 'Szczepienie ważne do jesieni', true
from public.dogs where id = '20000000-0000-0000-0000-000000000001';

insert into public.client_access (organization_id, client_id, user_id, relation)
select organization_id, id, '00000000-0000-0000-0000-0000000000c1', 'owner'
from public.clients where id = '10000000-0000-0000-0000-000000000001';

select set_config('app.org_a', (select id::text from public.organizations where slug = 'org-a'), true);

select is((select count(*)::int from public.dog_notes), 2, 'staff sees both notes');

-- B (inna organizacja) nie widzi niczego z organizacji A
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000b1', true);
select public.create_organization('Org B', 'org-b');

select is((select count(*)::int from public.clients), 0, 'B cannot see clients of org A');
select is((select count(*)::int from public.dogs), 0, 'B cannot see dogs of org A');
select is((select count(*)::int from public.dog_notes), 0, 'B cannot see dog notes of org A');

select throws_ok(
  $$insert into public.clients (organization_id, first_name)
    values (current_setting('app.org_a')::uuid, 'Intruz')$$,
  '42501', null, 'B cannot insert a client into org A');

-- C (klient A) widzi siebie, swojego psa i tylko notatkę oznaczoną jako widoczną
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);

select is((select count(*)::int from public.clients), 1, 'client sees only own record');
select is((select count(*)::int from public.dogs), 1, 'client sees own dog');
select is((select content from public.dog_notes), 'Szczepienie ważne do jesieni', 'client sees only visible notes');

select * from finish();
rollback;
