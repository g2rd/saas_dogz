# Staging: pierwsze środowisko zdalne krok po kroku

> **Decyzja właściciela (2026-10-29): nie będzie testerów, testy odbywają się lokalnie, więc staging nie jest potrzebny i nie jest planowany.** Ten dokument zostaje jako instrukcja wdrożenia środowiska zdalnego (także produkcyjnego), gdyby kiedyś było potrzebne.

Stan na 2026-10-21. Instrukcja dla właściciela (🧑 = robisz Ty w panelach usług, 🤖 = jest już w repozytorium). Staging to pierwsze środowisko w chmurze: tu przeklikasz całą aplikację na prawdziwym HTTPS i telefonie, a po teście dymnym zapraszasz do niego pierwszych testerów (plan testów, rytm i metryki: [WDROZENIE-DEMO-10-TESTEROW.md](WDROZENIE-DEMO-10-TESTEROW.md)). Przy pełnej produkcji ([WDROZENIE-PELNE-PRODUKCJA.md](WDROZENIE-PELNE-PRODUKCJA.md)) powtarzasz te same kroki na drugim zestawie kont.

**Czas:** ok. 2-3 godziny przy gotowych kontach (DNS i weryfikacja domeny w Resend mogą potrwać do doby).
**Koszt:** zależy od planów, patrz „Plany: co jest potrzebne” poniżej. Można zacząć za 0 zł (Supabase Free + Vercel Hobby + cron w bazie); przed prawdziwymi danymi testerów zalecany jest co najmniej Supabase Pro (ok. 25 USD/mies.), a Vercel Pro (ok. 20 USD/mies. za użytkownika) przy zapraszaniu osób spoza Twojego otoczenia.

## Co jest w repozytorium (🤖)

| Plik | Do czego |
| --- | --- |
| `vercel.json` | Region funkcji Frankfurt (`fra1`). Celowo **bez** crona: harmonogram idzie z bazy (`supabase/cron/outbox-cron.sql`), więc działa też na planie Vercel Hobby |
| `supabase/cron/outbox-cron.sql` | Cron powiadomień w bazie (pg_cron + pg_net + Vault), co minutę wywołuje `/api/cron/outbox`; działa na każdym planie Supabase. Sprawdzony lokalnie |
| `npm run env:check -- --file .env.staging` | Sprawdza zmienne środowiskowe przed wklejeniem do Vercel (format, długość sekretów, klucze demo, adresy https); **nie wypisuje wartości** |
| `npm run smoke -- https://adres` | Test dymny wdrożenia: strony publiczne, PWA, nagłówki bezpieczeństwa, przekierowania, zabezpieczenie crona |
| `supabase/migrations/` | Migracje 0001-0018 (schemat, RLS, funkcje) |
| `supabase/templates/` | Dwujęzyczne wiadomości Supabase Auth (potwierdzenie konta, reset hasła) do wklejenia w panelu (krok 1.6) |
| `.github/workflows/ci.yml` | CI (po scaleniu PR-ów z CI) |

## Plany: co jest potrzebne, a co nie

Stan cenników sprawdzony 2026-10-21 w dokumentacji Supabase i Vercel (ceny i limity zmieniają się, zweryfikuj przy zakładaniu kont).

| Usługa i plan | Co daje i czego brakuje | Wniosek |
| --- | --- | --- |
| **Supabase Free** (0 USD) | Wszystko, czego używa aplikacja: baza 500 MB, 50 tys. aktywnych użytkowników, własny SMTP, podstawowe MFA (TOTP dla `/admin`). **Brak kopii zapasowych. Projekt jest wstrzymywany po tygodniu bez aktywności** (dane zostają, trzeba go wznowić ręcznie). Limit 2 aktywnych projektów | Wystarczy na staging dla Ciebie i garstki znajomych |
| **Supabase Pro** (od 25 USD/mies.) | Codzienne kopie (7 dni), brak wstrzymywania, 8 GB, wsparcie e-mail | **Potrzebny, zanim wpuścisz testerów z prawdziwymi danymi klientów**: bez kopii utrata danych jest nieodwracalna, a wstrzymany projekt wyłącza aplikację |
| **Vercel Hobby** (0 USD) | Hosting aplikacji i własna domena z HTTPS, wystarczające limity. Zgodnie z regulaminem Vercel **tylko do użytku osobistego i niekomercyjnego**. Cron Vercel tylko raz dziennie (wdrożenie z częstszym harmonogramem jest odrzucane) | Wystarczy na staging do własnych prób. Cron nie jest problemem: harmonogram jest w bazie (krok 5a) |
| **Vercel Pro** (20 USD/mies. za użytkownika) | Użytek komercyjny, cron co minutę, dłuższe logi, wsparcie | Potrzebny, gdy staging obsługuje obcych testerów w ramach przedsięwzięcia, które ma się stać płatnym produktem (ocena „komercyjności” należy do Vercel, przy wątpliwości wybierz Pro) |
| Resend, Sentry, UptimeRobot | Darmowe plany wystarczają na start | Bez opłat |

**Rekomendowana ścieżka:** (1) staging dla siebie: Supabase Free + Vercel Hobby, 0 zł, cron z bazy; (2) przed pierwszym obcym testerem: Supabase Pro i Vercel Pro (ok. 45 USD/mies. razem). Przejście z Free na Pro nie wymaga zmian w kodzie ani migracji danych (ten sam projekt, zmiana planu w panelu). Na Free rób własne kopie przed ważnymi zmianami (`npx.cmd supabase db dump --linked -f kopia.sql`; wymaga Dockera, nie testowane przeze mnie na zdalnym projekcie) i otwieraj projekt co kilka dni, żeby nie został wstrzymany.

## Krok 0. Decyzje (5 min)

1. **Adres:** subdomena aplikacji, np. `staging.twojadomena.pl` (na produkcji później `app.twojadomena.pl`).
2. **Plany:** zdecyduj według sekcji „Plany” powyżej (Free/Hobby na próby własne, Pro przed obcymi testerami). Kod i instrukcja są takie same dla obu wariantów; cron idzie z bazy (krok 5a), więc plan Vercel go nie ogranicza.
3. **Gałąź wdrożeń:** na staging ustaw w Vercel gałąź produkcyjną **`dev`** (tak działa przepływ z `CLAUDE.md`: `main` zmienia się tylko po Twojej zgodzie). Przed zaproszeniem testerów możesz przełączyć ją na `main` po scaleniu `dev` do `main`.
4. **Wymaganie wstępne:** wszystkie PR-y (etapy 4, 5, opinie i import, CI, regulamin i zgody, ten) scalone do `dev`; lokalnie `git checkout dev && git pull`.

## Krok 1. Supabase (🧑, 30 min)

1. Nowy projekt: plan **Pro**, region **Central EU (Frankfurt)**, silne hasło bazy (menedżer haseł). Zapisz: `Project URL`, klucz `anon` (publiczny), klucz `service_role` (**tajny**), `project ref`.
2. Połącz CLI z projektem (PowerShell, w katalogu repozytorium):
   ```powershell
   npx.cmd supabase login
   npx.cmd supabase link --project-ref <ref>
   ```
3. Wgraj migracje (pokaże listę oczekujących, zatwierdź): `npx.cmd supabase db push`. ⚠️ Nigdy nie uruchamiaj tu `db reset`, `seed:dev` ani `seed:demo`. ⚠️ **Nie używaj `supabase config push`**: wgrałby lokalne ustawienia Auth (adres `localhost`, brak potwierdzenia e-maila) na zdalny projekt.
4. **Authentication → URL Configuration:** `Site URL` = `https://staging.twojadomena.pl`; w `Redirect URLs` dodaj `https://staging.twojadomena.pl/**`.
5. **Authentication → Providers → Email:** włącz „Confirm email”. Minimalna długość hasła 8.
6. **Authentication → Email Templates:** otwórz „Confirm signup” i „Reset Password”, wklej treść z `supabase/templates/confirmation.html` i `supabase/templates/recovery.html` (wersje pl/en wybierane po języku z rejestracji) oraz tematy: „Potwierdź konto w DogTrainer / Confirm your DogTrainer account” i „Nowe hasło w DogTrainer / Reset your DogTrainer password”. Bez tego e-maile Supabase przyjdą po angielsku w domyślnym wzorze.
7. **Authentication → SMTP Settings:** własny SMTP z Resend (krok 2), inaczej domyślny serwer Supabase ma kilka e-maili na godzinę i reset hasła nie dojdzie.
8. **Authentication → Rate Limits:** zostaw domyślne (logowania i rejestracje 30 na 5 minut na IP wystarczą dla 10 testerów); po podłączeniu własnego SMTP podnieś limit wysyłki e-maili.
9. **Authentication → Multi-Factor:** TOTP jest włączony domyślnie (potrzebny panelowi `/admin`).
10. **Database → Backups:** sprawdź, że dzienne kopie są włączone (plan Pro).

## Krok 2. Resend i DNS (🧑, 20 min + oczekiwanie)

1. W Resend dodaj domenę (region UE, jeśli dostępny), dopisz w DNS wskazane rekordy (SPF, DKIM) oraz `DMARC` (`v=DMARC1; p=none; rua=mailto:pomoc@twojadomena.pl`), poczekaj na status „Verified”.
2. Utwórz klucz API z uprawnieniem wysyłania → `RESEND_API_KEY` (zaczyna się od `re_`). Nadawca: `EMAIL_FROM="DogTrainer <powiadomienia@twojadomena.pl>"`.
3. Hasło SMTP w Supabase (krok 1.7): host `smtp.resend.com`, użytkownik `resend`, hasło = klucz API; nadawca jak wyżej (nazwy pól i porty sprawdź w dokumentacji Resend).

## Krok 3. Sekrety (🧑, 5 min)

Wygeneruj lokalnie, zapisz w menedżerze haseł (nie w czacie ani repozytorium):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # INVITATION_HASH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # CRON_SECRET (drugie wywołanie = inna wartość)
npx.cmd web-push generate-vapid-keys                                              # NEXT_PUBLIC_VAPID_PUBLIC_KEY i VAPID_PRIVATE_KEY (nowa para, nie lokalna)
```

## Krok 4. Plik `.env.staging` i kontrola (🧑, 10 min)

1. Skopiuj `.env.example` do `.env.staging` (plik jest ignorowany przez git) i uzupełnij:

| Zmienna | Wartość |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | z kroku 1 |
| `NEXT_PUBLIC_SITE_URL` | `https://staging.twojadomena.pl` (bez ukośnika i ścieżki) |
| `INVITATION_HASH_SECRET`, `CRON_SECRET` | z kroku 3 (min. 24 znaki; zmiana `INVITATION_HASH_SECRET` unieważnia oczekujące zaproszenia) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | z kroku 3; temat `mailto:pomoc@twojadomena.pl` |
| `RESEND_API_KEY`, `EMAIL_FROM` | z kroku 2 |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | skrzynka kontaktowa (kontakt w regulaminie i na ekranie zawieszenia) |
| `NEXT_PUBLIC_OPERATOR_NAME`, `NEXT_PUBLIC_OPERATOR_ADDRESS` | dane operatora w regulaminie i polityce prywatności |
| `ENABLED_LOCALES` | `pl,en` |
| `ADMIN_REQUIRE_MFA` | zostaw puste (na wdrożeniu panel wymaga weryfikacji dwuetapowej); `0` tylko, gdy nie możesz jej skonfigurować |

   Nie ustawiaj `DEV_TUNNEL`, `OUTBOX_DEV_POLL`, `MAILPIT_URL` ani `SUPABASE_TEST_*` (kontrola je odrzuci).
2. Uruchom kontrolę i popraw wszystko, co pokaże jako `BŁĄD` (ostrzeżenia o danych operatora uzupełnij przed zaproszeniem testerów):
   ```powershell
   npm.cmd run env:check -- --file .env.staging
   ```

## Krok 5. Vercel (🧑, 20 min)

1. Add New → Project → zaimportuj repozytorium `g2rd/saas_dogz`. Framework: Next.js (wykryty), Node 24.x.
2. **Settings → Git → Production Branch:** `dev` (krok 0.3). Region funkcji ustawia `vercel.json` (`fra1`).
3. **Settings → Environment Variables:** wklej zawartość `.env.staging` (formularz przyjmuje wiele linii naraz) dla środowiska **Production**; zmienne `NEXT_PUBLIC_*` są wbudowywane podczas builda, więc ustaw je **przed** pierwszym wdrożeniem.
4. **Settings → Domains:** dodaj `staging.twojadomena.pl` i ustaw w DNS rekord CNAME wskazany przez Vercel (HTTPS włączy się sam).
5. Wdróż (push do `dev` albo „Redeploy”).

## Krok 5a. Cron powiadomień (🧑, 5 min)

Bez crona aplikacja **nie wysyła żadnych powiadomień** (ani push, ani e-mail), a dzwonek się nie wypełnia. Zadanie co minutę uruchamia baza:

1. Supabase → SQL Editor → wklej `supabase/cron/outbox-cron.sql`, podmień `<WARTOŚĆ CRON_SECRET>` (ta sama co w Vercel) i `<ADRES APLIKACJI>` i uruchom.
2. Po minucie sprawdź (zapytania są w komentarzu na końcu pliku): w `net._http_response` ma być kod **200** z raportem procesora; 401 = zły sekret, 503 = brak `CRON_SECRET` we wdrożeniu.
3. **Alternatywa na Vercel Pro:** zamiast SQL dodaj do `vercel.json` `"crons": [{ "path": "/api/cron/outbox", "schedule": "* * * * *" }]` (Vercel sam wysyła `Authorization: Bearer $CRON_SECRET`). Nie włączaj obu naraz. Na Hobby taki wpis zatrzyma wdrożenie.

## Krok 6. Test dymny (🧑, 2 min)

```powershell
$env:CRON_SECRET = "<wartość z .env.staging>"
npm.cmd run smoke -- https://staging.twojadomena.pl
Remove-Item Env:CRON_SECRET
```

Oczekiwany wynik: wszystkie pozycje `OK` (strony publiczne, manifest, `sw.js`, 404, przekierowania z `/app`, `/portal`, `/admin`, nagłówki bezpieczeństwa w tym HSTS, trasa crona odrzuca brak sekretu i przyjmuje poprawny; samo uruchamianie crona sprawdzisz w kroku 5a). Błąd „503: CRON_SECRET nie jest ustawiony” znaczy, że zmienne nie dotarły do wdrożenia (po zmianie zmiennych zrób Redeploy).

## Krok 7. Konto właściciela i zamknięcie rejestracji (🧑, 15 min)

1. Zarejestruj swoje konto zwykłym formularzem na `https://staging.twojadomena.pl/signup` (rejestracja jest na starcie otwarta), kliknij link z e-maila potwierdzającego i sprawdź, że wiadomość jest po polsku/angielsku zgodnie z językiem przeglądarki.
2. Nadaj kontu uprawnienia właściciela platformy, ustawiając dane zdalnego projektu **tylko na czas polecenia** (skrypt ma pierwszeństwo dla zmiennych środowiskowych nad `.env.local`):
   ```powershell
   $env:NEXT_PUBLIC_SUPABASE_URL = "https://<ref>.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY = "<klucz service_role>"
   npm.cmd run admin:grant -- twoj@adres.pl
   Remove-Item Env:NEXT_PUBLIC_SUPABASE_URL, Env:SUPABASE_SERVICE_ROLE_KEY
   ```
3. Wejdź na `/admin` → skonfiguruj weryfikację dwuetapową (`/admin/mfa`, aplikacja uwierzytelniająca).
4. W `/admin/codes` **zamknij rejestrację** i utwórz kod beta dla siebie. Sprawdź: rejestracja bez kodu jest odrzucona (także bezpośrednio przez API: test integracyjny to pilnuje, ale zobacz na własne oczy).

## Krok 8. Test ręczny na telefonie (🧑, opcjonalny)

**Zakres po decyzji z 2026-10-21:** PWA i push na prawdziwych telefonach zostały już sprawdzone i działają, a krytyczne ścieżki pokrywają testy automatyczne (`npm run e2e` lokalnie i w CI). Na stagingu zrób ten krok tylko, żeby potwierdzić, że push i e-mail działają przez Twój hosting i domenę (powiadomienie po zaplanowaniu zajęć, instalacja z HTTPS). Poniższa lista to pełna wersja.

Wykonaj listę z sekcji 6 dokumentu [WDROZENIE-DEMO-10-TESTEROW.md](WDROZENIE-DEMO-10-TESTEROW.md) (szkoła, klient z psem, pakiet, wpłata, zajęcia, zaproszenie QR na drugim telefonie, PWA na Androidzie i iPhonie, push, e-maile, zawieszenie szkoły w `/admin`, offline). Dodatkowo na stagingu sprawdź:
- przełączenie języka w `Więcej` (polski ↔ angielski) w obu panelach;
- regulamin i politykę prywatności (`/terms`, `/privacy`): dane operatora, banner „wersja robocza” (zdejmiesz go po przeglądzie prawnika);
- „Zgłoś problem lub pomysł” w obu panelach i wpis w `/admin/feedback`;
- import klientów z pliku (`/app/clients/import`) na przykładowym arkuszu;
- e-mail z zaproszeniem klienta i zespołu (polski i angielski).

## Krok 9. Monitoring i kopie (🧑, 20 min)

1. **Monitor dostępności** (UptimeRobot lub podobny): adres `https://staging.twojadomena.pl/api/health`, interwał 1-5 minut, alert na e-mail przy kodzie innym niż 200. Odpowiedź `200 {"status":"ok"}` oznacza, że baza odpowiada i powiadomienia się przetwarzają; `503 {"status":"degraded","checks":{...}}` oznacza brak odpowiedzi bazy (`database: false`) albo zdarzenia czekające w kolejce dłużej niż 15 minut (`outbox: false`: cron nie działa lub zdarzenia wyczerpały próby). Endpoint jest publiczny i nie zwraca żadnych danych. Szczegóły crona: zapytanie z końca `supabase/cron/outbox-cron.sql` (`net._http_response`) albo Vercel → Logs.
2. **Sentry** (opcjonalnie, darmowy plan, region UE): załóż projekt (platforma „Next.js”/„JavaScript”), skopiuj DSN i ustaw `SENTRY_DSN` w Vercel (opcjonalnie `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`). Bez `SENTRY_DSN` nic nie jest wysyłane. Błędy serwera (render, akcje, trasy API, cron) trafiają do Sentry z typem i komunikatem błędu, stosem, wzorcem trasy (np. `/invite/[secret]`, nie rzeczywistym adresem), metodą i kodem `digest` (ten sam, który użytkownik widzi na stronie błędu); bez nagłówków, ciasteczek, treści żądań, adresów e-mail i identyfikatorów użytkowników. Sentry jest podprocesorem: dopisz go do polityki prywatności i umowy powierzenia. Błędy przeglądarki nie są raportowane (kod `digest` ze strony błędu wystarcza do znalezienia wpisu).
3. **Test odtworzenia kopii** na osobnym projekcie przed startem testów: kopia, której nie odtworzono, nie istnieje.

## Obsługa na co dzień

- **Poprawki:** zmiana w `dev` → CI → Twoja akceptacja → merge → Vercel wdraża sam. **Migracje wgrywaj przed merge'em, który ich wymaga:** `npx.cmd supabase db push`.
- **Awaria:** Vercel → Deployments → przywróć poprzednie wdrożenie; migracji nie cofasz ręcznie (nowa migracja naprawcza).
- **Zalegające powiadomienia:** `select type, last_error, attempts from outbox_events where processed_at is null and attempts >= 5;` w SQL Editorze.
- **Zmiana wersji regulaminu:** edytuj `messages/*/legal.json` i podnieś `LEGAL_VERSION` w `src/shared/legal.ts`.

## Typowe problemy

| Objawy | Przyczyna i rozwiązanie |
| --- | --- |
| Build w Vercel się nie udaje: „invalid input” przy zmiennych | Brak `NEXT_PUBLIC_SUPABASE_URL` lub klucza anon; uruchom `npm run env:check` i wklej ponownie |
| Wdrożenie odrzucone z powodu crona | Plan Hobby nie przyjmuje harmonogramu częstszego niż raz dziennie: usuń blok `crons` z `vercel.json` i użyj crona z bazy (krok 5a) |
| Powiadomienia nie wychodzą, a `net._http_response` pokazuje błąd | 401: różni się sekret w Vault i `CRON_SECRET` (usuń sekret `delete from vault.secrets where name = 'dogtrainer_cron_secret'` i dodaj poprawny); 503: brak `CRON_SECRET` we wdrożeniu; timeout: spróbuj ponownie (procesor ponawia zdarzenia) |
| Supabase Free: aplikacja przestała działać po tygodniu | Projekt został wstrzymany z powodu braku aktywności: wznów go w panelu (dane zostają); zadanie crona też działa tylko, gdy projekt jest aktywny |
| Link w e-mailu (potwierdzenie, reset) prowadzi na `localhost` albo kończy błędem | Zły `Site URL` / `Redirect URLs` w Supabase (krok 1.4) |
| E-maile Supabase (potwierdzenie, reset) nie dochodzą | Nie ustawiono własnego SMTP (krok 1.7) albo domena nie jest zweryfikowana w Resend |
| E-maile aplikacji (powiadomienia, zaproszenia) nie dochodzą | `RESEND_API_KEY` / `EMAIL_FROM` niepoprawne; zobacz `notification_log` (kolumna `detail`) i logi crona |
| Brak powiadomień push | Cron nie działa (krok 5a), brak kluczy VAPID, na iPhonie aplikacja nie jest dodana do ekranu głównego |
| `/admin` pyta o weryfikację dwuetapową i nie wpuszcza | Skonfiguruj TOTP w `/admin/mfa` (krok 7.3); awaryjnie `ADMIN_REQUIRE_MFA=0` i Redeploy |
| „Rejestracja jest na razie zamknięta” u nowego testera | Prawidłowe zachowanie: podaj mu kod beta z `/admin/codes` |
| Smoke: brak HSTS | Sprawdź, że to wdrożenie produkcyjne (`NODE_ENV=production`) pod adresem https |

## Lista kontrolna: staging gotowy do zaproszenia testerów

- [ ] `npm run env:check -- --file .env.staging` bez błędów (i uzupełnione dane operatora)
- [ ] `npm run smoke` bez błędów na adresie stagingu
- [ ] Rejestracja z potwierdzeniem e-mail działa, wiadomość po polsku i angielsku
- [ ] Konto właściciela z MFA, rejestracja zamknięta, kod beta działa
- [ ] Cron z bazy działa (`net._http_response` kod 200), push i e-mail z powiadomieniem dochodzą (telefon), PWA zainstalowana
- [ ] Monitor dostępności i alert, test odtworzenia kopii
- [ ] Regulamin i polityka prywatności przejrzane przez prawnika (do tego czasu banner „wersja robocza”)
