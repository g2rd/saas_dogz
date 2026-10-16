# DogTrainer SaaS: architektura, stan prac i lista zadań

Stan na 2026-10-16. Dokument opisuje, jak zbudowana jest aplikacja, co jest już zrobione i sprawdzone, co jest tylko zaprojektowane i co trzeba jeszcze zrobić. Źródłem wymagań jest plan v2.0 (JSON przekazany w rozmowie; nie ma go w repozytorium, patrz sekcja 9).

## 0. Start nowej sesji: czytaj to najpierw

**Zasada pracy (wymóg właściciela): ten plik jest źródłem prawdy o stanie projektu. Każda zmiana (etap, migracja, decyzja, znaleziony błąd, nowe zadanie) musi go aktualizować w tym samym commicie, tak żeby kolejna sesja wiedziała dokładnie, co jest zrobione i co zostało.** Przed zakończeniem każdej pracy zaktualizuj: tabelę etapów poniżej, sekcję 5 (co zrobione), sekcję 6 (wyniki testów), sekcję 8 (lista zadań), a decyzje projektowe zapisz w `docs/adr/`.

### Stan na teraz

| Etap demo (sekcja 10) | Status | Gałąź / commit |
| --- | --- | --- |
| Fundament, klienci, psy, rejestracja i reset hasła | ✅ zrobione, scalone do `main` | `main` |
| 1. Pakiety i płatności | ✅ zrobione, scalone do `main` | `main` |
| 2. Zajęcia (minimalne) i zużywanie pakietu | ✅ zrobione, scalone do `main` | `main` (3a8ef92) |
| 3. Zaproszenia (link, QR, krótki kod) i panel klienta `/portal` | ✅ zrobione, scalone do `main` | `main` |
| 4. Powiadomienia (w aplikacji, web push, e-mail; SMS usunięty 2026-10-16), odpowiedzi klienta („Odnów / Zapłać / Zakończ”), wysyłka zaproszeń, zaproszenia personelu | ✅ zrobione i przeklikane, scalone do `dev` (nie do `main`; czeka na zatwierdzenie właściciela), ADR 0008 | `dev` (`feat/notifications`) |
| 5. PWA i panel trenera na telefonie (manifest, ikony, service worker, instalacja, dolna nawigacja, „Dziś”) | ✅ zrobione, scalone do `dev`, ADR 0009; nieprzetestowane na prawdziwym telefonie | `dev` (`feat/pwa`) |
| 5b. Test na telefonach, staging z HTTPS, seed demo, „sterowanie demo”, import CSV; **2 tygodnie testów bez płatności** | ⏳ **następny krok** (plan w sekcji 11) | |

Zdalne repozytorium: `https://github.com/g2rd/saas_dogz`. **Gałąź `dev` jest gałęzią integracyjną: tam trafiają wszystkie zmiany. `main` zawiera tylko to, co właściciel zatwierdził; do `main` wchodzimy dopiero po jego wyraźnym zatwierdzeniu (merge `dev` do `main` i push).** Stan wypchnięcia i szczegóły w sekcji 5. Plan następnego etapu jest w sekcji 11.

### Jak pracujemy (definicja „zrobione” dla etapu)
1. Przepływ gałęzi: nowa gałąź na etap (`feat/...`) startuje z `dev`; po zakończeniu etapu scalamy ją do `dev` i wypychamy `dev`. **`main` zmieniamy wyłącznie po zatwierdzeniu przez właściciela** (wtedy merge `dev` do `main` i push `main`). `git push` robimy tylko na prośbę właściciela; logowanie do GitHuba idzie przez przeglądarkę, więc push uruchamiaj w terminalu użytkownika (`run_in_terminal`).
2. Migracja SQL z RLS (nowa tabela = polityki + test pgTAP w tej samej migracji); zapisy wielotabelowe jako funkcje SQL `security definer`, które same sprawdzają rolę i przynależność identyfikatorów do organizacji; wyścigi: blokada wiersza osobnym zapytaniem, dopiero potem odczyt salda/stanu.
3. Domena z testami jednostkowymi, przypadki użycia z `authorize`, repozytoria, testy integracyjne na prawdziwej bazie (w tym wyścigi i izolacja organizacji).
4. UI mobile-first, przeklikanie w przeglądarce (przy ukrytym oknie podglądu strumieniowana treść nie podmienia się sama; pomaga `$RV($RB)` w konsoli), poprawki znalezionych błędów.
5. `npm run typecheck`, `lint`, `test`, `db:test`, `test:integration`, `check:boundaries`, `build` muszą przechodzić.
6. ADR dla decyzji, aktualizacja tego pliku, commit z dopiskiem `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

### Środowisko lokalne (Windows, PowerShell)
- Narzędzia są zainstalowane w tej sesji: Node 24, Git, Docker Desktop (WSL2). W nowej powłoce dodaj do `PATH`: `C:\Program Files\nodejs`, `C:\Program Files\Git\cmd`, `C:\Program Files\Docker\Docker\resources\bin`. Używaj `npm.cmd` i `npx.cmd` (skrypty `.ps1` bywają kapryśne).
- Baza lokalna: `npx.cmd supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime,storage-api,postgres-meta` (Mailpit pod `http://127.0.0.1:54324`). Nowe migracje: `npx.cmd supabase migration up`. `supabase db reset` kasuje dane lokalne (konto `trener@example.test` trzeba wtedy utworzyć ponownie).
- Dane deweloperskie: `npm run seed:dev` (tylko lokalnie; tworzy konto trenera `trener@example.test`, organizację, klientów, psy, pakiet i zajęcia; hasło z `SEED_PASSWORD` lub losowe wypisane raz; idempotentny).
- Klucze lokalne trafiają do `.env.local` (poza gitem) z `npx.cmd supabase status -o env`; wzór w `.env.example`.
- Serwer deweloperski: `npm run dev` (port 3000); dla podglądu w aplikacji Claude jest `.claude/launch.json` (poza gitem).
- Opis commita z pliku: ścieżki w katalogu tymczasowym są za długie dla gita; zapisuj plik z opisem w krótkiej ścieżce lub w katalogu projektu i usuń po commicie (nie commituj go).

## 1. Cel produktu

Platforma multi-tenant dla trenerów psów w Polsce: klienci i psy, kalendarz treningów, pakiety zajęć rozliczane z dziennika zużyć, płatności (należności, wpłaty, alokacje), zadania domowe z filmami i panel klienta (PWA). Model biznesowy: abonament (Start 49 zł, Pro 79 zł, Szkoła 119 zł netto, to hipotezy do walidacji). Strategia: wąski, dopracowany rdzeń do szybkiej sprzedaży, bez długu technologicznego, który wymusiłby przepisywanie przy setkach klientów.

## 2. Stos technologiczny (stan faktyczny)

| Warstwa | Wybór | Uwagi |
| --- | --- | --- |
| Framework | Next.js 16.4 (App Router, Turbopack), React 19.3 | Włączone `cacheComponents` i `partialPrefetching`. W Next 16 `middleware` to `proxy` (`src/proxy.ts`). |
| Język | TypeScript strict | |
| Style | Tailwind CSS 4 | Własne proste komponenty formularzy w `src/shared/ui`. shadcn/ui jeszcze nie dodane. |
| Baza i auth | Supabase (PostgreSQL, Auth), `@supabase/supabase-js` 2.118, `@supabase/ssr` 0.12 | Zapytania w kontekście użytkownika, więc RLS zawsze działa. |
| Walidacja | Zod 4 | Te same schematy po stronie klienta i serwera. |
| Daty | date-fns, date-fns-tz | Zainstalowane, jeszcze nieużywane (kalendarz). |
| Testy | Vitest 5, pgTAP (przez `supabase test db`) | |
| Jakość | ESLint, dependency-cruiser (granice modułów) | |
| Środowisko lokalne | Node 24.20, npm 11, Git 2.55, Docker Desktop 4.95 + WSL2, Supabase CLI 2.121 (z npm) | Zainstalowane w tej sesji przez winget. |

Powiadomienia: `web-push` (VAPID), e-mail przez adapter (Resend po ustawieniu `RESEND_API_KEY`, lokalnie Mailpit). SMS: rezygnacja (decyzja właściciela 2026-10-16, migracja 0008); kanały to dzwonek, web push i e-mail (ADR 0008).

Nie ma jeszcze: Stripe, Fakturowni, konta Resend (adapter jest, brak klucza), Sentry, PostHog, next-intl, React Hook Form, CI, hostingu (patrz sekcja 8).

## 3. Architektura

### 3.1. Modularny monolit

Jedna aplikacja Next.js, jedna baza PostgreSQL. Kod dzieli się na moduły domenowe. Decyzja: [ADR 0001](adr/0001-modular-monolith.md).

```
src/
  app/                      Trasy; tylko routing i wywołania przypadków użycia
    (marketing)/            Strona główna (page.tsx w korzeniu)
    (auth)/login/           Logowanie e-mail + hasło (Server Action)
    (trainer)/app/...       Panel trenera (layout, dashboard, klienci, psy)
    (trainer)/_lib/         requireContext(): kontekst żądania dla stron i akcji
  modules/<moduł>/
    domain/                 Czysta logika i schematy Zod; bez frameworka i bazy
    application/            Przypadki użycia: (ctx, input) => Result
    infrastructure/         Repozytoria (supabase-js), kontekst żądania
    ui/                     Komponenty specyficzne dla modułu
    index.ts                Publiczne API modułu
  shared/                   Jądro: Result, błędy, Money, Clock, kontekst, env,
                            klienci Supabase, formularze, UI, narzędzia testowe
  proxy.ts                  Odświeżanie sesji i ochrona tras /app oraz /portal
supabase/
  migrations/               Migracje SQL z RLS (źródło prawdy o schemacie)
  tests/database/           Testy pgTAP izolacji
docs/adr/                   Zapisy decyzji architektonicznych
```

Moduły istniejące: `core`, `clients`, `dogs`, `packages` (tylko domena), `payments` (tylko domena).

### 3.2. Reguły wymuszane w CI (`npm run check:boundaries`)

Plik `.dependency-cruiser.cjs`:
- moduł importuje inny moduł tylko przez jego `index.ts`,
- trasy w `src/app` importują moduły tylko przez `index.ts`,
- `domain` nie zależy od Next.js, Reacta, Supabase ani od warstw `application`, `infrastructure`, `ui`,
- `src/shared` nie zależy od modułów,
- klient `service_role` (`src/shared/supabase/admin.ts`) jest niedostępny z tras UI.

### 3.3. Przepływ żądania

1. `proxy.ts` odświeża sesję Supabase i weryfikuje JWT (`getClaims`). Niezalogowanego z `/app` i `/portal` przekierowuje na `/login`. Bez zmiennych środowiskowych Supabase proxy przepuszcza żądanie.
2. Strona lub Server Action woła `requireContext()` (`getRequestContext()` z modułu `core`). Kontekst zawiera: `userId`, `organizationId`, `role`, klienta bazy w kontekście użytkownika (`db`) i zegar (`clock`). Organizację wybiera ciasteczko `dt_org`, a gdy go brak, pierwsze aktywne członkostwo.
3. Przypadek użycia (`application`) sprawdza uprawnienie (`authorize(ctx, permission)`), waliduje wejście schematem Zod i woła repozytorium.
4. Repozytorium (`infrastructure`) wykonuje zapytanie przez `ctx.db`, więc RLS obowiązuje. Błędy bazy mapuje `fromDbError` na `AppError`.
5. Wynik wraca jako `Result<T, AppError>` (bez rzucania wyjątków w logice). Akcje formularzy zamieniają błędy na `FormState` z błędami pól.

### 3.4. Autoryzacja w dwóch warstwach

- **Aplikacja:** mapa rola → uprawnienia w `modules/core/domain/permissions.ts` (role `owner`, `admin`, `trainer`, `assistant`). Tylko `owner` ma `billing.manage`. `assistant` nie ma płatności ani notatek o psach.
- **Baza:** RLS na każdej tabeli organizacji. Funkcje pomocnicze w schemacie `app` (niewystawionym przez API), `security definer`, pusty `search_path`: `is_org_member`, `has_org_role`, `shares_org_with`, `client_ids_for_user`, `client_can_see_dog`. W politykach `(select auth.uid())`.

Nawet gdy przypadek użycia ma błąd, RLS nie wpuści danych innej organizacji. Potwierdzają to testy (sekcja 6).

### 3.5. Izolacja tenantów

- `organization_id` w każdej tabeli danych organizacji, także podrzędnych.
- Złożone klucze obce `(organization_id, id)` blokują powiązanie rekordów z różnych organizacji (np. pies z klientem tylko z tej samej organizacji, przypisany trener tylko z tej samej organizacji).
- Klient (kartoteka) jest oddzielony od konta logowania. Dostęp do panelu klienta przez `client_access` (jedna osoba u wielu trenerów, kilka osób w rodzinie). Decyzja: [ADR 0004](adr/0004-clients-dogs-access.md).

### 3.6. Konwencje

- Kwoty: `amount_minor` (grosze, integer) plus waluta; typ `Money` w `shared/money.ts`.
- Czas: `timestamptz` w UTC, strefa organizacji w `organization_settings` (domyślnie Europe/Warsaw).
- Statusy: `text` z `CHECK` zamiast enumów PostgreSQL; statusy wyliczalne (np. należność) liczone, nie przechowywane.
- Brak twardego usuwania: `archived_at`. Trwałe usuwanie tylko procedurami RODO jako `service_role`.
- Operacje atomowe jako funkcje PostgreSQL (`create_organization`), wołane przez `rpc()`.
- Zdarzenia domenowe: tabela `outbox_events` zapisywana w tej samej transakcji co zmiana; przetwarza ją `runOutbox()` (moduł `notifications`, trasa `/api/cron/outbox`, lokalnie pętla w `next dev`), idempotentnie (ADR 0008).
- Next 16 z Cache Components: strony są cienkie i synchroniczne, a praca zależna od żądania (`cookies`, `params`, `searchParams`) siedzi w komponentach pod `<Suspense>`. Efekt: częściowy prerender (statyczna powłoka, strumieniowana treść).
- Import `cookies()` w kliencie serwerowym następuje przed odczytem zmiennych środowiskowych, żeby prerender się wstrzymywał, a nie padał.

## 4. Model danych

### Zrobione (migracje 0001 i 0002, zastosowane na lokalnym Supabase)

| Tabela | Moduł | Cel |
| --- | --- | --- |
| `profiles` | core | Profil 1:1 z `auth.users` (trigger tworzy przy rejestracji) |
| `organizations`, `organization_settings` | core | Tenant i jego ustawienia (strefa, waluta, polityka odwołań, przypomnienia) |
| `organization_members` | core | Personel i role. Admin nie może nadawać ani zmieniać roli `owner`. |
| `invitations` | core | Zaproszenia: klientów (link, QR, krótki kod; tylko HMAC sekretów) w pełni działają; personelu (kolumny są, przepływu nie ma). `email` opcjonalny dla klientów, `client_package_id`, `code_hash`, `revoked_at`, `accepted_by` |
| `invitation_lookup_failures` | core | Dziennik nieudanych prób odczytu zaproszeń: globalne ograniczenie zgadywania kodów (bez polityk RLS) |
| `outbox_events` | core | Zdarzenia domenowe; bez polityk RLS, tylko `service_role` |
| `audit_log` | core | Dziennik tylko do dopisywania (odczyt owner/admin; zapis tylko funkcjami `security definer`) |
| `files` | core | Metadane plików Storage (tabela jest, uploadu nie ma) |
| `clients` | clients | Kartoteka klienta, `assigned_trainer_id`, status, archiwizacja |
| `client_access` | clients | Konta z dostępem do panelu klienta |
| `dogs` | dogs | Profil psa |
| `dog_notes` | dogs | Notatki zdrowotne/behawioralne/szczepienia; prywatne domyślnie, klient widzi tylko `visible_to_client` |
| `notifications` | notifications | Skrzynka w aplikacji (dzwonek); zapis tylko `service_role`, użytkownik zmienia wyłącznie `read_at`; unikalny `(recipient_user_id, dedupe_key)` |
| `notification_preferences` | notifications | Kanały użytkownika (push, e-mail); domyślnie oba włączone |
| `notification_log` | notifications | Dostarczenia per kanał (`sent`/`failed`/`skipped`/`preview`), unikalne `(notification_id, channel)`; bez polityk RLS |
| `push_subscriptions` | notifications | Subskrypcje web push urządzeń użytkownika |
| `client_requests` | notifications | Odpowiedzi klienta (`renew`/`pay`/`end`), tylko informacja dla trenera; zapis funkcją `create_client_request` |

Funkcja `public.create_organization(name, slug)`: atomowo tworzy organizację, ustawienia, członkostwo `owner`, zdarzenie w outbox i wpis w audycie.

### Zaprojektowane, jeszcze bez migracji (z planu v2.0)

- Kalendarz (reszta): `locations`, `session_series`, `session_private_notes`. (`session_types`, `training_sessions`, `session_attendees` są po etapie 2 demo.)
- Pakiety (reszta): `package_template_session_types` (po module zajęć).
- Zadania domowe: `exercise_library`, `homework_templates`, `homework_assignments`, `homework_submissions`, `homework_comments`.
- ~~Powiadomienia~~ (zrobione w etapie 4: `notifications`, `notification_preferences`, `notification_log`, `push_subscriptions`, `client_requests`).
- Rozliczenia SaaS: `plans`, `plan_entitlements`, `subscriptions`, `entitlement_overrides`, `billing_events`.
- Platforma i RODO: `platform_admins`, `admin_access_grants`, `legal_documents`, `consents`, `data_requests`, `import_jobs`.
- Kursy (faza 4): `courses`, `course_modules`, `course_lessons`, `course_enrollments`, `lesson_progress`.

### Odstępstwa od planu v2.0 (świadome)

1. **Saldo pakietu** to suma `delta` z `package_ledger` (wpis `purchase` dodaje zakupioną liczbę zajęć). Plan miał `sessions_total + suma delta`, co liczyłoby zakup podwójnie. [ADR 0003](adr/0003-package-ledger-and-payments.md).
2. **Widoczność klientów dla personelu:** na MVP każdy członek organizacji widzi wszystkich klientów. Plan: trener widzi tylko własnych lub udostępnionych. To wraca razem z planem Szkoła (zmiana polityki `clients_select_staff`, kolumna już jest). ADR 0004.
3. **Dostęp do danych:** `supabase-js` bez ORM (zgodnie z planem), ale typy bazy jeszcze nie są generowane (`npm run db:types` istnieje, plik `database.types.ts` nie), więc repozytoria używają ręcznych typów wierszy.

## 5. Co zostało zrobione

### Środowisko
- Zainstalowane: Node.js 24 LTS, Git, Docker Desktop, WSL2 (z uprawnieniami administratora). Skonfigurowana lokalna tożsamość git w repozytorium.
- Lokalny Supabase uruchamiany z pominięciem zbędnych usług (studio, realtime, storage-api, vector i in.): `npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,mailpit,realtime,storage-api,postgres-meta`.

### Kod (commity na `main` i `feat/clients-dogs`)
1. **Fundament** (`main`, 733b686): scaffold Next.js, logowanie, proxy sesji, klienci Supabase, `Result`/błędy/`Money`/`Clock`, moduł `core` (uprawnienia, `authorize`), logika domenowa pakietów i należności, migracja 0001, reguły granic modułów, ADR 0001-0003.
2. **Klienci i psy** (`feat/clients-dogs`, 8ad149b): migracja 0002, domena (normalizacja telefonu i e-maila, wiek psa, oczyszczanie frazy wyszukiwania), repozytoria, przypadki użycia, kreator pierwszej organizacji, panel trenera (lista z wyszukiwaniem i archiwum, dodawanie/edycja/archiwizacja klienta i psa, notatki o psie, wylogowanie), ADR 0004.
3. **Testy integracyjne i dokumentacja** (trzeci commit na `feat/clients-dogs`): testy integracyjne na prawdziwej bazie (`*.integration.test.ts`, `vitest.integration.config.mts`, `src/shared/testing/*`), skrypt `test:integration`, ten dokument.

4. **Rejestracja i odzyskiwanie hasła** (gałąź `feat/signup-password-reset`): rejestracja trenera (`/signup`, z obsługą potwierdzenia e-mail), reset hasła (`/forgot-password`, `/reset-password`, trasa `/auth/callback` wymieniająca kod PKCE na sesję), parametr `next` po zalogowaniu z walidacją (`safeNextPath`: tylko ścieżki względne wewnątrz `/app`, odrzuca `//host`, `\`, `..`, znaki sterujące), adres aplikacji w linkach z e-maili z konfiguracji (`NEXT_PUBLIC_SITE_URL`, nie z nagłówka Host, żeby nie dało się podstawić linku resetującego), jeden komunikat dla złego e-maila i złego hasła, brak wycieku istnienia konta przy resecie, hasła nigdy nie wracają do HTML formularza.

5. **Pakiety i płatności, etap 1 demo** (gałąź `feat/packages-payments`): migracja 0003 (`package_templates`, `client_packages`, `package_ledger` tylko do dopisywania, `charges`, `payments`, `payment_allocations`, widoki `v_client_package_balance`, `v_charge_balance`, `v_client_balance`, funkcje `sell_package`, `record_payment`, `adjust_package`, `void_charge`), domena (kwoty z formularza w groszach, sprzedaż z szablonu lub własna, status pakietu, alokacja wpłat), przypadki użycia, panel trenera (szablony pakietów, sprzedaż, saldo „zostało N z M", wpłaty, historia, korekta, kafelki „Kończące się pakiety" i „Płatności po terminie" na pulpicie). Decyzje w [ADR 0005](adr/0005-packages-payments.md).

6. **Zajęcia, etap 2 demo** (gałąź `feat/sessions`): migracja 0004 (`session_types`, `training_sessions` z wykluczeniem nakładających się terminów trenera, `session_attendees`, widok `v_session_details`, funkcje `schedule_session`, `complete_session`, `cancel_session`, pomocnik `app.pick_package`), moduł `scheduling` (strefa czasowa organizacji, polityka późnych odwołań, wybór pakietu: wskazany lub ten, który wygasa najwcześniej), ustawienia organizacji i lista trenerów w `core`, panel trenera (lista „Dziś” i „Najbliższe”, planowanie z wyborem klienta i psa, rodzaje zajęć, zakończenie z komunikatem „Zużyto 1 zajęcie, zostało N”, zakończenie bez pakietu z naliczeniem należności, odwoływanie, sekcja zajęć na karcie klienta, blok „Dziś” na pulpicie). Decyzje w [ADR 0006](adr/0006-sessions.md).

7. **Zaproszenia i panel klienta, etap 3 demo** (gałąź `feat/invitations-portal`): migracja 0005 (rozszerzone `invitations`, `invitation_lookup_failures`, zatwierdzanie psów `approval_status` + trigger blokujący niezatwierdzone psy w pakietach i na zajęciach, polityki RLS dla klienta: organizacja, ustawienia, dodawanie psa jako „oczekujący”, funkcje `create_client_invitation`, `lookup_invitation` (publiczna), `accept_invitation`, `revoke_client_access`), moduł `invitations` (sekrety, HMAC z pieprzem `INVITATION_HASH_SECRET`, kod QR), moduł `portal` (model do odczytu dla klienta, dodawanie psa), `resolveLandingPath` (po zalogowaniu personel do `/app`, klient do `/portal`), UI: sekcja „Panel klienta” na karcie klienta (zaproszenie z QR, kodem i linkiem, odbieranie dostępu), zatwierdzanie psów (karta klienta i kafelek na pulpicie), publiczne `/invite` i `/invite/[secret]` (rejestracja z zaproszenia lub przyjęcie na istniejące konto), panel klienta `/portal` z dolną nawigacją (start z saldem „4 z 5 zajęć zostało”, płatność z terminem, zajęcia, płatności, psy), skrypt `npm run seed:dev`. Decyzje w [ADR 0007](adr/0007-invitations-portal.md).

8. **Powiadomienia, etap 4 demo** (gałąź `feat/notifications`): migracja 0006 (`notifications`, `notification_preferences`, `notification_log`, `push_subscriptions`, `client_requests`, funkcje `create_client_request`, `claim_outbox_events`, `enqueue_daily_notification_events`, blokada i deduplikacja w `outbox_events`) i 0007 (zaproszenia personelu: `create_member_invitation`, `lookup_member_invitation`, `accept_member_invitation`, `revoke_member_invitation`). Moduł `notifications`: domena (`planNotifications`: zdarzenie → powiadomienia z treścią po polsku, odmiana „zajęcie/zajęcia/zajęć”, odbiorcy klient/personel), procesor `processOutbox`/`runOutbox` (blokada partii, idempotencja powiadomień i dostarczeń, ponowienia do 5 prób, licznik zalegających), adaptery `EmailSender` (Resend lub Mailpit), `PushSender` (web push VAPID, usuwa wygasłe subskrypcje), `SmsSender` (podgląd w logu), trasa `/api/cron/outbox` (sekret `CRON_SECRET`), pętla deweloperska co 10 s (`src/instrumentation-node.ts`), `npm run outbox:run`. Reguły dzienne: zbliżający się termin płatności, zaległość (raz na tydzień zaległości), przypomnienie o zajęciach (`reminder_hours_before`). UI: dzwonek z licznikiem i skrzynka (`/app/notifications`, `/portal/notifications`), ustawienia kanałów i włączanie push na urządzeniu (`.../settings`, `public/sw.js`), baner „Zostały Ci N zajęć” w portalu z przyciskami **Odnów pakiet / Zapłacę / Kończę współpracę** (także „Zapłacę” przy należności), widok `Prośby klientów` u trenera (`/app/requests`, licznik w nagłówku, oznaczanie jako obejrzane). Moduł `invitations`: wysyłka zaproszenia klientowi e-mailem i SMS-em (serwer weryfikuje link i kod z HMAC), zaproszenia personelu (`/app/team`, publiczne `/join/<token>`, rejestracja z zaproszenia lub przyjęcie na istniejące konto). Decyzje w [ADR 0008](adr/0008-notifications.md).

9. **PWA i telefon, etap 5 (część PWA)** (gałąź `feat/pwa`, ADR 0009) oraz **usunięcie SMS** (gałąź `feat/remove-sms`, migracja 0008): `app/manifest.ts`, ikony w `public/icons` (skrypt `generate-icons.mjs`), `/start`, rozszerzony `public/sw.js`, `offline.html`, `PwaRegister` i `InstallPrompt`, dolna nawigacja trenera i strona `/app/more`, ekran „Dziś” jako start na telefonie, instalacja w ustawieniach push dla iPhone'a, `viewport-fit=cover`. Decyzje i ograniczenia w [ADR 0009](adr/0009-pwa.md).

### Stan repozytorium zdalnego (aktualizuj po każdym wypchnięciu)
- `origin/main` = commit `19b334a`: etapy 1-3 (zatwierdzone przez właściciela).
- `origin/dev`: gałąź integracyjna, zawiera `main` plus późniejsze zmiany; wypchnięta 2026-10-16 z etapem 4 (commit `8d37f74`). `main` nadal na etapach 1-3.
- Poniżej zapis historyczny wypchnięcia z 2026-10-16:

`https://github.com/g2rd/saas_dogz`: `origin/main` zawiera etapy 1-3 (wypchnięte 2026-10-16 na prośbę właściciela, commit `75944e4` i kolejny z aktualizacją tego pliku). Gałęzie robocze `feat/*` są tylko lokalne (są już w `main`). Kolejne wypchnięcia robimy tylko na prośbę właściciela; ten wiersz aktualizuj po każdym wypchnięciu. Logowanie do GitHuba odbywa się przez Git Credential Manager w przeglądarce, więc `git push` uruchamiaj w terminalu użytkownika (narzędzie `run_in_terminal`), nie w powłoce Claude.

### Funkcje widoczne dla użytkownika
Powiadomienia po obu stronach (dzwonek, e-mail, push) z odpowiedziami klienta, wysyłka zaproszeń e-mailem, zespół i zaproszenia personelu,
Zaproszenia klientów i panel klienta (saldo zajęć, płatności z terminami, zajęcia, dodawanie psów do zatwierdzenia),
Zajęcia (planowanie, rozliczanie z pakietu, odwoływanie), pakiety i płatności (szablony, sprzedaż, wpłaty częściowe, nadpłaty, korekty, zaległości), rejestracja, reset hasła, logowanie, utworzenie organizacji przy pierwszym wejściu, lista klientów z wyszukiwaniem, dodanie/edycja/archiwizacja klienta, dodanie/edycja/archiwizacja psa, notatki o psie (prywatne lub widoczne dla klienta).

## 6. Weryfikacja (wyniki z tej sesji)

| Sprawdzenie | Polecenie | Wynik |
| --- | --- | --- |
| Typy | `npm run typecheck` | czysto |
| Lint | `npm run lint` | czysto |
| Testy jednostkowe (domena) | `npm test` | 157/157 (w tym symulacja service workera) |
| Granice modułów | `npm run check:boundaries` | brak naruszeń (185 modułów) |
| Build produkcyjny | `npm run build` | przechodzi, trasy panelu to częściowy prerender |
| Migracje | `supabase start` | obie zastosowane bez błędów |
| Testy RLS (pgTAP) | `npm run db:test` | 125/125 (7 plików, w tym `notifications` i `member_invitations`) |
| Testy przypadków użycia na bazie (auth z Mailpit, pakiety, płatności, zajęcia, zaproszenia, panel klienta, powiadomienia, zaproszenia personelu, wyścigi) | `npm run test:integration` | 100/100 (7 plików) |

Testy integracyjne pokrywają: tworzenie klienta z normalizacją, błędy walidacji pól, wyszukiwanie (także ze znakami sterującymi filtru), psy i notatki, odrzucenie daty urodzenia z przyszłości, archiwizację i przywracanie, izolację organizacji (także przy podmienionym `organizationId`), widok klienta z dostępem (tylko własne dane i notatki oznaczone jako widoczne) oraz ograniczenia roli `assistant`.

### Przeklikane w przeglądarce (lokalny Supabase + `npm run dev`)
Przepływ przeszedł end-to-end: przekierowanie niezalogowanego z `/app` na `/login`, logowanie, kreator pierwszej organizacji („Szkoła Łapa"), dodanie klienta (telefon `600 100 200` zapisany jako `+48600100200`, e-mail zamieniony na małe litery), błąd walidacji telefonu z komunikatem przy polu, dodanie psa (wiek liczony poprawnie), notatka widoczna dla klienta, wyszukiwanie (trafienie i brak wyników), archiwizacja i przywrócenie klienta, wylogowanie i ponowna ochrona trasy.

Znalezione i naprawione w tej rundzie:
1. **Błąd prerenderu `Date.now()`** na `/app` (Cache Components): `getClaims()` używa czasu, a strona była próbą prerenderu. Naprawa: `await connection()` przed `cookies()` w `createUserClient`.
2. **Utrata wpisanych danych po błędzie walidacji:** React 19 czyści formularz po akcji. Naprawa: `FormState.values` i odtwarzanie jako `defaultValue` we wszystkich formularzach.
3. Na stronie psa pokazywało się „Nie podano" przy nieznanej płci (na liście klienta już nie). Naprawione.
4. Mylący komunikat pustej listy, gdy wszyscy klienci są w archiwum. Naprawione.

### Przeklikane w przeglądarce: etap 3
Przepływ end-to-end: trener tworzy zaproszenie (link, kod QR, kod `G8SCF-U6JSX` z pakietem do potwierdzenia, e-mail z kartoteki), wylogowanie, strona `/invite` (zły kod daje błąd pola, poprawny wpisany małymi literami ze spacją przekierowuje), strona zaproszenia z nazwą szkoły, pakietem i zamaskowanym e-mailem (`a***@example.pl`), rejestracja ze złym e-mailem jest odrzucona bez zakładania konta (dane zostają, hasło nie), rejestracja z właściwym e-mailem tworzy konto i od razu przenosi do `/portal`, panel klienta (na telefonie 375 px bez poziomego przewijania: „4 z 5 zajęć zostało”, płatność 400 zł z terminem, najbliższe zajęcia, dolna nawigacja), dodanie psa „Rex” (status „Czeka na zatwierdzenie”), logowanie trenera bez adresu docelowego trafia do `/app` (według roli), kafelek „Psy do zatwierdzenia”, zatwierdzenie psa na karcie klienta.
Uwaga o narzędziu: gdy okno podglądu jest ukryte, strumieniowana treść Next nie podmienia się sama; w konsoli pomaga `$RV($RB)`.

### Przeklikane w przeglądarce: etap 4
Lokalny Supabase + `npm run dev` (pętla outbox włączona): zdarzenie niskiego salda wstawione do `outbox_events` zamieniło się w ciągu kilku sekund na powiadomienie trenera (dzwonek z licznikiem „1”, skrzynka, kliknięcie oznacza jako przeczytane i przechodzi na kartę klienta) i na powiadomienie klientki Anny; oba e-maile pojawiły się w Mailpit. Panel klienta na telefonie (375 px): baner „Zostały Ci 2 zajęcia” z przyciskami „Odnów pakiet”, „Zapłacę”, „Kończę współpracę”; po kliknięciu „Odnów pakiet” komunikat „Wysłano trenerowi” i przycisk znika; u trenera licznik „Prośby 1” i dzwonek, widok `/app/requests` (klient, rodzaj, pakiet, czas), „Oznacz jako obejrzaną” przenosi prośbę do obejrzanych. Zespół: `/app/team`, zaproszenie `nowy.trener@example.test` jako Trener (e-mail wysłany, link widoczny raz), strona `/join/<token>` pokazuje organizację i rolę z zamaskowanym adresem, rejestracja z zaproszenia tworzy konto i od razu przenosi do `/app` w organizacji trenera. Strona ustawień powiadomień ładuje się bez błędów w konsoli i logu serwera.

### Przeklikane: etap 5 (PWA)
Produkcyjny build na `127.0.0.1`: manifest (`application/manifest+json`), `sw.js` (`application/javascript`), meta `theme-color`, `apple-touch-icon`, `viewport-fit=cover`, `/start` przekierowuje niezalogowanego na `/login`. Panel trenera w 375 px: ekran „Dziś” na górze, dolna nawigacja z pięcioma pozycjami, strona „Więcej” bez poziomego przewijania. Service worker sprawdzony symulacją (6 testów: strona offline, cache zasobów, ignorowanie POST/API/cudzych domen, push, bezpieczne kliknięcie). **Nie** sprawdzono rejestracji service workera w przeglądarce (wbudowana przeglądarka Claude go nie obsługuje, a Chrome z rozszerzeniem nie miał dostępu do adresu lokalnego), instalacji ani push na telefonie.

### Czego NIE zweryfikowano
- Edycja klienta i psa przez formularz, usuwanie notatki oraz archiwizacja psa nie były przeklikane; rejestracja z zaproszenia przy włączonym potwierdzeniu e-mail (link wraca na stronę zaproszenia) nie była przeklikana (lokalnie potwierdzenia są wyłączone); odrzucanie psa i odbieranie dostępu tylko testami integracyjnymi.
- Widok mobilny i dostępność (poza stroną startową portalu z etapu 4, sprawdzoną w 375 px).
- Etap 4: faktyczne włączenie web push na telefonie (zgoda przeglądarki, wysyłka do prawdziwego urządzenia; klucze VAPID są tylko lokalne), przyciski „Wyślij e-mailem”/„Wyślij SMS” w przeglądarce (są testy integracyjne), strony `/portal/notifications*` i `/app/notifications/settings` po zmianie preferencji, zaproszenie personelu z włączonym potwierdzeniem e-mail, harmonogram cron na produkcji.
- Odświeżanie wygasłej sesji w `proxy.ts` (nie czekano na wygaśnięcie tokenu).
- Wydajność RLS na dużych zbiorach, indeksy poza podstawowymi.
- `npm audit` zgłosił 5 podatności o wysokiej wadze w zależnościach scaffoldu; nie były przeglądane.

## 7. Jak uruchomić

```bash
npm install
npm run db:start            # lokalny Supabase (wymaga Dockera); wypisze URL i klucze
cp .env.example .env.local  # wpisz NEXT_PUBLIC_SUPABASE_URL i NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Testy: `npm test` (jednostkowe), `npm run db:test` (pgTAP), `npm run test:integration` (przypadki użycia na bazie), `npm run check:boundaries`, `npm run typecheck`, `npm run lint`.

Powiadomienia lokalnie: `npm run dev` sam przetwarza outbox co 10 s (wyłączenie: `OUTBOX_DEV_POLL=off`), e-maile trafiają do Mailpit (`http://127.0.0.1:54324`, HTTP API, port SMTP nie jest wystawiony), SMS jest tylko w logu serwera. Ręczne uruchomienie przez trasę cron: ustaw `CRON_SECRET` w `.env.local` i wywołaj `npm run outbox:run`. Klucze VAPID do web push: `npx web-push generate-vapid-keys` (publiczny w `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, prywatny w `VAPID_PRIVATE_KEY`). Test integracyjny powiadomień oznacza wszystkie niezałatwione zdarzenia innych organizacji jako przetworzone, więc na lokalnej bazie z danymi deweloperskimi zniknie z nich ewentualna kolejka. Zmienne opisuje `.env.example`.

Uwagi praktyczne (Windows): w PowerShell `npx` bywa kapryśne, użyj `npx.cmd`; długie ścieżki w katalogu tymczasowym psują `git commit -F`, więc plik z opisem trzymaj w krótkiej ścieżce; pakiet `supabase` z npm wymaga zatwierdzenia skryptów instalacyjnych (`npm rebuild supabase`).

### Konta testowe (tylko lokalnie)
Konta istnieją wyłącznie w lokalnej bazie Supabase (Docker) i znikają po `supabase db reset`; nie są częścią repozytorium. Aplikacja: `http://localhost:3000` (`npm run dev`), poczta lokalna (Mailpit): `http://127.0.0.1:54324`.

| Rola | E-mail | Hasło | Po zalogowaniu |
| --- | --- | --- | --- |
| Trener (organizacja „Szkoła Łapa”, klienci Anna, Piotr, Marta, pakiet, zajęcia) | `trener@example.test` | `Dev-Haslo-12345` | `/app` |
| Klient Anna Kowalska (konto z zaproszenia, psy Burek i Rex) | `anna@example.pl` | `Klient-Haslo-2026` | `/portal` |
| Drugi trener z osobnymi danymi z `npm run seed:dev` | `seedcheck@example.test` | `Seed-Check-Pass-1` | `/app` |
| Konto bez organizacji (po teście rejestracji i resetu hasła) | `marta.nowak@example.test` | `Nowe-Haslo-2026` | kreator organizacji |

Po resecie bazy: trenera i dane odtwarza `SEED_EMAIL=trener@example.test SEED_PASSWORD=<hasło> npm run seed:dev` (w PowerShellu: `$env:SEED_PASSWORD='...'; npm run seed:dev`), a konto klienta powstaje z nowego zaproszenia (niżej).

### Jak zaprosić klienta do panelu (stan po etapie 3)
1. Zaloguj się jako trener, otwórz kartę klienta (`Klienci`, wybrany klient), sekcja **Panel klienta**, `Zaproś klienta do panelu`.
2. Wybierz pakiet do potwierdzenia (domyślnie najnowszy aktywny) i ewentualnie e-mail klienta (podpowiada się z kartoteki). Z e-mailem tylko konto z tym adresem przyjmie zaproszenie; bez e-maila przyjmie je każdy, kto ma kod lub link.
3. `Utwórz zaproszenie`: pojawią się **kod QR**, **krótki kod** (np. `G8SCF-U6JSX`) i **link**. Są widoczne tylko teraz (po odświeżeniu strony ich nie odzyskasz, trzeba utworzyć nowe zaproszenie, które unieważnia poprzednie). Ważne 7 dni.
4. **Wyślij je klientowi**: pod kodem QR są przyciski `Wyślij e-mailem` (adres z zaproszenia lub kartoteki; lokalnie wiadomość trafia do Mailpit). Można też pokazać QR, przeczytać kod lub wkleić link samodzielnie.
5. Klient skanuje QR lub otwiera link (albo wchodzi na `/invite` i wpisuje kod), zakłada konto (imię, e-mail, hasło) i od razu trafia do panelu `/portal`. Kto ma już konto: `Zaloguj się` na stronie zaproszenia, potem `Przyjmij zaproszenie`.
6. Na karcie klienta pojawi się „Konto z dostępem do panelu” z przyciskiem `Odbierz dostęp`.

Czego jeszcze nie ma: magic linku dla klientów (SMS: rezygnacja). Zaproszenia personelu: `Zespół` w nagłówku → `Zaproś do zespołu` (e-mail i rola, link `/join/<token>` ważny 7 dni, wysyłany e-mailem).
## 8. Do zrobienia

Ścieżka do pierwszej sprzedaży, limitacje i ryzyka: [WDROZENIE-PRODUKCYJNE.md](WDROZENIE-PRODUKCYJNE.md) (fazy A-F z bramkami, tabela ryzyk, minimalny zakres pilotażu).

Kolejność odpowiada planowi v2.0 (Faza 1 = MVP do płatnego pilotażu).

### Najbliższe (domknięcie tego, co jest)
1. Dokończyć przeklikanie: edycja klienta i psa, usuwanie notatki, archiwizacja psa, widok mobilny. Przeklikać też ścieżkę rejestracji z włączonym potwierdzeniem e-mail (`enable_confirmations = true`); lokalnie sprawdzono tylko wariant bez potwierdzenia.
2. Okres próbny 14 dni bez karty (rejestracja i reset hasła są gotowe), akceptacja regulaminu przy rejestracji (wymaga `legal_documents` i `consents`), ograniczanie liczby prób logowania i rejestracji.
3. Wygenerować typy bazy (`npm run db:types`, zapis w UTF-8 bez BOM) i przepisać repozytoria na typy generowane.
4. Dodać `.gitattributes` (końce linii; Git ostrzega o LF→CRLF), `Dependabot`, przejrzeć `npm audit`.
5. Scalić `feat/clients-dogs` do `main` po przeklikaniu panelu.
6. Strony `error.tsx` i `not-found.tsx` dla panelu, przełącznik organizacji (ciasteczko `dt_org` jest czytane, ale nic go nie ustawia).

### Faza 1: reszta MVP
7. ~~Zaproszenia klientów~~ i ~~zaproszenia personelu~~ (zrobione w etapach 3 i 4, `/app/team`, `/join/<token>`). Zostało: magic link dla klientów, ograniczanie prób per IP (dziś tylko globalne w bazie), zmiana roli i zawieszanie członków, przełącznik organizacji.
8. **Panel klienta (PWA):** podstawa jest zrobiona w etapie 3 (`/portal`: start, zajęcia, płatności, psy), a w etapie 4 powiadomienia i odpowiedzi klienta. Zostało: manifest PWA i pełny service worker (etap 5; `public/sw.js` obsługuje na razie tylko push), zadania domowe, branding trenera, przełącznik trenerów/organizacji (ciasteczko `dt_client` jest czytane, nic go nie ustawia).
9. **Kalendarz:** minimalna wersja jest zrobiona w etapie 2 demo (typy zajęć, zajęcia indywidualne, kolizje terminów trenera, zakończenie zużywające pakiet, odwoływanie z polityką, listy Dziś i Najbliższe). Zostało: widoki dzień/tydzień, edycja i przeniesienie terminu, `locations`, serie cykliczne (rrule), zajęcia grupowe z limitem miejsc, nieobecność (`no_show`), prywatne notatki z zajęć, kanał ICS, filtr po trenerze.
10. ~~Pakiety~~ (zrobione w etapie 1 demo; zostało: anulowanie pakietu, wygasanie pakietu zadaniem dziennym z wpisem `expiry`, powiązanie z typami zajęć).
11. ~~Płatności~~ (zrobione w etapie 1 demo; zostało: storno błędnie zaksięgowanej wpłaty, zwrot wpłaty, obsługa wielu walut u jednego klienta, płatności online).
12. **Zadania domowe:** biblioteka ćwiczeń, szablony, przydzielanie, przesyłanie krótkich filmów (upload bezpośrednio do Storage z podpisanym URL, limity według planu, retencja). Wymaga włączenia usługi Storage w lokalnym Supabase.
13. ~~Powiadomienia e-mail~~ (zrobione w etapie 4, ADR 0008). Zostało: szablony React Email (dziś prosty HTML), kanał dzienny/wieczorny (cisza nocna), harmonogram produkcyjny dla `/api/cron/outbox`, adapter SMS (SMSAPI), test push na prawdziwym telefonie, alert o zalegających zdarzeniach w monitoringu.
14. **Plany i uprawnienia:** `plans`, `plan_entitlements`, `subscriptions`, `entitlement_overrides`; funkcje `can(org, feature)` i `limit(org, klucz)`; tryb tylko do odczytu po trialu; oferta Founding Member.
15. **Import klientów** z CSV/Excela (`import_jobs`).
16. **Zgodność (RODO):** `legal_documents`, `consents` (w tym zgoda na wizerunek w filmach), eksport danych klienta i organizacji, usuwanie i retencja, faktyczne zapisy do `audit_log` z przypadków użycia.
17. **Panel administratora platformy** (podstawowy) i dostęp serwisowy za zgodą z audytem.
18. Uzupełnić testy RLS (pgTAP) dla każdej nowej tabeli i testy integracyjne dla każdego nowego przypadku użycia.

### Infrastruktura i jakość (przed pilotażem)
19. **CI** w GitHub Actions: lint, typecheck, testy jednostkowe, `supabase test db`, testy integracyjne, granice modułów, migracje, build, E2E smoke (Playwright).
20. Środowiska: projekt Supabase (UE, Frankfurt) dla staging i produkcji, Vercel w regionie `fra1`, własny SMTP, zmienne środowiskowe, wdrażanie migracji z CI.
21. Monitoring: Sentry (z usuwaniem danych osobowych), logi strukturalne z `request_id` i `organization_id`, monitor dostępności, alerty na błędy zadań i rosnący outbox.
22. Kopie zapasowe: dzienne Supabase, cotygodniowy zaszyfrowany zrzut poza dostawcą, test przywracania raz na kwartał.
23. Bezpieczeństwo: nagłówki i CSP, ograniczanie liczby żądań na logowaniu i publicznych endpointach, MFA TOTP dla właścicieli, rotacja kluczy.
24. `next-intl` (na start tylko polski), React Hook Form tam, gdzie formularze tego wymagają, design system (shadcn/ui), dostępność i widok mobilny.
25. Konto demo z realistycznymi danymi (seed) i strona marketingowa z cennikiem.

### Start sprzedaży (Faza 2)
26. Stripe Billing (portal klienta, ponawianie nieudanych płatności), faktury przez Fakturownię, samodzielna rejestracja z listą kroków aktywacji, raporty dla trenera, powiadomienia w aplikacji, program poleceń.

### Później (Fazy 3-4)
27. Plan Szkoła: wielu trenerów, widoczność klientów per trener i współdzielenie (zmiana polityk RLS), raporty zespołu. SMS i web push, Google Calendar, płatności online od klientów trenera, zewnętrzna kolejka zadań, PITR.
28. Kursy oparte na bibliotece ćwiczeń i streaming wideo, publiczne API i webhooki, aplikacja mobilna jako nakładka na `/api/v1`, kolejne języki i waluty.

### Poza kodem
29. Walidacja: 10-15 wywiadów z trenerami, sprawdzenie cen 49/79/119 zł, 5-10 pilotażystów na warunkach Founding Member.
30. Dokumenty prawne (regulamin, polityka prywatności, umowa powierzenia, wzór zgody na wizerunek), konsultacja z księgowym (VAT), znak towarowy i domena.

## 9. Ryzyka i uwagi

- **Plan v2.0 nie jest zapisany w repozytorium.** Warto go zapisać jako `docs/plan.json` albo `docs/PLAN.md`, żeby decyzje miały źródło.
- **RLS to najważniejsza i najbardziej ryzykowna warstwa.** Każda nowa tabela musi dostać polityki i test izolacji w tej samej migracji, w której powstaje.
- **Klucz `service_role` omija RLS.** Wolno go używać tylko w zadaniach w tle, webhookach i panelu administratora (reguła w dependency-cruiser pilnuje tras UI).
- **Koszty wideo** (przechowywanie i transfer) to główne ryzyko kosztowe; potrzebne limity według planu, kompresja i retencja zanim ruszy moduł zadań domowych.
- **Jedna osoba w projekcie:** ADR-y, testy i automatyzacja wdrożeń są tym, co ogranicza ryzyko.
- Lokalny stos Supabase uruchomiony w tej sesji działa w Dockerze na tym komputerze; zatrzymanie: `npx supabase stop`. Poczta lokalna (Mailpit) jest pod `http://127.0.0.1:54324`.

## 10. Plan demo (mobile-first)

Cel: aplikacja do pokazania trenerom, w której cały obieg „klient → pakiet → zajęcia → płatność → powiadomienia" działa na telefonie.

### 10.1. Rodzaj aplikacji
**PWA** (instalowalna aplikacja webowa) na obecnym Next.js, z jednym kodem dla trenera i klienta. Dla demo to najlepszy wybór: otwiera się z linku lub kodu QR bez sklepu z aplikacjami, instaluje się na ekranie głównym, obsługuje powiadomienia push. Aplikacja natywna (React Native/Expo) wchodzi dopiero, gdy PWA nie wystarczy (obecność w sklepach, niezawodny push na iOS); architektura (`/api/v1`, moduły bez zależności od frameworka) to dopuszcza.
- **Mobile-first:** panel klienta (`/portal`) projektowany najpierw na telefon (dolna nawigacja: Pakiet, Zajęcia, Psy, Płatności; duże elementy dotykowe). Panel trenera ma widok „Dziś" jako ekran startowy na telefonie, a pełne zarządzanie wygodne na komputerze.
- **Ograniczenie iOS:** web push działa tylko po dodaniu PWA do ekranu głównego (iOS 16.4+). Na demo trzeba to pokazać lub użyć Androida.

### 10.2. Docelowy przepływ demo
1. Trener dodaje klienta i **sprzedaje mu pakiet** (np. 10 zajęć, cena, termin płatności, ważność). Powstaje należność.
2. System generuje **zaproszenie**: link i kod QR (plus krótki kod do wpisania), ważne 7 dni, z informacją o pakiecie. Trener pokazuje QR klientowi na telefonie.
3. Klient otwiera zaproszenie, **ustawia hasło** (lub loguje się linkiem), potwierdza pakiet. Powstaje `client_access`, a potwierdzenie jest zapisane (zgoda).
4. Klient **dodaje swojego psa**; pies ma status „do zatwierdzenia", dopóki trener go nie zatwierdzi. Pies dodany przez trenera jest od razu zatwierdzony. Trener może dodawać klientów i psy sam.
5. Klient widzi: **ile zajęć zostało**, kiedy i ile musi **zapłacić**, najbliższe zajęcia.
6. Trener oznacza zajęcia jako odbyte, więc z pakietu schodzi 1 jednostka (wpis w dzienniku).
7. **Powiadomienia w dwie strony:** gdy zostają 2 zajęcia, klient dostaje „zostały ostatnie zajęcia, co dalej?" z przyciskami **Odnów pakiet / Zapłać / Zakończ**; trener dostaje informację, że pakiet klienta się kończy i jaką decyzję podjął klient. Podobnie dla płatności (zbliża się termin, zaległość).

### 10.3. Decyzje projektowe
- **Zaproszenie i kod:** zrobione w etapie 3 (ADR 0007): link/QR + krótki kod, tylko HMAC w bazie, jednorazowe, 7 dni, powiązane z pakietem.
- **Zatwierdzanie psów:** kolumna `dogs.approval_status` (`pending` | `approved`) i `created_by_client`. Polityka RLS: klient może dodać psa tylko do swojego klienta i tylko jako `pending`; edycja zatwierdzonego psa przez trenera. Skrzynka „do zatwierdzenia" w panelu trenera.
- **Pakiety i płatności:** migracje z planu (`package_templates`, `client_packages`, `package_ledger`, `charges`, `payments`, `payment_allocations`, widoki), na gotowej domenie (`ledger.ts`, `charge-status.ts`). Na demo płatność to ewidencja przez trenera (gotówka, przelew, BLIK) i widoczność dla klienta; płatności online są osobnym dodatkiem (faza 3).
- **Zajęcia (wersja minimalna):** `session_types`, `training_sessions`, `session_attendees` i akcja „oznacz jako odbyte" zużywająca zajęcie z pakietu atomowo (funkcja SQL). Pełny kalendarz (serie, grupy, polityka odwołań) później; na demo wystarczy lista „Dziś / Najbliższe".
- **Powiadomienia:** reguły dzienne i zdarzenia z outbox (`client_package.low_balance`, `charge.due`, `charge.overdue`); kanały za interfejsami: w aplikacji (tabela `notifications`, dzwonek), **web push** (VAPID, `web-push`), e-mail (Resend). **SMS** jako adapter `SmsSender` (polski dostawca, np. SMSAPI): płatny dodatek z marżą, na demo w trybie podglądu lub jeden prawdziwy SMS na numer prezentera. Odpowiedzi klienta na powiadomienie („odnów", „zakończ") tworzą zdarzenia dla trenera.
- **Tryb demo:** organizacja z realistycznymi danymi (seed) oraz panel „sterowanie demo": przewiń czas (symuluj koniec pakietu, zaległą płatność) i wyślij powiadomienie testowe, żeby pokazać pełny obieg na żywo bez czekania.

### 10.4. Kolejność wdrożenia (każdy etap: migracja z RLS, domena z testami, przypadki użycia, UI, testy na bazie, przeklikanie)
1. ✅ **Pakiety i płatności** (trener sprzedaje pakiet, widzi saldo i należności, rejestruje wpłatę). Zrobione (sekcja 5, ADR 0005).
2. ✅ **Zajęcia (minimalne)** i zużywanie pakietu. Zrobione (sekcja 5, ADR 0006).
3. ✅ **Zaproszenia i panel klienta** (`/portal`, logowanie z zaproszenia, saldo, płatności, dodawanie psa, zatwierdzanie przez trenera). Zrobione (sekcja 5, ADR 0007).
4. ✅ **Powiadomienia** (w aplikacji, web push, e-mail; reguły niskiego salda i płatności; odpowiedzi klienta; SMS usunięty), wysyłka zaproszeń i zaproszenia personelu. Zrobione (sekcja 5, ADR 0008).
5. **PWA i dopracowanie mobilne** (manifest, ikony, service worker, dolna nawigacja, widok „Dziś"), seed demo i sterowanie demo.

### 10.5. Pytania do ustalenia przed startem (rozstrzygnięte 2026-10-16: płatność księguje trener, SMS w trybie podglądu, zaproszenie jako QR + link + krótki kod)
- Czy na demo ma być **prawdziwy SMS**, czy wystarczą push, e-mail i podgląd SMS? (prawdziwy wymaga konta u dostawcy i budżetu)
- Czy klient ma **płacić w aplikacji** (BLIK/karta), czy tylko widzieć, ile i kiedy ma zapłacić, a trener księguje wpłatę?
- Na jakim telefonie prezentujemy (iPhone wymaga instalacji PWA dla push)?
- Czy kod zaproszenia ma być **tylko QR/link**, czy też krótki kod do ręcznego wpisania?

## 11. Plan następnego etapu: 5 (reszta). Test na telefonach, seed demo i „sterowanie demo”

Decyzja właściciela (2026-10-16): **na początek dajemy aplikację do testowania na 2 tygodnie, bez płatności; opłaty wprowadzamy, gdy komuś się spodoba.** Freemium (2 klientów za darmo), plany i Stripe Billing odkładamy (analiza nakładu: [WDROZENIE-PRODUKCYJNE.md](WDROZENIE-PRODUKCYJNE.md), sekcja 7). SMS: rezygnacja. Natywna aplikacja: po walidacji.

### Zrobione w etapie 5 (część PWA, gałąź `feat/pwa`, ADR 0009)
Manifest, ikony, `/start`, service worker (push, strona offline, cache zasobów statycznych), baner instalacji (Android i instrukcja iOS), dolna nawigacja trenera, ekran „Dziś”, strona „Więcej”, instrukcja instalacji w ustawieniach push na iPhonie.

### Do zrobienia, żeby oddać aplikację testerom na 2 tygodnie
- [ ] **Wdrożenie staging z HTTPS** (Vercel + osobny projekt Supabase w UE, własna domena, migracje z CI): bez HTTPS nie da się przetestować instalacji PWA ani push na telefonie. Krok 8-11 z `WDROZENIE-PRODUKCYJNE.md`.
- [ ] **Konto Resend i domena nadawcy** (SPF/DKIM) oraz własny SMTP w Supabase Auth; klucze VAPID produkcyjne; `CRON_SECRET`; `INVITATION_HASH_SECRET`.
- [ ] **Harmonogram `/api/cron/outbox`** (co minutę) i alert, gdy trasa zwraca 500.
- [ ] **Test PWA i push na prawdziwych telefonach** (Android Chrome i iPhone Safari z instalacją do ekranu głównego): instalacja, ikona, `/start`, push, kliknięcie powiadomienia, strona offline. Do tej pory zweryfikowane tylko symulacją (`service-worker.test.ts`), manifestem i nagłówkami.
- [ ] **Seed demo** (`npm run seed:demo`) i **„sterowanie demo”** (przewijanie czasu, powiadomienie testowe, uruchomienie outboxu): potrzebne, żeby tester zobaczył obieg bez czekania na dane.
- [ ] **Minimum prawne na testy** (krótki regulamin testów i polityka prywatności, zgoda na dane): testerzy wpisują dane klientów i psów (RODO).
- [ ] **Kopie zapasowe i monitoring minimum** (dzienne kopie Supabase, Sentry w wersji darmowej, monitor dostępności).
- [ ] **Import klientów z CSV**: bez tego trener z kilkudziesięcioma klientami nie przetestuje realnego użycia.
- [ ] **Zbieranie opinii**: prosty formularz lub rozmowy po tygodniu i po dwóch; kryterium „komuś się spodobało” ustalone z góry (np. dodał klientów, sprzedał pakiet, klient użył panelu).
- [ ] Przejrzeć podstrony pod tryb `standalone` (linki powrotu), ADR 0010 po teście na telefonach, aktualizacja tego pliku.

### Po okresie testowym (jeśli testerom się spodoba)
Plany i limity, Stripe Billing (rozliczenia ręczne wystarczą dla pierwszych kilku płacących), regulamin i VAT, zadania domowe, kalendarz poza minimum (patrz `WDROZENIE-PRODUKCYJNE.md`, fazy C-F).
