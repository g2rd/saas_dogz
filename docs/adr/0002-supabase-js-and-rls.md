# ADR 0002: supabase-js, RLS jako druga linia obrony

**Status:** przyjęta (2026-10-16)

## Decyzja
Dostęp do danych przez `supabase-js` w kontekście zalogowanego użytkownika (`src/shared/supabase/server.ts`), z typami generowanymi przez `npm run db:types`. ORM łączący się bezpośrednio z bazą zwykle omija RLS, więc go nie używamy.

- Każda tabela organizacji ma `organization_id` i włączone RLS.
- Funkcje pomocnicze RLS (`app.is_org_member`, `app.has_org_role`, `app.shares_org_with`) są w schemacie `app`, niewystawionym przez API, jako `security definer` z pustym `search_path`.
- W politykach `(select auth.uid())` zamiast `auth.uid()`.
- Operacje atomowe (np. `create_organization`) jako funkcje PostgreSQL wywoływane przez `rpc()`.
- `service_role` tylko w zadaniach w tle, webhookach i panelu administratora (`src/shared/supabase/admin.ts`).
- Migracje SQL w `supabase/migrations`, zakaz ręcznych zmian w panelu produkcyjnym.

## Konsekwencje
Autoryzacja ma dwie warstwy: `authorize(ctx, permission)` w przypadku użycia i RLS w bazie. Testy izolacji organizacji (`supabase/tests/database`) mają być częścią CI.
