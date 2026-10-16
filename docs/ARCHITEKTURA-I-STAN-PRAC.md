# DogTrainer SaaS: architektura, stan prac i lista zadań

Stan na 2026-10-16. Dokument opisuje, jak zbudowana jest aplikacja, co jest już zrobione i sprawdzone, co jest tylko zaprojektowane i co trzeba jeszcze zrobić. Źródłem wymagań jest plan v2.0 (JSON przekazany w rozmowie; nie ma go w repozytorium, patrz sekcja 9).

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

Nie ma jeszcze: Stripe, Fakturowni, Resend, Sentry, PostHog, next-intl, React Hook Form, CI, hostingu (patrz sekcja 8).

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
- Zdarzenia domenowe: tabela `outbox_events` zapisywana w tej samej transakcji co zmiana (na razie zapisuje `organization.created`; nikt jeszcze nie przetwarza).
- Next 16 z Cache Components: strony są cienkie i synchroniczne, a praca zależna od żądania (`cookies`, `params`, `searchParams`) siedzi w komponentach pod `<Suspense>`. Efekt: częściowy prerender (statyczna powłoka, strumieniowana treść).
- Import `cookies()` w kliencie serwerowym następuje przed odczytem zmiennych środowiskowych, żeby prerender się wstrzymywał, a nie padał.

## 4. Model danych

### Zrobione (migracje 0001 i 0002, zastosowane na lokalnym Supabase)

| Tabela | Moduł | Cel |
| --- | --- | --- |
| `profiles` | core | Profil 1:1 z `auth.users` (trigger tworzy przy rejestracji) |
| `organizations`, `organization_settings` | core | Tenant i jego ustawienia (strefa, waluta, polityka odwołań, przypomnienia) |
| `organization_members` | core | Personel i role. Admin nie może nadawać ani zmieniać roli `owner`. |
| `invitations` | core | Zaproszenia personelu i klientów (tabela jest, przepływu nie ma) |
| `outbox_events` | core | Zdarzenia domenowe; bez polityk RLS, tylko `service_role` |
| `audit_log` | core | Dziennik tylko do dopisywania (odczyt owner/admin; zapis tylko funkcjami `security definer`) |
| `files` | core | Metadane plików Storage (tabela jest, uploadu nie ma) |
| `clients` | clients | Kartoteka klienta, `assigned_trainer_id`, status, archiwizacja |
| `client_access` | clients | Konta z dostępem do panelu klienta |
| `dogs` | dogs | Profil psa |
| `dog_notes` | dogs | Notatki zdrowotne/behawioralne/szczepienia; prywatne domyślnie, klient widzi tylko `visible_to_client` |

Funkcja `public.create_organization(name, slug)`: atomowo tworzy organizację, ustawienia, członkostwo `owner`, zdarzenie w outbox i wpis w audycie.

### Zaprojektowane, jeszcze bez migracji (z planu v2.0)

- Kalendarz: `session_types`, `locations`, `session_series`, `training_sessions`, `session_attendees`, `session_private_notes`.
- Pakiety: `package_templates`, `package_template_session_types`, `client_packages`, `package_ledger` + widok `v_client_package_balance`.
- Płatności: `charges`, `payments`, `payment_allocations` + widoki `v_charge_status`, `v_client_balance`.
- Zadania domowe: `exercise_library`, `homework_templates`, `homework_assignments`, `homework_submissions`, `homework_comments`.
- Powiadomienia: `notifications`, `notification_preferences`, `notification_log`.
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

### Funkcje widoczne dla użytkownika
Logowanie, utworzenie organizacji przy pierwszym wejściu, lista klientów z wyszukiwaniem, dodanie/edycja/archiwizacja klienta, dodanie/edycja/archiwizacja psa, notatki o psie (prywatne lub widoczne dla klienta).

## 6. Weryfikacja (wyniki z tej sesji)

| Sprawdzenie | Polecenie | Wynik |
| --- | --- | --- |
| Typy | `npm run typecheck` | czysto |
| Lint | `npm run lint` | czysto |
| Testy jednostkowe (domena) | `npm test` | 41/41 |
| Granice modułów | `npm run check:boundaries` | brak naruszeń (65 modułów) |
| Build produkcyjny | `npm run build` | przechodzi, trasy panelu to częściowy prerender |
| Migracje | `supabase start` | obie zastosowane bez błędów |
| Testy RLS (pgTAP) | `npm run db:test` | 14/14 |
| Testy przypadków użycia na bazie | `npm run test:integration` | 8/8 |

Testy integracyjne pokrywają: tworzenie klienta z normalizacją, błędy walidacji pól, wyszukiwanie (także ze znakami sterującymi filtru), psy i notatki, odrzucenie daty urodzenia z przyszłości, archiwizację i przywracanie, izolację organizacji (także przy podmienionym `organizationId`), widok klienta z dostępem (tylko własne dane i notatki oznaczone jako widoczne) oraz ograniczenia roli `assistant`.

### Czego NIE zweryfikowano
- **Interfejs w przeglądarce:** żadna strona nie została wyrenderowana ani kliknięta. Przechodzą typy i build, ale przepływ logowanie → kreator organizacji → klient → pies nie był przeklikany. To pierwszy krok na następną sesję.
- Logowanie hasłem i odświeżanie sesji w `proxy.ts` na żywym Supabase (testy używają `signInWithPassword` bezpośrednio, ale nie przez Next.js).
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

Uwagi praktyczne (Windows): w PowerShell `npx` bywa kapryśne, użyj `npx.cmd`; długie ścieżki w katalogu tymczasowym psują `git commit -F`, więc plik z opisem trzymaj w krótkiej ścieżce; pakiet `supabase` z npm wymaga zatwierdzenia skryptów instalacyjnych (`npm rebuild supabase`).

## 8. Do zrobienia

Kolejność odpowiada planowi v2.0 (Faza 1 = MVP do płatnego pilotażu).

### Najbliższe (domknięcie tego, co jest)
1. Przeklikać panel w przeglądarce i naprawić znalezione błędy (logowanie, kreator, klienci, psy, notatki).
2. Strona rejestracji trenera i reset hasła (jest tylko logowanie). Okres próbny 14 dni bez karty.
3. Wygenerować typy bazy (`npm run db:types`, zapis w UTF-8 bez BOM) i przepisać repozytoria na typy generowane.
4. Dodać `.gitattributes` (końce linii; Git ostrzega o LF→CRLF), `Dependabot`, przejrzeć `npm audit`.
5. Scalić `feat/clients-dogs` do `main` po przeklikaniu panelu.
6. Strony `error.tsx` i `not-found.tsx` dla panelu, przełącznik organizacji (ciasteczko `dt_org` jest czytane, ale nic go nie ustawia).

### Faza 1: reszta MVP
7. **Zaproszenia** personelu i klientów (przepływ na tabeli `invitations`, magic link, przyjęcie zaproszenia tworzy `organization_members` lub `client_access`).
8. **Panel klienta (PWA):** trasa `(client)` / `/portal`, logowanie magic linkiem, najbliższe treningi, saldo pakietów i należności, zadania domowe, branding trenera, przełączanie między trenerami, manifest PWA.
9. **Kalendarz:** migracja `session_types`, `locations`, `session_series`, `training_sessions`, `session_attendees`, `session_private_notes`; widoki dzień/tydzień/lista; serie cykliczne (rrule); zajęcia grupowe z limitem miejsc; polityka odwołań (próg godzinowy, czy późne odwołanie zużywa zajęcia); obecności; atomowe zakończenie treningu jako funkcja SQL; kanał ICS.
10. **Pakiety:** migracja (`package_templates`, `client_packages`, `package_ledger`, widok salda), przypadki użycia na gotowej domenie `ledger.ts`, ostrzeżenia o kończących się pakietach.
11. **Płatności:** migracja (`charges`, `payments`, `payment_allocations`, widoki), ewidencja wpłat, płatności częściowe i nadpłaty, lista zaległości, na gotowej domenie `charge-status.ts`.
12. **Zadania domowe:** biblioteka ćwiczeń, szablony, przydzielanie, przesyłanie krótkich filmów (upload bezpośrednio do Storage z podpisanym URL, limity według planu, retencja). Wymaga włączenia usługi Storage w lokalnym Supabase.
13. **Powiadomienia e-mail:** procesor `outbox_events` (Vercel Cron), Resend + szablony React Email, przypomnienia o treningach, kończące się pakiety, zaległości. Odbiorcy idempotentni.
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
- Lokalny stos Supabase uruchomiony w tej sesji działa w Dockerze na tym komputerze; zatrzymanie: `npx supabase stop`.
