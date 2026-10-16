# DogTrainer SaaS

Platforma dla trenerów psów: klienci, kalendarz, pakiety zajęć, płatności, zadania domowe.
Next.js (App Router) + TypeScript + Tailwind + Supabase (PostgreSQL, Auth, Storage).

## Uruchomienie

```bash
npm install
cp .env.example .env.local   # uzupełnij klucze Supabase
npm run dev
```

Lokalna baza wymaga Dockera: `npm run db:start`, potem `npm run db:reset` (migracje) i `npm run db:test` (testy RLS).

## Skrypty

| Skrypt | Opis |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript bez emitowania |
| `npm test` | Vitest (logika domenowa) |
| `npm run check:boundaries` | Granice modułów (dependency-cruiser) |
| `npm run db:types` | Typy bazy z lokalnego Supabase |

## Struktura

- `src/app`: trasy (marketing, auth, trainer, client), tylko routing i wywołania przypadków użycia
- `src/modules/<moduł>`: `domain`, `application`, `infrastructure`, `ui`, publiczne API w `index.ts`
- `src/shared`: Money, Result, błędy, kontekst, klienci Supabase, env
- `supabase/migrations`: migracje SQL z RLS; `supabase/tests`: testy pgTAP
- `docs/adr`: decyzje architektoniczne

## Stan

Gotowe (Faza 1, w toku):
- `core`: organizacje, członkostwa, RLS, `create_organization`, kreator pierwszej organizacji, logowanie i proxy sesji
- `clients` i `dogs`: migracja z RLS, domena, repozytoria, przypadki użycia, panel trenera (lista z wyszukiwaniem, szczegóły, formularze, archiwizacja, notatki o psach)
- logika domenowa pakietów i należności z testami

Dalej: kalendarz, pakiety, płatności, panel klienta, import klientów, zaproszenia (zgodnie z planem v2.0).
Nie zweryfikowano jeszcze na żywej bazie: migracje i testy pgTAP wymagają Dockera (`npm run db:start`).
