# DogTrainer SaaS

Platforma dla trenerów psów w Polsce: klienci i psy, kalendarz zajęć, pakiety rozliczane z dziennika zużyć, płatności,
powiadomienia po obu stronach (dzwonek, web push, e-mail) i panel klienta jako PWA.
Next.js 16 (App Router) + TypeScript + Tailwind 4 + Supabase (PostgreSQL, Auth).

**Stan, architektura i lista zadań: [docs/ARCHITEKTURA-I-STAN-PRAC.md](docs/ARCHITEKTURA-I-STAN-PRAC.md)** (źródło prawdy, czytaj najpierw).
Ścieżka do sprzedaży, limitacje i ryzyka: [docs/WDROZENIE-PRODUKCYJNE.md](docs/WDROZENIE-PRODUKCYJNE.md). Staging (pierwsze środowisko zdalne): [docs/WDROZENIE-STAGING.md](docs/WDROZENIE-STAGING.md). Instrukcje wdrożenia krok po kroku: [wersja demo dla 10 testerów](docs/WDROZENIE-DEMO-10-TESTEROW.md) i [pełne wdrożenie produkcyjne](docs/WDROZENIE-PELNE-PRODUKCJA.md). Decyzje: `docs/adr/`.
Wielojęzyczność (plan, decyzje, dodawanie języków): [docs/WDROZENIE-WIELOJEZYCZNOSCI.md](docs/WDROZENIE-WIELOJEZYCZNOSCI.md).
Instrukcja dla testujących trenerów: [docs/INSTRUKCJA-DLA-TRENERA.md](docs/INSTRUKCJA-DLA-TRENERA.md).
Zasady pracy dla agenta: `CLAUDE.md` i `AGENTS.md` (ten Next.js ma zmiany łamiące zgodność; dokumentacja w `node_modules/next/dist/docs/`).

## Uruchomienie

**Pełna instrukcja krok po kroku (środowisko, konta, testy, scenariusze ręczne, typowe problemy): [docs/LOKALNE-SRODOWISKO.md](docs/LOKALNE-SRODOWISKO.md).** Skrót:

```bash
npm install
npm run db:start             # lokalny Supabase (wymaga Dockera); wypisze URL i klucze
cp .env.example .env.local   # uzupełnij klucze Supabase i pozostałe zmienne (opis w pliku)
npm run db:reset             # migracje (kasuje dane lokalne)
npm run seed:local           # konta i dane testowe (tylko lokalnie)
npm run dev                  # http://localhost:3000
```

Na Windowsie w PowerShellu używaj `npm.cmd` i `npx.cmd`. Poczta lokalna (Mailpit): `http://127.0.0.1:54324`.
Test push i instalacji PWA na telefonie (tunel HTTPS): sekcja 7 dokumentu o stanie prac.

## Skrypty

| Skrypt | Opis |
| --- | --- |
| `npm run dev` / `build` / `start` | Serwer deweloperski (sam przetwarza powiadomienia co 10 s) / build / wersja produkcyjna |
| `npm run lint` | ESLint |
| `npm run typecheck` | Generowanie typów tras i TypeScript bez emitowania |
| `npm test` | Vitest (logika domenowa, symulacja service workera) |
| `npm run db:test` | Testy pgTAP (RLS, funkcje SQL), wymaga lokalnego Supabase |
| `npm run test:integration` | Przypadki użycia na prawdziwej bazie (z Mailpit) |
| `npm run e2e` | Testy end-to-end w przeglądarce (Playwright): buduje i uruchamia aplikację na porcie 3100, wymaga lokalnego Supabase; `npm run e2e:ui` otwiera podgląd interaktywny |
| `npm run check:boundaries` | Granice modułów (dependency-cruiser) |
| `npm run outbox:run` | Ręczne wywołanie przetwarzania powiadomień przez trasę cron (`CRON_SECRET`) |
| `npm run seed:local` | **Odtwarza komplet kont testowych i danych** (trener, klientka, drugi trener; hasła w [docs/LOKALNE-SRODOWISKO.md](docs/LOKALNE-SRODOWISKO.md)); bezpieczne do wielokrotnego uruchamiania |
| `npm run seed:dev` | Dane deweloperskie jednej szkoły (używa go `seed:local`) |
| `npm run db:backup` / `db:restore -- plik` | Kopia danych lokalnej bazy przed `db:reset` / odtworzenie kopii |
| `npm run seed:demo` | Dane demo dla panelu `/admin`: 10 szkół o różnym statusie i aktywności (tylko lokalnie; hasło kont demo w dokumencie o stanie prac) |
| `npm run env:check -- --file .env.staging` | Kontrola zmiennych środowiskowych wdrożenia (format, sekrety, klucze demo); nie wypisuje wartości |
| `npm run smoke -- https://adres` | Test dymny wdrożenia (strony, PWA, nagłówki bezpieczeństwa, cron); z `CRON_SECRET` w środowisku sprawdza też cron |
| `npm run admin:grant -- adres@example.pl` | Nadaje (albo z `--revoke` odbiera) uprawnienia właściciela platformy, czyli dostęp do `/admin`; konto właściciela jest osobne od konta trenera (odmawia kontom ze szkołą lub panelem klienta, `--force` wyjątkowo) |
| `npm run db:start` / `db:reset` / `db:types` | Lokalny Supabase / migracje / typy bazy |

## Struktura

- `src/app`: trasy (marketing, auth, panel trenera `/app`, panel klienta `/portal`, panel właściciela `/admin`, `/api/cron/outbox`), tylko routing i wywołania przypadków użycia
- `src/modules/<moduł>`: `domain`, `application`, `infrastructure`, `ui`, publiczne API w `index.ts` (moduły: `core`, `clients`, `dogs`, `packages`, `payments`, `scheduling`, `invitations`, `portal`, `notifications`, `platform`)
- `src/shared`: Money, Result, błędy, kontekst, klienci Supabase, env, wspólne UI (formularze, potwierdzenie, PWA)
- `supabase/migrations`: migracje SQL z RLS; `supabase/tests`: testy pgTAP
- `public`: service worker, strona offline, ikony PWA; `scripts`: seed, outbox, generator ikon
- `docs`: stan prac i architektura, plan wdrożenia, `adr/` (decyzje 0001-0014)

## Stan (2026-10-21)

Zrobione i scalone do `dev`: fundament i RLS, klienci i psy, pakiety i płatności (ze stornem), zajęcia (z cofaniem pomyłek),
zaproszenia klientów i personelu, panel klienta, powiadomienia (dzwonek, web push, e-mail), prośby klientów, wolne terminy z listą
chętnych, PWA z panelem trenera na telefonie, potwierdzenia wrażliwych operacji, panel właściciela platformy (użycie, blokowanie dostępu, kody beta). `main` zawiera etapy do zaproszeń i panelu klienta;
reszta czeka na zatwierdzenie właściciela.

Następny krok: oddanie aplikacji testerom na 2 tygodnie (staging z HTTPS, test push na telefonach, regulamin i zgody, formularz opinii,
import CSV), potem decyzja o opłatach. Pełna lista w sekcji 8 dokumentu o stanie prac.
