-- pgTAP: niezmienniki bezpieczeństwa całej bazy (przegląd RLS „z perspektywy atakującego”, pilnowany przy każdej zmianie).
-- Test nie sprawdza konkretnych tabel, tylko reguły, które muszą zachodzić dla KAŻDEJ obecnej i przyszłej tabeli i funkcji.
-- Gdy nowa funkcja ma być wołana przez anon albo nie ma sprawdzać tożsamości, trzeba to świadomie dopisać do list poniżej.
-- Uruchomienie: `npx supabase test db` (wymaga Dockera).
begin;
select plan(13);

-- 1. Każda tabela w schemacie public ma włączone RLS (nowa tabela bez RLS = od razu czerwony test)
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '', 'every public table has row level security enabled');

-- 2. Widoki działają z uprawnieniami wywołującego (inaczej omijałyby RLS tabel źródłowych)
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not coalesce('security_invoker=true' = any (c.reloptions), false)),
  '', 'every public view is security_invoker');

-- 3. Żadna polityka nie jest przyznana anon ani „public”
select is(
  (select coalesce(string_agg(tablename || '.' || policyname, ', '), '')
   from pg_policies where schemaname = 'public' and roles && array['anon', 'public']::name[]),
  '', 'no policy applies to anon or public');

-- 4. Funkcje security definer mają pusty search_path (obrona przed podmianą obiektów w ścieżce wyszukiwania)
select is(
  (select coalesce(string_agg(n.nspname || '.' || p.proname, ', ' order by p.proname), '')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'app') and p.prosecdef
     and not exists (select 1 from unnest(p.proconfig) cfg where cfg = 'search_path=""')),
  '', 'every security definer function has an empty search_path');

-- 5. Anon wywołuje tylko jawnie dopuszczone funkcje (publiczne strony zaproszeń i rejestracji)
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  'check_signup_allowed, lookup_invitation, lookup_member_invitation, lookup_school_join',
  'anon can execute only the allowed public functions');

-- 6. Funkcje zadań w tle i panelu właściciela są dostępne tylko dla service_role
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like 'admin\_%' or p.proname in ('claim_outbox_events', 'enqueue_daily_notification_events', 'expire_organization_access'))
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  '', 'background and platform owner functions are not callable by users');

-- 7. Każda funkcja security definer dostępna dla zalogowanych sprawdza tożsamość lub rolę (poza publicznymi wyszukiwarkami)
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and has_function_privilege('authenticated', p.oid, 'execute')
     and p.proname not in ('check_signup_allowed', 'lookup_invitation', 'lookup_member_invitation', 'lookup_school_join')
     and not (p.prosrc ~ 'auth\.uid\(\)' or p.prosrc ~ 'app\.(has_org_role|is_org_member|is_client_of_org|assert_platform_admin)')),
  '', 'every callable security definer function checks the caller identity or role');

-- 8. Funkcje w schemacie public, które nie są definer, nie są dostępne dla anon
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and not p.prosecdef and has_function_privilege('anon', p.oid, 'execute')),
  0, 'no invoker function in public is callable by anon');

-- 9. Anon nie ma żadnych uprawnień do tabel public (publiczne strony idą przez funkcje definer)
select is(
  (select count(*)::int from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'),
  0, 'anon has no table privileges in public');

-- 10. Nikt z aplikacji nie ma TRUNCATE (RLS go nie obejmuje) ani REFERENCES i TRIGGER
select is(
  (select count(*)::int from information_schema.role_table_grants
   where grantee in ('anon', 'authenticated') and table_schema = 'public' and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')),
  0, 'app roles have no TRUNCATE, REFERENCES or TRIGGER privileges');

-- 11. Rejestr pakietów jest tylko do odczytu dla użytkownika (zapisy tylko przez funkcje definer)
select is(
  (select coalesce(string_agg(privilege_type, ', ' order by privilege_type), '')
   from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public' and table_name = 'package_ledger'),
  'SELECT', 'users can only read the package ledger');

-- 12. Tabele właściciela platformy nie są dostępne dla zalogowanych (poza odczytem własnego wpisu w platform_admins)
select is(
  (select count(*)::int from information_schema.role_table_grants
   where grantee = 'authenticated' and table_schema = 'public'
     and table_name in ('beta_codes', 'platform_settings', 'organization_admin_info')),
  0, 'platform owner tables are not accessible to authenticated users');

-- 13. Schemat app (funkcje pomocnicze RLS) nie jest wystawiony przez API
select is(
  (select count(*)::int from pg_namespace n where n.nspname = 'app' and has_schema_privilege('anon', n.oid, 'usage')),
  0, 'the app schema is not usable by anon');

select * from finish();
rollback;
