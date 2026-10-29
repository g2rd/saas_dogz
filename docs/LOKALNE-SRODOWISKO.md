# Środowisko lokalne: uruchomienie krok po kroku i testy

Ta instrukcja prowadzi od czystego komputera do działającej aplikacji, danych testowych i pełnego zestawu testów. Polecenia są dla **PowerShella na Windowsie**
(`npm.cmd` i `npx.cmd`, bo skrypty `.ps1` bywają zablokowane). Szybki skrót jest w [README.md](../README.md), stan prac w [ARCHITEKTURA-I-STAN-PRAC.md](ARCHITEKTURA-I-STAN-PRAC.md).

`npm run dev` **nie wystarczy**: aplikacja potrzebuje lokalnej bazy i poczty (Supabase w Dockerze), pliku `.env.local` z kluczami i zastosowanych migracji.

## 0. Wymagania (jednorazowo)

| Co | Uwagi |
| --- | --- |
| Node.js 24 i npm | `node -v` |
| Docker Desktop | **uruchomiony** (ikona wieloryba bez ostrzeżeń); pierwszy start Supabase pobiera obrazy (kilka minut) |
| Git | repozytorium: `https://github.com/g2rd/saas_dogz`, gałąź robocza `dev` |
| Microsoft Edge | testy E2E lokalnie używają zainstalowanej Edge (bez pobierania przeglądarki) |

## 1. Uruchomienie środowiska (kolejność ma znaczenie)

```powershell
# 1. Zależności
npm.cmd install

# 2. Lokalny Supabase: baza, Auth, API, Mailpit (poczta). Wymaga uruchomionego Dockera.
npm.cmd run db:start

# 3. Klucze lokalnego Supabase: skopiuj ANON_KEY i SERVICE_ROLE_KEY z wyniku
npx.cmd supabase status -o env
```

**4. Plik `.env.local`**: skopiuj `.env.example` do `.env.local` i uzupełnij:

| Zmienna | Wartość lokalnie |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `ANON_KEY` z kroku 3 |
| `SUPABASE_SERVICE_ROLE_KEY` | `SERVICE_ROLE_KEY` z kroku 3 (tylko lokalnie, tajny) |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` (adres w linkach z e-maili i w kodach QR) |
| `INVITATION_HASH_SECRET` | dowolny ciąg min. 24 znaki |
| `CRON_SECRET` | dowolny ciąg min. 24 znaki (potrzebny do `npm run outbox:run`) |
| `ENABLED_LOCALES` | `pl,en` |

Losowy sekret: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Pozostałe zmienne (VAPID, Resend, Sentry, dane operatora) są opcjonalne: bez nich kanały działają w trybie podglądu, a e-maile trafiają do Mailpit.

```powershell
# 5. Migracje (KASUJE dane lokalne; po każdej zmianie gałęzi z nowymi migracjami powtórz)
npm.cmd run db:reset

# 6. Konta i dane testowe (tylko lokalnie): trener, klientka, drugi trener, szkoły, klienci, psy, pakiet, zajęcia
npm.cmd run seed:local

# 7. Aplikacja (przetwarza też powiadomienia co 10 s)
npm.cmd run dev
```

Adresy: aplikacja `http://localhost:3000`, **poczta Mailpit `http://127.0.0.1:54324`** (wszystkie e-maile aplikacji, w tym zaproszenia i powiadomienia).

### Konta testowe (zawsze te same; `npm run seed:local` odtwarza je jednym poleceniem)

| Rola | E-mail | Hasło | Panel |
| --- | --- | --- | --- |
| Trener, właściciel szkoły „Szkoła Łapa” (3 klientów, 2 psy, pakiet, zajęcia) i właściciel platformy | `trener@example.test` | `Dev-Haslo-12345` | `/app`, `/admin` (z „Więcej”) |
| Klientka Anna Kowalska (kartoteka w „Szkole Łapa”) | `anna@example.pl` | `Klient-Haslo-2026` | `/portal` |
| Drugi trener, osobna szkoła „Szkoła Kontrolna” (1 klient: Zenon Kontrolny), do sprawdzania izolacji danych | `seedcheck@example.test` | `Seed-Check-Pass-1` | `/app` |

Polecenie `npm run seed:local` jest **bezpieczne do wielokrotnego uruchamiania**: istniejącym kontom ustawia powyższe hasło, danych nie dubluje, każdemu kontu zapisuje zgodę na bieżący regulamin (żeby nie trafiało najpierw na ekran ponownej zgody) i odmawia pracy na zdalnym Supabase. Zrób je po każdym `db:reset` albo gdy zalogowanie przestaje działać.

Inne konta zakładasz sam w aplikacji (zaproszenie klienta, link szkoły, rejestracja); testy E2E i integracyjne zakładają własne losowe konta i ich nie usuwają ani nie zmieniają Twoich.

### Uwaga: `db:reset` KASUJE wszystkie dane lokalne (także Twoje własne konta i klientów)

Zanim go uruchomisz, a także przed testami pgTAP po zmianie gałęzi, zrób kopię:

```powershell
npm.cmd run db:backup                              # zapisuje backups/dane-RRRRMMDD-GGMMSS.sql (folder poza gitem)
npm.cmd run db:reset                               # czysty schemat z migracji
npm.cmd run db:restore -- backups/dane-....sql     # wczytuje Twoje dane z kopii
npm.cmd run seed:local                             # (opcjonalnie) dosypuje konta testowe, jeśli ich brakuje
```

Kopia obejmuje dane (konta, szkoły, klienci, pakiety...), a schemat zakłada `db:reset` z migracji. Odtwarzanie dobrze działa, gdy kopia pochodzi z tej samej wersji migracji; po nowszych migracjach najpierw zrób kopię na starej gałęzi, a odtwórz po `db:reset` na tej samej.

### Przydatne polecenia na co dzień

| Cel | Polecenie |
| --- | --- |
| Zatrzymać / uruchomić bazę | `npx.cmd supabase stop` / `npm.cmd run db:start` |
| Zacząć od zera (po kopii!) | `npm.cmd run db:backup`, `npm.cmd run db:reset`, `npm.cmd run seed:local` |
| Przetworzyć powiadomienia od razu | `npm.cmd run outbox:run` (wymaga działającego `dev`) |
| Zmienić stan w bazie ręcznie | `docker exec supabase_db_dogtrainer psql -U postgres -c "..."` |
| Po zmianie migracji odświeżyć typy | `npm.cmd run db:types` |

## 2. Testy automatyczne (kolejność jak w CI)

Wymagają działającego Supabase (krok 2) i zastosowanych migracji (krok 5). **Zatrzymaj `npm run dev` przed `test:integration` i `e2e`**: pętla powiadomień z `dev` przetwarza zdarzenia testów i je zakłóca.

```powershell
npm.cmd run typecheck          # typy
npm.cmd run lint
npm.cmd test                   # jednostkowe (domena, i18n, service worker)
npm.cmd run check:boundaries   # granice modułów
npm.cmd run db:test            # pgTAP: RLS i funkcje SQL
npm.cmd run test:integration   # przypadki użycia na prawdziwej bazie
npm.cmd run e2e                # przeglądarka: buduje aplikację i uruchamia ją na porcie 3100 (ok. 2 min)
npm.cmd run build              # build produkcyjny
```

`npm run e2e:ui` otwiera podgląd interaktywny, a `npx.cmd playwright test e2e/history.spec.ts` uruchamia pojedynczy plik. `.env.local` nie jest potrzebny testom E2E (serwer testowy dostaje własne zmienne).

## 3. Scenariusze ręczne nowych funkcji

Każdy scenariusz zajmuje kilka minut; zalecany widok telefonu w przeglądarce (F12 → tryb urządzenia), drugie okno incognito dla klienta.

1. **Ponowna zgoda:** zmień `LEGAL_VERSION` w `src/shared/legal.ts` na późniejszą datę, zrestartuj `dev`. Po zalogowaniu pojawia się „Zaktualizowaliśmy regulamin” (także dla `/portal`), po zaznaczeniu zgody wejście do panelu. Przywróć datę.
2. **E-mail końca dostępu:** `docker exec supabase_db_dogtrainer psql -U postgres -c "update organizations set status='trial', access_until=now()+interval '5 days'"`, potem `npm.cmd run outbox:run`: w Mailpit „Dostęp do konta kończy się wkrótce… za 7 dni”. Ustaw `now()+interval '12 hours'`: drugi e-mail „za 1 dzień”.
3. **Wygasła sesja:** po zalogowaniu zepsuj wartość ciasteczka `sb-…-auth-token` (DevTools → Application) i odśwież stronę albo wyślij formularz: logowanie z komunikatem „Sesja wygasła”. Podstrony „Więcej” (Zespół, Powiadomienia, Zgłoś problem) mają link „← Więcej”.
4. **Region i telefony:** Więcej → Język i region → Wielka Brytania; nowy klient z telefonem `07911 123456` zapisze się jako `+447911123456`; `+48 600 100 200` zachowa polski prefiks; `123` daje błąd. „Automatycznie” wraca do Polski.
5. **Monitoring:** `http://localhost:3000/api/health` zwraca `{"status":"ok",…}`; przy zatrzymanym Supabase 503. Sentry bez konta pomiń (`SENTRY_DSN` puste = nic nie jest wysyłane).
6. **Link i QR szkoły:** Więcej → Prośby o dołączenie → Utwórz link szkoły; w incognito otwórz adres, załóż konto i wyślij prośbę; trener dostaje powiadomienie i e-mail, akceptuje (nowa kartoteka lub połączenie z istniejącą), klient dostaje e-mail i wchodzi do `/portal`; „Wygeneruj nowy link” unieważnia stary.
7. **Historia zmian:** zapisz wpłatę, sprzedaj pakiet, zakończ zajęcia; Więcej → Historia zmian pokazuje wpisy z opisem i autorem; „Cofnij” przy wpłacie, pakiecie i zajęciach (pakiet już użyty: baza odmawia, komunikat pod wpisem).
8. **Kafelek chętnych:** jako klient zapisz się na listę chętnych (`/portal/sessions`); na pulpicie trenera kafelek „1 chętny na wolny termin”; po ogłoszeniu terminu i zgłoszeniu „Biorę” kafelek robi się żółty.
9. **Pseudo-lokalizacja (układ):** uruchom z `ENABLE_PSEUDO_LOCALE=1` i dodaj ciasteczko `dt_pseudo=1`: teksty są wydłużone i w `[ ]`, strony nie powinny przewijać się w poziomie.

## 4. Typowe problemy

| Objaw | Co zrobić |
| --- | --- |
| `failed to connect to the docker API` | Uruchom Docker Desktop i poczekaj, aż będzie gotowy |
| `npm : File ... cannot be loaded because running scripts is disabled` | Używaj `npm.cmd` i `npx.cmd` |
| Strona zgłasza błąd bazy lub brakującą kolumnę | Migracje nieaktualne po zmianie gałęzi: `npm.cmd run db:backup`, `npm.cmd run db:reset`, `npm.cmd run seed:local` |
| Nie mogę się zalogować na konto testowe | `npm.cmd run seed:local` (ustawia znane hasła i odtwarza brakujące konta) |
| `seed:dev` / `seed:local` odmawia | Skrypt działa tylko na lokalnym Supabase (adres `127.0.0.1`/`localhost` w `.env.local`) |
| `outbox:run`: brak `CRON_SECRET` | Dopisz sekret do `.env.local` i zrestartuj `dev` |
| Stary wygląd (CSS) po zmianie gałęzi | Usuń folder `.next/dev` i zrestartuj `dev` |
| Testy integracyjne lub E2E padają „losowo” | Zatrzymaj `npm run dev` (pętla powiadomień) i uruchom ponownie; dwa serwery `next dev` w jednym katalogu też przeszkadzają |
| Port 3100 zajęty (E2E) | Zamknij poprzedni serwer testowy (`netstat -ano | findstr 3100`) |
| pgTAP: lista funkcji publicznych się nie zgadza | Baza ma migracje z innej gałęzi: kopia (`db:backup`), `db:reset`, potem `seed:local` |
| Test na telefonie, push, instalacja PWA | Wymaga HTTPS: sekcja „Test na telefonie bez domeny” w [ARCHITEKTURA-I-STAN-PRAC.md](ARCHITEKTURA-I-STAN-PRAC.md) |
