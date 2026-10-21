# DogTrainer SaaS: architektura, stan prac i lista zadań

Stan na 2026-10-21 (`origin/dev` = `ee20159`, `origin/main` = `19b334a`). Dokument opisuje, jak zbudowana jest aplikacja, co jest zrobione i sprawdzone, co zostało do zrobienia i jakie decyzje podjął właściciel. Pokrewne pliki: [WDROZENIE-PRODUKCYJNE.md](WDROZENIE-PRODUKCYJNE.md) (ścieżka do pierwszej sprzedaży, limitacje i ryzyka), [WDROZENIE-DEMO-10-TESTEROW.md](WDROZENIE-DEMO-10-TESTEROW.md) (instrukcja: demo dla 10 trenerów z panelem właściciela i blokowaniem dostępu), [WDROZENIE-PELNE-PRODUKCJA.md](WDROZENIE-PELNE-PRODUKCJA.md) (instrukcja: pełne wdrożenie i sprzedaż), `docs/adr/` (zapisy decyzji), `CLAUDE.md` i `AGENTS.md` (zasady pracy dla agenta), `README.md` (skrót dla nowej osoby).

## 0. Start nowej sesji: czytaj to najpierw

**Zasada pracy (wymóg właściciela): ten plik jest źródłem prawdy o stanie projektu. Każda zmiana (etap, migracja, decyzja, znaleziony błąd, nowe zadanie) musi go aktualizować w tym samym commicie, tak żeby kolejna sesja wiedziała dokładnie, co jest zrobione i co zostało.** Przed zakończeniem pracy zaktualizuj: tabelę etapów poniżej, sekcję 5 (co zrobione), sekcję 6 (wyniki testów), sekcję 8 (lista zadań), a decyzje projektowe zapisz w `docs/adr/`. Pamiętaj o `AGENTS.md`: ten Next.js ma zmiany łamiące zgodność, dokumentacja jest w `node_modules/next/dist/docs/`.

### Stan na teraz

| Etap | Status | Gdzie |
| --- | --- | --- |
| Fundament, klienci, psy, rejestracja i reset hasła | ✅ | `main` |
| 1. Pakiety i płatności | ✅ | `main` |
| 2. Zajęcia i zużywanie pakietu | ✅ | `main` |
| 3. Zaproszenia klientów (QR, link, kod) i panel klienta `/portal` | ✅ | `main` |
| 4. Powiadomienia (dzwonek, web push, e-mail), odpowiedzi klienta, wysyłka zaproszeń, zespół i zaproszenia personelu | ✅ (ADR 0008) | `dev`, **czeka na zatwierdzenie do `main`** |
| 4b. Usunięcie SMS (decyzja właściciela) | ✅ (migracja 0008) | `dev` |
| 5. PWA i panel trenera na telefonie | ✅ kod, ⏳ test na prawdziwych telefonach (ADR 0009) | `dev` |
| 6. Jasny motyw, menu „Więcej” w portalu klienta | ✅ | `dev` |
| 7. Wolne terminy: lista chętnych, „Biorę”, wybór trenera, „Nie mogę przyjść” | ✅ (ADR 0010, migracja 0009) | `dev` |
| 8. Potwierdzenia, cofanie pomyłek, okno 30 s (ADR 0011, migracja 0010) | ✅ | `dev` |
| 9. Panel właściciela `/admin`, status szkoły (próba/aktywna/tylko do odczytu/zawieszona) z blokadą w bazie, zamknięta rejestracja kodami beta, MFA admina, poprawka błędu 500 przy wyborze zgłoszenia na wolny termin (ADR 0012, migracja 0011) | ✅ kod i testy, ⏳ zostały przeklikać rejestrację z kodem w przeglądarce i test na środowisku zdalnym | `dev` (lokalnie, niewypchnięte) |
| **10. Oddanie testerom na 2 tygodnie** (staging z HTTPS, regulamin i zgody, formularz opinii, import CSV, seed demo) | ⏳ **następny krok** (sekcja 8, instrukcja: `WDROZENIE-DEMO-10-TESTEROW.md`) | |

Zdalne repozytorium: `https://github.com/g2rd/saas_dogz`. **Gałąź `dev` jest gałęzią integracyjną: tam trafiają wszystkie zmiany. `main` zawiera tylko to, co właściciel zatwierdził; do `main` wchodzimy dopiero po jego wyraźnym zatwierdzeniu (merge `dev` do `main` i push).** Ostatnie wypchnięcie `dev`: 2026-10-16 (commit `ee20159`). `main` jest nadal na etapach do 3.

### Decyzje właściciela (obowiązują)
- **SMS: rezygnacja.** Kanały powiadomień to dzwonek, web push i e-mail (e-mail zostaje też dla zaproszeń, potwierdzenia konta i resetu hasła).
- **PWA jest ważna na telefonach**; natywna aplikacja (Capacitor lub Expo) dopiero po walidacji z trenerami.
- **Najpierw 2 tygodnie testów bez płatności, potem opłaty, jeśli komuś się spodoba.** Freemium (2 klientów za darmo), plany i Stripe Billing odłożone (analiza w `WDROZENIE-PRODUKCYJNE.md`, sekcja 7).
- Prośby klienta („Odnów”, „Zapłacę”, „Kończę”, „Nie mogę przyjść”) są informacją dla trenera, bez akceptacji; ogłoszony wolny termin przydziela trener (nie automat).
- Potwierdzenia na wrażliwych operacjach, okno 30 s i cofanie do końca dnia (zakończenie zajęć).
- **Commity bez dopisku `Co-Authored-By` o Claude.**
- Aplikacja tylko w jasnym motywie.
- **Właściciel platformy** musi widzieć użycie (ile szkół, trenerów, klientów) i móc blokować dostęp (koniec testów, brak płatności): panel `/admin` (ADR 0012). Dostęp: to samo logowanie e-mail + hasło, osobne konto z wpisem w `platform_admins` i weryfikacja dwuetapowa TOTP (wymagana na produkcji).

### Jak pracujemy (definicja „zrobione” dla etapu)
1. Nowa gałąź `feat/...` z `dev`; po zakończeniu scalamy ją do `dev` (fast-forward). **`main` zmieniamy wyłącznie po zatwierdzeniu przez właściciela.** `git push` robimy tylko na prośbę właściciela; logowanie do GitHuba idzie przez przeglądarkę, więc push uruchamiaj w terminalu użytkownika (`run_in_terminal`), nie w powłoce agenta.
2. Migracja SQL z RLS (nowa tabela = polityki + test pgTAP); zapisy wielotabelowe jako funkcje `security definer`, które same sprawdzają rolę i przynależność identyfikatorów do organizacji; wyścigi: blokada wiersza osobnym zapytaniem, dopiero potem odczyt stanu.
3. Domena z testami jednostkowymi, przypadki użycia z `authorize`, repozytoria, testy integracyjne na prawdziwej bazie (izolacja organizacji, wyścigi).
4. UI mobile-first, przeklikanie w przeglądarce, poprawki znalezionych błędów.
5. Muszą przechodzić: `npm run typecheck`, `lint`, `test`, `db:test`, `test:integration`, `check:boundaries`, `build`.
6. ADR dla decyzji, aktualizacja tego pliku, commit (opis po angielsku, bez dopisku o współautorstwie).

### Pułapki środowiska (Windows)
- W PowerShellu skrypty `.ps1` bywają zablokowane: używaj `npm.cmd` i `npx.cmd`.
- `next dev`/Turbopack po przełączaniu gałęzi gitem potrafi zostać przy starym CSS: usuń `.next/dev` i zrestartuj. Dwa serwery `next dev` w jednym katalogu mogą sobie przeszkadzać.
- Pętla `outbox:run` albo `next dev` działająca równolegle potrafi zakłócać testy integracyjne (przetwarza zdarzenia testów); przy pełnym pakiecie testów ją zatrzymaj.
- Pliki mają mieszane końce linii (CRLF/LF, `core.autocrlf=true`): skrypty zmieniające tekst wieloliniowy muszą to uwzględniać.

## 1. Cel produktu

Platforma multi-tenant dla trenerów psów w Polsce: klienci i psy, kalendarz treningów, pakiety zajęć rozliczane z dziennika zużyć, płatności (należności, wpłaty, alokacje), powiadomienia po obu stronach, panel klienta (PWA) i, w dalszych fazach, zadania domowe z filmami. Model biznesowy: abonament (Start 49 zł, Pro 79 zł, Szkoła 119 zł netto; hipotezy do walidacji). Strategia: wąski, dopracowany rdzeń do szybkiej sprzedaży, bez długu technologicznego, który wymusiłby przepisywanie przy setkach klientów.

## 2. Stos technologiczny (stan faktyczny)

| Warstwa | Wybór | Uwagi |
| --- | --- | --- |
| Framework | Next.js 16.4 (App Router, Turbopack), React 19.3 | Włączone `cacheComponents` i `partialPrefetching`. W Next 16 `middleware` to `proxy` (`src/proxy.ts`). |
| Język | TypeScript strict | |
| Style | Tailwind CSS 4 | Tylko jasny motyw (`@custom-variant dark` wyłączony), kolor główny zielony (`bg-primary`), własne proste komponenty w `src/shared/ui`. |
| Baza i auth | Supabase (PostgreSQL, Auth), `@supabase/supabase-js` 2.118, `@supabase/ssr` 0.12 | Zapytania w kontekście użytkownika, więc RLS zawsze działa. |
| Walidacja | Zod 4 | Te same schematy po stronie klienta i serwera. |
| Daty | date-fns, date-fns-tz | Strefa organizacji (`Europe/Warsaw` domyślnie). |
| Kody QR | `qrcode` | Zaproszenia. |
| Powiadomienia | `web-push` (VAPID); e-mail przez adapter (Resend po ustawieniu `RESEND_API_KEY`, lokalnie HTTP API Mailpit) | SMS usunięty. |
| PWA | `app/manifest.ts`, `public/sw.js`, `public/offline.html`, ikony generowane `scripts/generate-icons.mjs` | |
| Testy | Vitest 5, pgTAP (`supabase test db`) | |
| Jakość | ESLint, dependency-cruiser (granice modułów) | |
| Środowisko lokalne | Node 24, npm 11, Git, Docker Desktop + WSL2, Supabase CLI (z npm) | |

Nie ma jeszcze: Stripe, Fakturowni, konta Resend (adapter jest, brak klucza), Sentry, PostHog, next-intl, React Hook Form, CI, hostingu, shadcn/ui, wygenerowanych typów bazy.

## 3. Architektura

### 3.1. Modularny monolit

Jedna aplikacja Next.js, jedna baza PostgreSQL. Decyzja: [ADR 0001](adr/0001-modular-monolith.md).

```
src/
  app/                      Trasy; tylko routing i wywołania przypadków użycia
    page.tsx, manifest.ts, start/        Strona główna, manifest PWA, wejście z ikony (/start)
    (auth)/                 login, signup, forgot/reset-password, invite/[secret], join/[token]
    (trainer)/app/...       Panel trenera (patrz niżej)
    (client)/portal/...     Panel klienta
    (admin)/admin/...       Panel właściciela platformy: szkoły i użycie, status i blokada, kody beta, tryb rejestracji, `mfa`
    suspended/              Ekran zawieszonego konta (trener i klient)
    api/cron/outbox/        Zadanie w tle: powiadomienia (sekret CRON_SECRET)
    auth/callback/          Wymiana kodu PKCE na sesję
  modules/<moduł>/
    domain/                 Czysta logika i schematy Zod; bez frameworka i bazy
    application/            Przypadki użycia: (ctx, input) => Result
    infrastructure/         Repozytoria (supabase-js), adaptery (e-mail, push)
    ui/                     Komponenty specyficzne dla modułu
    index.ts                Publiczne API modułu
  shared/                   Result, błędy, Money, Clock, czas, kontekst, env, klienci Supabase,
                            formularze, UI (formularze, potwierdzenie, PWA), narzędzia testowe
  proxy.ts                  Odświeżanie sesji i ochrona tras /app oraz /portal
  instrumentation*.ts       Lokalna pętla powiadomień w `next dev` (co 10 s)
supabase/
  migrations/               Migracje SQL z RLS (0001-0011), źródło prawdy o schemacie
  tests/database/           Testy pgTAP
public/                     sw.js, offline.html, icons/
scripts/                    seed-dev.mjs, run-outbox.mjs, generate-icons.mjs, grant-platform-admin.mjs
docs/                       Ten plik, WDROZENIE-PRODUKCYJNE.md, WDROZENIE-DEMO-10-TESTEROW.md, WDROZENIE-PELNE-PRODUKCJA.md, adr/0001-0012
```

**Moduły:** `core` (organizacje, członkostwa, role, uprawnienia, logowanie, ustawienia), `clients`, `dogs` (psy, notatki, zatwierdzanie), `packages` (szablony, sprzedaż, saldo, korekta, anulowanie), `payments` (należności, wpłaty, alokacje, storno), `scheduling` (rodzaje zajęć, planowanie, zakończenie, odwołanie, cofanie, wolne terminy), `invitations` (zaproszenia klientów i personelu, wysyłka e-mailem), `portal` (model do odczytu dla klienta, lista chętnych, „Biorę”), `notifications` (outbox, planowanie powiadomień, kanały, skrzynka, preferencje, prośby klienta), `platform` (panel właściciela: przegląd szkół, status i dostęp, notatki, kody beta, tryb rejestracji; działa na kliencie `service_role`).

**Trasy panelu trenera (`/app`):** pulpit „Dziś”, `clients` (lista, karta, psy, pakiety), `packages` (szablony), `sessions` (lista, planowanie, rodzaje zajęć, wolne terminy i odwołane terminy), `requests` (prośby klientów), `notifications` (+ `settings`), `team` (zespół i zaproszenia), `more` (menu na telefonie). **Trasy klienta (`/portal`):** start, `sessions`, `payments`, `dogs`, `notifications` (+ `settings`), `more`.

### 3.2. Reguły wymuszane (`npm run check:boundaries`)
Plik `.dependency-cruiser.cjs`: moduł importuje inny moduł tylko przez jego `index.ts`; trasy w `src/app` importują moduły tylko przez `index.ts`; `domain` nie zależy od Next.js, Reacta, Supabase ani od warstw wyżej; `src/shared` nie zależy od modułów; klient `service_role` (`src/shared/supabase/admin.ts`) jest niedostępny z tras UI `(trainer|client|auth|marketing)`; używają go procesor outbox, trasa cron i strażnik panelu `(admin)` (`requireAdmin`, po sprawdzeniu `platform_admins` i MFA).

### 3.3. Przepływ żądania
1. `proxy.ts` odświeża sesję Supabase i weryfikuje JWT (`getClaims`). Niezalogowanego z `/app` i `/portal` przekierowuje na `/login`. Pliki PWA (`sw.js`, `offline.html`, manifest, ikony) omijają proxy.
2. Strona lub Server Action woła `requireContext()` (trener: `userId`, `organizationId`, `role`, `db` w kontekście użytkownika, `clock`, `access` = stan dostępu szkoły; organizację wybiera ciasteczko `dt_org`, a gdy go brak, pierwsze niezawieszone członkostwo; gdy wszystkie szkoły są zawieszone, przekierowanie na `/suspended`) albo `requirePortalContext()` (klient: `clientId`, ciasteczko `dt_client`).
3. Przypadek użycia sprawdza uprawnienie (`authorize`), waliduje wejście schematem Zod i woła repozytorium.
4. Repozytorium wykonuje zapytanie przez `ctx.db`, więc RLS obowiązuje, albo wywołuje funkcję SQL (`rpc`). Błędy bazy mapuje `fromDbError` na `AppError` (kody `DT001`-`DT016` mają polskie komunikaty (`DT015` = szkoła tylko do odczytu, `DT016` = rejestracja zamknięta)).
5. Wynik wraca jako `Result<T, AppError>`; akcje formularzy zamieniają błędy na `FormState`.

### 3.4. Autoryzacja w dwóch warstwach
- **Aplikacja:** mapa rola → uprawnienia (`modules/core/domain/permissions.ts`; role `owner`, `admin`, `trainer`, `assistant`). Tylko `owner` ma `billing.manage`; `assistant` nie ma płatności ani notatek o psach.
- **Baza:** RLS na każdej tabeli organizacji, funkcje pomocnicze w schemacie `app` (`security definer`, pusty `search_path`): `is_org_member`, `has_org_role`, `shares_org_with`, `client_ids_for_user`, `client_can_see_dog`, `is_client_of_org` i inne. Zapisy wielotabelowe i operacje wrażliwe tylko funkcjami `public.*` (sprawdzają rolę i organizację). **Status szkoły** (ADR 0012): zawieszona/zarchiwizowana nie ma żadnego dostępu (funkcje RLS zwracają fałsz), a zapisy w `read_only` i zawieszonej odrzuca wyzwalacz `app.enforce_org_writable` (`DT015`); `service_role` (zadania w tle, panel właściciela) go omija.

### 3.5. Izolacja tenantów
`organization_id` w każdej tabeli danych organizacji; złożone klucze obce `(organization_id, id)` blokują powiązanie rekordów z różnych organizacji. Klient (kartoteka) jest oddzielony od konta logowania: dostęp do panelu przez `client_access` (osoba u wielu trenerów, kilka osób w rodzinie). [ADR 0004](adr/0004-clients-dogs-access.md).

### 3.6. Konwencje
- Kwoty: `amount_minor` (grosze) plus waluta (`Money`). Czas: `timestamptz` w UTC, strefa w `organization_settings`.
- Statusy: `text` z `CHECK`; statusy wyliczalne (np. należność) są liczone. Brak twardego usuwania: `archived_at` (twarde usuwanie tylko RODO jako `service_role`).
- Rejestry „tylko do dopisywania” (`package_ledger`, `audit_log`); poprawki to zapisy kompensujące, nie edycje.
- Operacje atomowe jako funkcje PostgreSQL wołane przez `rpc()`.
- Next 16 z Cache Components: strony cienkie i synchroniczne, praca zależna od żądania w komponentach pod `<Suspense>`.
- Język interfejsu, komentarzy i dokumentacji: polski; kod i nazwy techniczne: angielski.

### 3.7. Zdarzenia i powiadomienia ([ADR 0008](adr/0008-notifications.md))
- Funkcje SQL zapisują `outbox_events` w tej samej transakcji co zmiana. Zdarzenia wywołane akcją trenera dostają `not_before = now() + 30 s` (okno „Cofnij”, ADR 0011).
- `runOutbox()` (moduł `notifications`): reguły dzienne dopisują zdarzenia (zbliżający się termin płatności, zaległość, przypomnienie o zajęciach), partia jest pobierana funkcją `claim_outbox_events` (`FOR UPDATE SKIP LOCKED`, blokada 5 min, do 5 prób), zdarzenie jest zamieniane przez `planNotifications` na powiadomienia (klient/personel), zapisywane idempotentnie (`unique (recipient_user_id, dedupe_key)`) i wysyłane kanałami wg preferencji (push, e-mail); dostarczenia per kanał w `notification_log`. Ogłoszenie wolnego terminu jest rozwijane na klientów z listy chętnych.
- Uruchamianie: produkcyjnie trasa `/api/cron/outbox` (nagłówek `Authorization: Bearer $CRON_SECRET`, 500 przy zalegających zdarzeniach); lokalnie pętla w `next dev` (`OUTBOX_DEV_POLL=off` wyłącza) albo `npm run outbox:run`.
- Odbiorcy: klient (wszystkie aktywne konta z `client_access`), personel (przypisany trener, a gdy go brak, właściciele i administratorzy).

### 3.8. Potwierdzenia i cofanie ([ADR 0011](adr/0011-confirmations-and-undo.md))
`ConfirmSubmit` (`src/shared/ui/confirm.tsx`) otwiera okno z opisem skutków (domyślnie „Anuluj”) i dopiero po potwierdzeniu wysyła formularz. Odwrotności jako zapisy kompensujące w funkcjach SQL: `undo_complete_session` (do końca dnia), `undo_cancel_session`, `void_payment`, `cancel_package`; cofnięcie w oknie 30 s wycofuje niewysłane powiadomienia (`app.drop_pending_events`), po oknie klient dostaje informację korygującą.

### 3.9. PWA i telefon ([ADR 0009](adr/0009-pwa.md))
Manifest (`start_url=/start`, który kieruje do `/login`, `/app` lub `/portal`), ikony, service worker (push, strona offline, cache tylko zasobów statycznych; stron aplikacji i API **nie** buforuje), baner instalacji (Android przycisk, iOS instrukcja), dolna nawigacja trenera i klienta, ekran „Dziś” trenera, `viewport-fit=cover`. Web push na iPhonie działa tylko po dodaniu aplikacji do ekranu głównego (iOS 16.4+).

## 4. Model danych

Migracje `supabase/migrations/20261016000001` … `0011` (wszystkie zastosowane lokalnie).

| Tabela | Moduł | Cel |
| --- | --- | --- |
| `profiles` | core | Profil 1:1 z `auth.users` (trigger przy rejestracji) |
| `organizations`, `organization_settings` | core | Tenant i ustawienia (strefa, waluta, polityka późnych odwołań, godziny przypomnień); `status` (`trial`/`active`/`read_only`/`suspended`/`archived`), `access_until`, `status_reason` ustawia tylko właściciel platformy |
| `platform_admins`, `platform_settings`, `beta_codes`, `organization_admin_info` | platform | Właściciele platformy (zapis tylko `service_role`), ustawienia platformy (`signup_mode`), kody beta (tylko skróty HMAC), notatki właściciela o szkole; wszystkie bez polityk poza odczytem własnego wpisu `platform_admins` |
| `organization_members` | core | Personel i role (admin nie nadaje ani nie zmienia roli `owner`) |
| `invitations` | core | Zaproszenia klientów (link, QR, krótki kod, HMAC) i personelu (`/join/<token>`); `revoked_at`, `accepted_by` |
| `invitation_lookup_failures` | core | Globalne ograniczenie zgadywania kodów (bez polityk RLS) |
| `outbox_events` | core | Zdarzenia domenowe; `not_before`, `locked_until`, `attempts`; bez polityk RLS (tylko `service_role`) |
| `audit_log` | core | Dziennik tylko do dopisywania (odczyt owner/admin) |
| `files` | core | Metadane plików Storage (tabela jest, uploadu nie ma) |
| `clients`, `client_access` | clients | Kartoteka klienta i konta z dostępem do panelu |
| `dogs`, `dog_notes` | dogs | Psy (`approval_status`: klient dodaje „oczekujący”, trener zatwierdza) i notatki (prywatne lub widoczne dla klienta) |
| `package_templates`, `client_packages`, `package_ledger` | packages | Szablony, sprzedane pakiety, dziennik salda (tylko dopisywanie) |
| `charges`, `payments`, `payment_allocations` | payments | Należności, wpłaty (`voided_at` dla storna), alokacje |
| `session_types`, `training_sessions`, `session_attendees` | scheduling | Rodzaje zajęć, zajęcia (wykluczenie nakładania się terminów trenera), uczestnik |
| `slot_offers`, `slot_claims`, `waitlist_entries` | scheduling | Ogłoszone wolne terminy (kopia danych terminu), zgłoszenia „Biorę”, lista chętnych klienta |
| `notifications`, `notification_preferences`, `notification_log`, `push_subscriptions` | notifications | Skrzynka (zapis tylko `service_role`, użytkownik zmienia `read_at`), kanały (push, e-mail), dostarczenia per kanał, subskrypcje web push |
| `client_requests` | notifications | Prośby klienta (`renew`, `pay`, `end`, `cancel` + `session_id`), zapis funkcją `create_client_request` |

**Widoki:** `v_client_package_balance`, `v_charge_balance`, `v_client_balance`, `v_session_details` (`security_invoker`).
**Funkcje `public.*` (wybór):** `create_organization`, `sell_package`, `record_payment`, `adjust_package`, `void_charge`, `void_payment`, `cancel_package`, `schedule_session`, `complete_session`, `cancel_session`, `undo_complete_session`, `undo_cancel_session`, `create_client_invitation`, `lookup_invitation`, `accept_invitation`, `revoke_client_access`, `create/lookup/accept/revoke_member_invitation`, `create_client_request`, `create_slot_offer`, `close_slot_offer`, `claim_slot`, `withdraw_slot_claim`, `accept_slot_claim`, `claim_outbox_events`, `enqueue_daily_notification_events`.

**Funkcje panelu właściciela (tylko `service_role`):** `admin_organizations_overview`, `admin_set_organization_status`, `admin_set_organization_notes`, `admin_set_signup_mode`, `admin_create_beta_code`, `admin_revoke_beta_code`, `expire_organization_access`; publiczna `check_signup_allowed`. Wyzwalacz `a_enforce_signup_gate` na `auth.users` wymusza zamkniętą rejestrację.

**Jeszcze bez migracji (z planu v2.0):** `locations`, `session_series`, `session_private_notes`; zadania domowe (`exercise_library`, `homework_*`); rozliczenia SaaS (`plans`, `plan_entitlements`, `subscriptions`, `entitlement_overrides`, `billing_events`); RODO (`admin_access_grants`, `legal_documents`, `consents`, `data_requests`, `import_jobs`); kursy (`courses`, `course_*`).

**Odstępstwa od planu v2.0 (świadome):** (1) saldo pakietu to suma `delta` z `package_ledger` (wpis `purchase` dodaje zakupioną liczbę zajęć), [ADR 0003](adr/0003-package-ledger-and-payments.md); (2) każdy członek organizacji widzi wszystkich klientów (widoczność per trener wraca z planem Szkoła), ADR 0004; (3) `supabase-js` bez ORM i **bez generowanych typów bazy** (repozytoria mają ręczne typy wierszy).

## 5. Co zostało zrobione

1. **Fundament** (ADR 0001-0003): scaffold, logowanie, proxy sesji, `Result`/błędy/`Money`/`Clock`, moduł `core` (uprawnienia, `authorize`), migracja 0001, granice modułów.
2. **Klienci i psy** (ADR 0004): migracja 0002, kreator pierwszej organizacji, lista z wyszukiwaniem i archiwum, karty klienta i psa, notatki.
3. **Rejestracja i reset hasła:** `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback`, bezpieczny parametr `next` (`safeNextPath`), adres z `NEXT_PUBLIC_SITE_URL` (nie z nagłówka Host).
4. **Pakiety i płatności** (ADR 0005, migracja 0003): szablony, sprzedaż, saldo, wpłaty z alokacją, nadpłaty, korekta, zaległości, kafelki na pulpicie.
5. **Zajęcia** (ADR 0006, migracja 0004): rodzaje zajęć, planowanie z kolizjami, zakończenie zużywające pakiet (albo należność), odwoływanie z polityką późnych odwołań, listy „Dziś” i „Najbliższe”.
6. **Zaproszenia i panel klienta** (ADR 0007, migracja 0005): zaproszenie z QR/linkiem/kodem (HMAC z `INVITATION_HASH_SECRET`), `/invite`, `/portal` (saldo, płatności, zajęcia, psy), zatwierdzanie psów.
7. **Powiadomienia i zespół** (ADR 0008, migracje 0006-0007, usunięcie SMS w 0008): procesor outbox, dzwonek i skrzynka, ustawienia kanałów i push, prośby klienta z widokiem u trenera, wysyłka zaproszenia e-mailem, `/app/team` i `/join/<token>`.
8. **PWA i telefon** (ADR 0009): manifest, ikony, service worker, instalacja, dolna nawigacja, „Dziś”, `/app/more`; **menu „Więcej” w portalu** z włączaniem push i kanałów, karta „Włącz powiadomienia push”; **jasny motyw**.
9. **Wolne terminy** (ADR 0010, migracja 0009): lista chętnych, ogłoszenie odwołanego terminu, „Biorę” w kolejności zgłoszeń, wybór osoby przez trenera z komunikatami, „Nie mogę przyjść”.
10. **Potwierdzenia i cofanie** (ADR 0011, migracja 0010): `ConfirmSubmit`, okno 30 s, cofnięcie zakończenia, przywrócenie zajęć, storno wpłaty, anulowanie pakietu.
11. **Dokumentacja i narzędzia:** `WDROZENIE-PRODUKCYJNE.md`, `WDROZENIE-DEMO-10-TESTEROW.md`, `WDROZENIE-PELNE-PRODUKCJA.md`, tryb tunelu HTTPS do testu na telefonie (`DEV_TUNNEL=1`), skrypty `seed-dev`, `outbox:run`, `generate-icons`, `admin:grant`.
12. **Panel właściciela i kontrola dostępu** (ADR 0012, migracja 0011, moduł `platform`): `/admin` (kafelki użycia, lista szkół z filtrem, karta szkoły: status, przedłużenie, notatki, historia), status szkoły egzekwowany w bazie i UI (`/suspended`, pasek „tylko do odczytu”), automat końca dostępu w cronie, e-mail do właścicieli przy zmianie statusu, zamknięta rejestracja kodami beta (wyzwalacz na `auth.users`, kody w `/admin/codes`, pole „Kod zaproszenia” w `/signup`, dowód zaproszenia dla klientów i zespołu), MFA TOTP dla admina (`/admin/mfa`), skrypt `npm run admin:grant`.
13. **Poprawka:** wybór zgłoszenia na wolny termin, gdy termin już minął, rzucał wyjątek (500 w konsoli). Teraz akcje „Wybierz” i „Zamknij ogłoszenie” zwracają komunikat przy przycisku (`slot-offer-forms.tsx`), a lista trenera pomija ogłoszenia z minionym terminem; test regresji w `slots.integration.test.ts`.

### Funkcje widoczne dla użytkownika
**Trener:** klienci i psy, pakiety i płatności (w tym storno i anulowanie), zajęcia (planowanie, zakończenie, odwołanie, cofanie), wolne terminy z kolejką zgłoszeń, prośby klientów, powiadomienia (dzwonek, push, e-mail), zespół i zaproszenia, zaproszenia klientów (QR, link, kod, e-mail), pulpit „Dziś” i dolna nawigacja na telefonie, potwierdzenia wrażliwych operacji.
**Właściciel platformy (`/admin`):** przegląd użycia (szkoły, personel aktywny w 7 dni, klienci i klienci w panelu, zajęcia, ostatnie logowania, push), zawieszanie i tryb „tylko do odczytu” z powodem i terminem dostępu, przedłużenie, notatki, historia zmian, kody beta, przełącznik rejestracji, weryfikacja dwuetapowa.
**Klient (`/portal`):** saldo „N z M zajęć”, płatności z terminami, zajęcia i „Nie mogę przyjść”, psy (dodanie do zatwierdzenia), odpowiedzi „Odnów / Zapłacę / Kończę”, lista chętnych i „Biorę”, powiadomienia i ustawienia push, instalacja na ekranie głównym.

## 6. Weryfikacja

| Sprawdzenie | Polecenie | Wynik (2026-10-21) |
| --- | --- | --- |
| Typy | `npm run typecheck` | czysto |
| Lint | `npm run lint` | czysto |
| Testy jednostkowe (domena, symulacja service workera) | `npm test` | 170/170 |
| Granice modułów | `npm run check:boundaries` | brak naruszeń (230 modułów) |
| Build produkcyjny | `npm run build` | przechodzi (trasy panelu to częściowy prerender) |
| Testy RLS i funkcji SQL (pgTAP) | `npm run db:test` | 222/222 (10 plików; `platform_admin.test.sql`: status, blokada zapisów i odczytów, ochrona kolumn, funkcje tylko `service_role`, wygaszanie, zamknięta rejestracja) |
| Testy przypadków użycia na prawdziwej bazie (z Mailpit) | `npm run test:integration` | 133/133 (10 plików; `admin.integration.test.ts`: panel, blokada, kody beta, rejestracja przy zamkniętym naborze także bezpośrednio przez API) |

### Przeklikane w przeglądarce (lokalny Supabase)
Panel `/admin` (lista szkół, karta, zmiana statusu z potwierdzeniem, strona kodów), trener szkoły „tylko do odczytu” (pasek i czytelny błąd przy zapisie), ekran `/suspended`, konfiguracja MFA kodem TOTP i wejście do panelu po weryfikacji (przy włączonym MFA w lokalnym Supabase). Fundament i klienci; zaproszenie klienta i rejestracja z QR/kodu do `/portal`; powiadomienia (niskie saldo u obu stron, e-maile w Mailpit); prośba „Odnów pakiet” do trenera; zespół i `/join`; panel w 375 px (dolna nawigacja, „Dziś”, „Więcej”); odwołanie zajęć z potwierdzeniem, „Ogłoś wolny termin”, lista chętnych i „Biorę” po stronie klienta, przywrócenie zajęć; menu „Więcej” klienta; jasny motyw przy emulowanym ciemnym trybie systemu.

### Czego NIE zweryfikowano
- **PWA i push na prawdziwych telefonach** (instalacja, zgoda, dostarczenie, kliknięcie, strona offline); service worker sprawdzony tylko symulacją (wbudowana przeglądarka nie obsługuje SW, lokalny Chrome z rozszerzeniem nie miał dostępu do adresu lokalnego). Klucze VAPID są tylko lokalne.
- Potwierdzenia wpłat, pakietów, archiwizacji i odbierania dostępu oraz „Cofnij zakończenie”, storno i „Anuluj pakiet” w przeglądarce (są testy pgTAP i integracyjne); wybór zgłoszenia przez trenera w przeglądarce.
- Rejestracja i zaproszenia przy włączonym potwierdzeniu e-mail; odświeżanie wygasłej sesji w `proxy.ts`.
- Przy zamkniętej rejestracji: formularz `/signup` z polem kodu, rejestracja klienta i zespołu z zaproszenia (logika i baza są pokryte testami, brak przeklikania w przeglądarce); ponowne logowanie do `/admin` na nowej sesji kodem TOTP; panel `/admin` na telefonie; e-mail do właściciela szkoły po zmianie statusu (plan i dane testowane tylko pośrednio).
- Wydajność RLS na dużych zbiorach; `npm audit` zgłosił 5 podatności o wysokiej wadze w zależnościach scaffoldu (nie przeglądane).

## 7. Jak uruchomić

```bash
npm install
npm run db:start            # lokalny Supabase (Docker)
cp .env.example .env.local  # klucze z `npx supabase status -o env`; wzór i opis zmiennych w .env.example
npm run dev                 # http://localhost:3000
```

Lokalny Supabase bez zbędnych usług: `npx.cmd supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime,storage-api,postgres-meta` (Mailpit: `http://127.0.0.1:54324`). Nowe migracje: `npx.cmd supabase migration up` (`supabase db reset` kasuje dane lokalne). Dane deweloperskie: `npm run seed:dev` (tylko lokalnie; konto trenera, klienci, psy, pakiet, zajęcia). Testy: `npm test`, `npm run db:test`, `npm run test:integration`, `npm run check:boundaries`, `npm run typecheck`, `npm run lint`.

**Zmienne środowiskowe** (szczegóły w `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL` (link w e-mailach i QR; na produkcji wymagany), `INVITATION_HASH_SECRET` (na produkcji wymagany; zmiana unieważnia zaproszenia), `CRON_SECRET`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` (`npx web-push generate-vapid-keys`), `RESEND_API_KEY`, `EMAIL_FROM`, `MAILPIT_URL`, `OUTBOX_DEV_POLL=off`, `DEV_TUNNEL=1`, `ADMIN_REQUIRE_MFA` (domyślnie wymagane tylko na produkcji), `NEXT_PUBLIC_SUPPORT_EMAIL`.

**Powiadomienia lokalnie:** `npm run dev` przetwarza outbox co 10 s (zdarzenia trenera po 30 s okna „Cofnij”); e-maile trafiają do Mailpit (HTTP API). W wersji produkcyjnej (`npm run build` + `npm run start`) pętli nie ma: uruchom `npm run outbox:run` w pętli (np. co 10 s) albo wywołuj trasę cron.

### Test na telefonie bez domeny (push, instalacja PWA)
Push i instalacja wymagają HTTPS; lokalny adres `http://192.168.x.x:3000` nim nie jest. Darmowy tunel Cloudflare:
1. `winget install Cloudflare.cloudflared`, potem `cloudflared tunnel --url http://localhost:3000`; skopiuj adres `https://....trycloudflare.com` (prawdziwy, bez nawiasów).
2. W PowerShellu: `$env:NEXT_PUBLIC_SITE_URL='https://<adres>'; $env:DEV_TUNNEL='1'; $env:INVITATION_HASH_SECRET='<dowolny sekret min. 24 znaki>'; npm.cmd run build`, potem `npm.cmd run start` (wersja produkcyjna jest lżejsza niż `next dev`, a service worker działa tylko w niej), a w drugim oknie pętla `npm.cmd run outbox:run` co kilka sekund.
3. W `.env.local` ustaw `VAPID_SUBJECT=mailto:<prawdziwy e-mail>` (Apple może odrzucać adresy `.local`).
4. Telefon: otwórz adres tunelu; iPhone: Safari → Udostępnij → Do ekranu początkowego i otwórz z ikony; Android: Zainstaluj. W portalu klienta `Więcej` → „Włącz push na tym urządzeniu”.
5. Wywołaj zdarzenie z laptopa; push dociera po ok. 30-40 s (okno „Cofnij” + cykl pętli). Diagnostyka: `docker exec supabase_db_dogtrainer psql -U postgres -c "select channel, status, detail from notification_log order by created_at desc limit 5;"`.
Adres tunelu zmienia się przy każdym uruchomieniu (subskrypcję i ikonę trzeba założyć od nowa). Po zmianach w kodzie trzeba przebudować serwer (`build` + `start`).

### Panel właściciela lokalnie
`npm run admin:grant -- trener@example.test` nadaje konto właściciela platformy (lokalnie konto testowego trenera ma to już nadane), potem `/admin` (także z `Więcej` → „Panel właściciela platformy”). Na produkcji użyj osobnego konta właściciela i włącz MFA. Odebranie: `npm run admin:grant -- adres --revoke`. **Uwaga:** `next start` (wersja produkcyjna) ma `NODE_ENV=production`, więc wymusza MFA także lokalnie, dopóki w `.env.local` nie ma `ADMIN_REQUIRE_MFA=0`. **Dane demo:** `npm run seed:demo` (tylko lokalnie, powtórzenie odtwarza od nowa) tworzy 10 szkół `demo-*` (próbne, aktywne, tylko do odczytu, zawieszona, nieaktywne, nigdy niezalogowana) z personelem, klientami, zajęciami i push; konta `wlasciciel.<szkoła>@`, `trener1.<szkoła>@`, `klient1.<szkoła>@demo.example.test` (np. `wlasciciel.burek`, `wlasciciel.premium`), hasło `Demo-Haslo-2026`. MFA lokalnie: w `supabase/config.toml` jest `[auth.mfa.totp]` (po zmianie konfiguracji trzeba zrestartować lokalny Supabase) i `ADMIN_REQUIRE_MFA=1` w `.env.local`.

### Konta testowe (tylko lokalnie, znikają po `supabase db reset`)
| Rola | E-mail | Hasło | Po zalogowaniu |
| --- | --- | --- | --- |
| Trener (organizacja „Szkoła Łapa”) | `trener@example.test` | `Dev-Haslo-12345` | `/app` |
| Klient Anna Kowalska (psy Burek i Rex) | `anna@example.pl` | `Klient-Haslo-2026` | `/portal` |
| Drugi trener z osobnymi danymi | `seedcheck@example.test` | `Seed-Check-Pass-1` | `/app` |

### Jak klient trafia do panelu
Trener tworzy kartotekę klienta, potem na jej karcie w sekcji „Panel klienta” klika „Zaproś klienta do panelu” (opcjonalnie wskazuje pakiet i e-mail). Powstają **QR, krótki kod i link** (widoczne tylko raz, ważne 7 dni, nowe zaproszenie unieważnia poprzednie), a przycisk „Wyślij e-mailem” wysyła je klientowi. Klient skanuje QR, zakłada konto (z e-mailem w zaproszeniu tylko to konto je przyjmie) i od razu trafia do `/portal`; dostęp do kartoteki dostaje tylko ten klient i tylko w tej szkole. Trener może go odebrać („Odbierz dostęp”). Nie ma jeszcze: QR szkoły z prośbą o dołączenie i akceptacją, magic linku. Personel: `Zespół` → „Zaproś do zespołu” (e-mail i rola, link `/join/<token>`).

## 8. Do zrobienia

Szczegółowa ścieżka do sprzedaży, limitacje i ryzyka: [WDROZENIE-PRODUKCYJNE.md](WDROZENIE-PRODUKCYJNE.md). Instrukcje krok po kroku: [WDROZENIE-DEMO-10-TESTEROW.md](WDROZENIE-DEMO-10-TESTEROW.md) (demo) i [WDROZENIE-PELNE-PRODUKCJA.md](WDROZENIE-PELNE-PRODUKCJA.md) (sprzedaż).

**Zrobione dla demo:** panel właściciela `/admin` z wglądem i blokowaniem dostępu, status szkoły egzekwowany w bazie, zamknięta rejestracja kodami beta, MFA admina (ADR 0012). **Blokujące, jeszcze niezbudowane (sekcja 1 instrukcji demo):** zgody i regulamin testów (1.3), formularz opinii (1.4), import CSV (1.5), CI i jakość minimum (1.6), e-mail „dostęp kończy się za 7 dni”.

### A. Żeby oddać aplikację testerom na 2 tygodnie (bez płatności)
- [ ] **Staging z HTTPS** (Vercel + osobny projekt Supabase w UE, własna domena, migracje z CI): bez niego nie da się porządnie przetestować PWA i push na telefonach.
- [ ] **Test PWA i push na prawdziwych telefonach** (Android Chrome, iPhone Safari z instalacją).
- [ ] Konto **Resend** i domena nadawcy (SPF/DKIM), własny SMTP w Supabase Auth, produkcyjne klucze VAPID, `CRON_SECRET`, `INVITATION_HASH_SECRET`, `NEXT_PUBLIC_SITE_URL`, lista przekierowań w Supabase Auth, włączone potwierdzenie e-mail (przeklikać).
- [ ] **Harmonogram** dla `/api/cron/outbox` (co minutę) i alert przy odpowiedzi 500.
- [ ] **Seed demo** (`npm run seed:demo`) i **„sterowanie demo”** (przewijanie czasu, powiadomienie testowe, uruchomienie outboxu).
- [ ] **Import klientów z CSV/Excela** (`import_jobs`).
- [ ] **Minimum prawne na testy:** krótki regulamin testów, polityka prywatności, zgoda na dane (RODO).
- [ ] **Kopie zapasowe i monitoring minimum:** dzienne kopie Supabase (z testem przywracania), Sentry (darmowy), monitor dostępności.
- [ ] **Zbieranie opinii** i kryterium „komuś się spodobało” ustalone z góry (np. dodał klientów, sprzedał pakiet, klient użył panelu).
- [ ] Domknięcie: `error.tsx`/`not-found.tsx`, obsługa wygasłej sesji (komunikat zamiast „Brak uprawnień”), linki powrotu na podstronach w trybie `standalone`, przegląd `npm audit`, CI (typecheck, lint, testy, `supabase test db`, build), generowane typy bazy.

### A2. Dopracowania panelu właściciela
- [ ] Przeklikać w przeglądarce rejestrację z kodem przy zamkniętym naborze (formularz, błędy) oraz rejestrację klienta i zespołu z zaproszenia; ponowne logowanie do `/admin` kodem TOTP; panel na telefonie.
- [ ] E-mail do trenera 7 i 1 dzień przed końcem dostępu; wpisy wejść do panelu w audycie; stronicowanie przeglądu przy kilkuset szkołach; role wewnętrzne (wsparcie tylko do odczytu); skrypt `seed:demo` z przykładowymi szkołami.
- [ ] Przed wdrożeniem: nadać konto właściciela (`admin:grant` z prawdziwym adresem), zamknąć rejestrację w `/admin/codes`, ustawić `NEXT_PUBLIC_SUPPORT_EMAIL`, sprawdzić MFA na hostowanym Supabase.

### B. Pomysły zgłoszone przez właściciela, jeszcze nie zrobione
- **QR szkoły z akceptacją:** stały QR/link trenera; klient zakłada konto i wysyła prośbę o dołączenie, trener akceptuje (powstaje kartoteka i dostęp). Zaproponowane, czeka na decyzję.
- Widok **historii zmian** (audyt jest zapisywany, brak ekranu) z „Cofnij” przy odwracalnych wpisach; kafelek „chętni na wolny termin” na pulpicie; preferencje dni i godzin na liście chętnych.
- Potwierdzenia w panelu klienta; cofnięcie „Wybierz zgłoszenie” (dziś: odwołać utworzone zajęcia i ogłosić ponownie).

### C. Produkt po okresie testowym (jeśli się spodoba)
- **Plany, limity i Stripe Billing** (rozliczenia ręczne wystarczą dla pierwszych płacących); freemium (2 klientów) wymaga `plans`, `plan_entitlements`, `subscriptions`, limitu w bazie, trybu tylko do odczytu, ochrony przed wieloma darmowymi organizacjami.
- **Kalendarz poza minimum:** widoki dzień/tydzień, edycja i przeniesienie terminu, `locations`, serie cykliczne, zajęcia grupowe z limitem miejsc, nieobecność (`no_show`), prywatne notatki z zajęć, kanał ICS, filtr po trenerze, Google Calendar.
- **Zadania domowe z filmami** (Storage, limity, kompresja, retencja; największe ryzyko kosztowe).
- **Płatności online od klientów**, faktury (Fakturownia), zwrot wpłaty, wiele walut.
- **Zespół:** zmiana roli i zawieszanie członków, przełącznik organizacji (`dt_org`) i trenerów klienta (`dt_client`), widoczność klientów per trener (plan Szkoła).
- **RODO:** `legal_documents`, `consents`, eksport i usuwanie danych, retencja, pełne zapisy do `audit_log`; panel administratora platformy.
- Powiadomienia: szablony React Email, cisza nocna i podsumowanie dzienne, waluta w `payment.recorded`; magic link dla klientów, limity prób per IP, CSP i nagłówki, MFA dla właścicieli.
- `next-intl`, React Hook Form, design system (shadcn/ui), dostępność (WCAG), strona marketingowa z cennikiem, analityka (PostHog).
- Natywna aplikacja (Capacitor lub Expo) wymaga warstwy `/api/v1` i tokenów push urządzeń; decyzja po walidacji.

### D. Poza kodem
Walidacja (10-15 wywiadów z trenerami, ceny 49/79/119 zł, 5-10 pilotażystów, oferta Founding Member), dokumenty prawne (regulamin, polityka prywatności, umowa powierzenia, zgoda na wizerunek), księgowość i VAT, znak towarowy i domena.

## 9. Ryzyka i uwagi
- **RLS to najważniejsza i najbardziej ryzykowna warstwa:** każda nowa tabela dostaje polityki i test izolacji w tej samej migracji; przed zewnętrznymi użytkownikami potrzebny przegląd z perspektywy atakującego.
- **Klucz `service_role` omija RLS:** tylko zadania w tle i webhooki (reguła dependency-cruiser pilnuje tras UI).
- **Bez harmonogramu outboxu nie ma powiadomień** (kluczowa obietnica produktu); trzeba go wdrożyć i monitorować.
- **Powiadomienia trenera idą z opóźnieniem 30 s** (okno „Cofnij”): świadomy koszt.
- Push na iPhonie wymaga zainstalowanej PWA; klient bez instalacji dostanie tylko e-mail i dzwonek w aplikacji.
- Koszty wideo (przy zadaniach domowych) i jedna osoba w projekcie to główne ryzyka biznesowe (ADR-y, testy i automatyzacja je ograniczają).
- Ceny i rynek są hipotezami; walidacja przed budowaniem kolejnych modułów.
- Lokalny stos Supabase działa w Dockerze na tym komputerze (`npx supabase stop` zatrzymuje).
- **Wyzwalacz rejestracji jest globalny:** gdy `signup_mode` = `closed`, nikt (także testy tworzące konta zwykłą rejestracją) nie założy konta bez kodu; testy integracyjne używają Auth Admin API i przy `closed` przywracają tryb w `finally`.
- **Zawieszenie odcina także klientów szkoły:** łagodniejszą blokadą jest `read_only`.

## 11. Plan bieżącego etapu

Etap 9 (panel właściciela) jest gotowy do scalenia; commit i scalenie do `dev` robi ten sam przebieg. Następny etap: **10. Oddanie testerom** wg [WDROZENIE-DEMO-10-TESTEROW.md](WDROZENIE-DEMO-10-TESTEROW.md): (1) regulamin testów, polityka prywatności i zgody przy rejestracji (treść od prawnika), (2) formularz opinii w obu panelach, (3) import klientów z CSV, (4) CI i jakość minimum (`error.tsx`, `not-found.tsx`, limity, przegląd `npm audit`, RLS z perspektywy atakującego), (5) konta i konfiguracja (Supabase Pro w UE, Resend, Vercel z `vercel.json` i cronem, domena), (6) test dymny na prawdziwych telefonach, (7) rekrutacja 10 testerów i kody beta. Potem decyzje o płatnościach wg `WDROZENIE-PELNE-PRODUKCJA.md`.
