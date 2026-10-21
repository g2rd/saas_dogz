# ADR 0012: panel właściciela platformy, status szkoły i zamknięta rejestracja

Status: przyjęta, 2026-10-21.

## Kontekst

Aplikacja ma trafić do około 10 trenerów na kilka tygodni testów, a później do płacących klientów. Właściciel musi widzieć, kto i jak
używa aplikacji (ile szkół, trenerów, klientów, zajęć), móc zablokować dostęp (koniec testów, brak płatności) i kontrolować, kto może
założyć konto trenera. Wymaga tego zarówno wersja demo, jak i późniejsza sprzedaż (rozliczenia ustawią te same pola).

## Decyzje

1. **Właściciel platformy to zwykłe konto w tej samej aplikacji z wpisem w `platform_admins`** (rola nadawana wyłącznie przez
   `service_role`: `npm run admin:grant -- adres@example.pl` albo SQL). Logowanie tym samym e-mailem i hasłem co wszyscy, panel pod `/admin`
   (grupa tras `(admin)`, jedyna z dostępem do klienta `service_role` poza zadaniami w tle). Osoba spoza `platform_admins` dostaje 404.
   Strażnik `requireAdmin()` sprawdza wpis, a **na produkcji domyślnie także weryfikację dwuetapową TOTP** (sesja aal2; strona `/admin/mfa`
   do konfiguracji i podawania kodu). `ADMIN_REQUIRE_MFA=0` wyłącza to tylko świadomie; lokalnie domyślnie wyłączone, bo wymaga włączonego
   MFA w Supabase (w `supabase/config.toml` sekcja `[auth.mfa.totp]`). Zalecane osobne konto właściciela, nie konto trenera.
2. **Status szkoły** w `organizations.status`: `trial` (domyślny dla nowych), `active`, `read_only`, `suspended` (+ `archived`), z
   `access_until`, `status_reason` i historią w `audit_log`. Zmiany tylko przez `admin_set_organization_status` (service_role,
   sprawdza `platform_admins`, wpis do audytu, zdarzenie `organization.status_changed` z e-mailem do właścicieli szkoły). Trigger
   `organizations_protect_admin_columns` nie pozwala trenerowi zmienić tych kolumn przez API.
3. **Egzekwowanie w bazie, nie tylko w UI:**
   - `suspended`/`archived`: `app.is_org_member`, `app.has_org_role` i wszystkie funkcje RLS klienta (`is_client_of_org`,
     `client_ids_for_user`, `client_can_see_*`) zwracają fałsz, więc trener i klienci nie widzą żadnych danych (także przez bezpośrednie API);
   - `read_only` i zawieszona: wyzwalacz `app.enforce_org_writable` na wszystkich tabelach danych szkoły odrzuca zapisy (`DT015`), także z
     funkcji `security definer`; zadania w tle i panel właściciela (`service_role`, brak `auth.uid()`) nie podlegają blokadzie;
   - dane szkoły zostają w bazie (żadnego usuwania przy blokadzie).
4. **Komunikat zamiast pustki:** własne członkostwo i wiersz szkoły pozostają widoczne po zawieszeniu (polityki `organization_members_select`
   i `organizations_select` używają `app.is_member_of` / `app.has_client_access_to`, niezależnych od statusu). Dzięki temu aplikacja nie
   uznaje zawieszonego trenera za „bez organizacji” (kreator nowej szkoły), tylko kieruje na `/suspended` (powód, kontakt z
   `NEXT_PUBLIC_SUPPORT_EMAIL`); klient widzi „Szkoła chwilowo niedostępna”. Kontekst żądania (`RequestContext.access`) niesie status,
   `authorize` odrzuca zapisy w trybie `read_only` z czytelnym komunikatem (druga warstwa po wyzwalaczu), a nad panelem trenera jest pasek
   „tylko do odczytu” albo „dostęp kończy się za N dni”.
5. **Automat końca dostępu:** `expire_organization_access()` (wołana przy każdym przebiegu crona outbox) przestawia `trial`/`active` z
   upłyniętym `access_until` w `read_only`, z wpisem w audycie i e-mailem do właścicieli. Wiadomość „dostęp kończy się za 7 dni”
   jest widoczna jako pasek w aplikacji; osobny e-mail przypominający jest do zrobienia.
6. **Zamknięta rejestracja** (`platform_settings.signup_mode` = `open`/`closed`, domyślnie `open`, żeby nie psuć lokalnego developmentu i
   testów; właściciel zamyka ją w `/admin/codes`, panel ostrzega czerwonym paskiem, gdy jest otwarta). Publiczny punkt rejestracji Supabase
   jest dostępny z kluczem `anon`, więc blokadę wymusza **wyzwalacz `a_enforce_signup_gate` na `auth.users`**: konto powstaje tylko z
   ważnym kodem beta (`beta_codes`, tylko skrót HMAC, limit użyć, termin, unieważnianie; użycie zostawia `beta_code_id` w
   `raw_app_meta_data`) albo z dowodem ważnego zaproszenia (skrót tokenu lub kodu z `invitations`: klienci i zespół). Aplikacja sprawdza to
   wcześniej funkcją `check_signup_allowed` (publiczna, zwraca tylko powód), żeby pokazać zrozumiały komunikat. Jawnego kodu nie da się
   odczytać po utworzeniu.
7. **Panel `/admin`** pokazuje wyłącznie metryki i dane kontaktowe właściciela szkoły, nie dane klientów: `admin_organizations_overview()`
   zwraca na szkołę liczbę personelu (i aktywnych w 7 dni), klientów, klientów z dostępem do panelu, zajęć (7 i 30 dni), ostatnie logowanie,
   ostatnią aktywność, powiadomienia i urządzenia push; kafelki podsumowania (`summarize`), filtr, karta szkoły ze zmianą statusu,
   przedłużeniem dostępu, notatkami (osobna tabela `organization_admin_info` bez polityk) i historią zmian, zakładka kodów i trybu
   rejestracji.

## Konsekwencje

- Rozliczenia (Stripe) w przyszłości ustawiają te same pola (`status`, `access_until`); nie trzeba zmieniać mechanizmu blokady.
- Zawieszenie odcina też klientów szkoły (decyzja domyślna; łagodniejszy krok to `read_only`).
- Trigger na `auth.users` jest globalny: testy integracyjne zmieniające tryb rejestracji przywracają go w `finally`.
- Jeden pełny odczyt `admin_organizations_overview()` na każdą stronę panelu: wystarczy do kilkuset szkół; przy większej liczbie trzeba
  stronicowania i materializacji metryk.
- Nie zrobiono: osobnych ról wewnętrznych (wsparcie tylko do odczytu), personifikacji, e-maila „dostęp kończy się za 7 dni”, zapisu wejść do
  panelu w dzienniku (tylko zmiany).
- Lokalnie MFA w panelu przetestowano w przeglądarce (konfiguracja kodem TOTP i wejście po weryfikacji); test ponownego logowania na
  nowej sesji i środowiska zdalnego zostaje do wykonania przy wdrożeniu.
