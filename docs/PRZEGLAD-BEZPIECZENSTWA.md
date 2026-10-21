# Przegląd bezpieczeństwa i jakość minimum (stan na 2026-10-21)

Dokument opisuje, co sprawdziliśmy „z perspektywy atakującego” przed oddaniem aplikacji testerom (etap 10, punkt 1.6 instrukcji demo), co poprawiono, co pilnują testy i czego świadomie jeszcze nie ma. Zmiany: PR `feat/ci-quality-minimum`, migracje `20261016000016_hardening.sql` i `20261016000017_invitation_rate_limit.sql`.

## 1. Co pilnuje CI (GitHub Actions)

`.github/workflows/ci.yml` uruchamia się na każdym pull requeście do `dev` i `main` oraz po scaleniu:

| Zadanie | Kontrole |
| --- | --- |
| `quality` | `typecheck`, `lint`, `npm test`, `check:boundaries`, `npm audit --omit=dev --audit-level=high`, `build` |
| `database` | lokalny Supabase w Dockerze, `supabase test db` (pgTAP: RLS, funkcje, niezmienniki), `npm run test:integration` (przypadki użycia na prawdziwej bazie z pocztą Mailpit) |

Obok działa `claude-review.yml` (review z komentarzem). Dependabot (`.github/dependabot.yml`) co tydzień proponuje aktualizacje npm i akcji jako PR-y do `dev`. **Do zrobienia przez właściciela po pierwszym uruchomieniu CI:** w ustawieniach repozytorium (Branch protection / Rulesets dla `dev` i `main`) ustaw wymagane kontrole „Kod (typy, lint, testy, build)” oraz „Baza (migracje, pgTAP, testy integracyjne)”, żeby scalenie z czerwonym CI było niemożliwe.

## 2. Przegląd RLS i uprawnień bazy

Sprawdzone zapytaniami do katalogu bazy; wyniki są teraz testem `supabase/tests/database/security_invariants.test.sql` (13 reguł obowiązujących każdą obecną i przyszłą tabelę i funkcję).

| Obszar | Wynik |
| --- | --- |
| RLS | Włączone na wszystkich 35 tabelach schematu `public`; nowa tabela bez RLS od razu zaczerwieni test. |
| Widoki | 4 widoki (`v_*`) działają jako `security_invoker`, więc nie omijają RLS tabel źródłowych. |
| Rola `anon` | Brak polityk dla `anon` i `public`. Wołać może tylko 3 funkcje definer (`check_signup_allowed`, `lookup_invitation`, `lookup_member_invitation`; strony zaproszeń i rejestracji). Po zmianie nie ma też żadnych uprawnień do tabel. |
| Funkcje `security definer` | Wszystkie (64) mają pusty `search_path`. Każda, którą wolno wołać zalogowanym, sprawdza tożsamość (`auth.uid()`) lub rolę w organizacji (poza trzema publicznymi wyszukiwarkami). |
| Funkcje zadań w tle i panelu właściciela | `admin_*`, `claim_outbox_events`, `enqueue_daily_notification_events`, `expire_organization_access` wołać może tylko `service_role`. |
| Klucz `service_role` | Używany wyłącznie w kontekście panelu właściciela (po sprawdzeniu `platform_admins`), w procesorze outbox, pętli deweloperskiej i skrypcie admina; nigdzie w kodzie interfejsu. |
| Schemat `app` (funkcje pomocnicze RLS) | Niewystawiony przez API (`schemas = ["public", "graphql_public"]`). |
| Zmienne `NEXT_PUBLIC_*` | Tylko adres i klucz anon Supabase, adres strony, e-mail wsparcia i publiczny klucz VAPID. Żaden sekret. |
| `dangerouslySetInnerHTML` | Jedno użycie: kod QR zaproszenia (SVG generowany na serwerze z naszego adresu), bez danych użytkownika. |

### Poprawione w migracji 0016

- Domyślne uprawnienia Supabase dawały `anon` i `authenticated` więcej, niż trzeba. Zabrano: wszystkie uprawnienia `anon` do tabel i sekwencji; `TRUNCATE` (RLS go nie obejmuje), `REFERENCES` i `TRIGGER` roli `authenticated`; zapis do rejestru `package_ledger` (zapisują go wyłącznie funkcje definer); dostęp zalogowanych do `beta_codes`, `platform_settings`, `organization_admin_info` (czyta je tylko `service_role` w panelu właściciela). PostgREST i tak nie udostępnia `TRUNCATE`, więc nic nie było wykorzystywalne przez API, ale obrona w głąb nie zależy już od jednej warstwy.
- Domyślne uprawnienia dla nowych obiektów zawężone tak samo (nowa funkcja nie jest od razu wołalna przez `anon`; trzeba to nadać jawnie i dopisać do testu).
- Limit zgłoszeń opinii w bazie (5 na 10 minut i 30 na dobę na osobę; wyjątek `DT017`, komunikat „Zbyt wiele zgłoszeń…”).

## 3. Limity i ochrona przed nadużyciami

| Co | Jak |
| --- | --- |
| Zgadywanie kodów zaproszeń | limit prób w bazie (`DT003`, od etapu zaproszeń) |
| Zamknięta rejestracja | kod beta albo zaproszenie, sprawdzane w bazie także przy bezpośrednim wywołaniu API (`DT016`) |
| Opinie | limit w bazie (powyżej) |
| Zaproszenia | najwyżej 200 na szkołę na dobę (migracja 0017, `DT017`); wysyłka e-maila z istniejącego zaproszenia nie ma jeszcze własnego limitu, więc na produkcji ustaw limity dostawcy poczty (Resend) i Supabase Auth |
| Import klientów | do 500 wierszy i 1 MB, rola trenera, atomowy zapis; limit rozmiaru akcji serwerowych ustawiony jawnie na 2 MB (`serverActions.bodySizeLimit`), bo domyślny 1 MB nie mieścił pliku z narzutem formularza |
| Trasa crona (`/api/cron/outbox`) | wymaga `CRON_SECRET` |
| Nagłówki odpowiedzi | `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, CSP w zakresie `frame-ancestors`, `base-uri`, `object-src`, `form-action`, HSTS na produkcji; wyłączony `X-Powered-By`; `/sw.js` bez pamięci podręcznej |

### Logowanie, rejestracja, reset hasła: limity Supabase Auth

Aplikacja nie ma własnego limitera żądań HTTP: na platformie bezserwerowej licznik w pamięci procesu nie ma sensu (każde wywołanie może trafić do innej instancji), a logowanie i reset hasła obsługuje Supabase Auth, który ma własne limity. **Przy wdrożeniu (Supabase → Authentication → Rate Limits) sprawdź i ustaw:** logowania i rejestracje na IP (domyślnie 30 / 5 min; dla testów 10 osób wystarczy), wysyłkę e-maili (po podłączeniu własnego SMTP podnieś ponad domyślne 2/h), weryfikacje tokenów, odświeżanie. Włącz CAPTCHA (Turnstile) przy rejestracji dopiero przy otwarciu rejestracji dla wszystkich (dziś rejestracja jest zamknięta kodami).

## 4. Strony błędów

`src/app/error.tsx` oraz osobne granice w `/app`, `/portal` i `/admin` (nawigacja zostaje, jest „Spróbuj ponownie” i wejście na stronę główną), `not-found.tsx` (404 bez zdradzania, czy strona nie istnieje, czy brak dostępu; tak samo `/admin` dla osoby spoza listy) i `global-error.tsx` (błąd w głównym układzie, dwujęzyczny bez zależności od tłumaczeń). Treść błędu nie jest pokazywana, tylko kod zgłoszenia (`digest`) do wyszukania w logach serwera; komunikat prosi o użycie „Zgłoś problem lub pomysł”. Sprawdzone w przeglądarce (404, błąd serwera w `en`).

## 5. Zależności (`npm audit`)

- Produkcyjne: **0 podatności** (`npm audit --omit=dev`), kontrolowane w CI na poziomie `high`.
- Deweloperskie: 5 ostrzeżeń wysokiej wagi w łańcuchu `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces` (ReDoS „stack exhaustion” w `braces`). Dotyczy wyłącznie narzędzia lint uruchamianego na naszych plikach, nie trafia do aplikacji ani na serwer. `npm audit fix --force` proponuje **obniżenie** do `eslint-config-next@14` (zmiana łamiąca, w złą stronę), więc świadomie czekamy na poprawkę w górze łańcucha (Dependabot zgłosi aktualizację).

## 6. Świadomie jeszcze nie ma (kolejne kroki)

- **Pełna CSP** (`script-src` z nonce): wymaga osobnej pracy przy Cache Components i skryptach inline Next.js; dziś blokujemy ramki, wtyczki i podmianę `base`/formularzy.
- **Własne limity HTTP** (np. Upstash/Vercel WAF) dla tras publicznych: do rozważenia przy publicznym starcie.
- **Sentry i monitor dostępności** (punkt 1.6 instrukcji demo): wymagają kont, po stronie właściciela.
- **Test penetracyjny z zewnątrz** i przegląd polityk RLS przez drugą osobę przed publicznym startem.
