# Staging: pierwsze środowisko zdalne krok po kroku

Stan na 2026-10-21. Instrukcja dla właściciela (🧑 = robisz Ty w panelach usług, 🤖 = jest już w repozytorium). Staging to pierwsze środowisko w chmurze: tu przeklikasz całą aplikację na prawdziwym HTTPS i telefonie, a po teście dymnym zapraszasz do niego pierwszych testerów (plan testów, rytm i metryki: [WDROZENIE-DEMO-10-TESTEROW.md](WDROZENIE-DEMO-10-TESTEROW.md)). Przy pełnej produkcji ([WDROZENIE-PELNE-PRODUKCJA.md](WDROZENIE-PELNE-PRODUKCJA.md)) powtarzasz te same kroki na drugim zestawie kont.

**Czas:** ok. 2-3 godziny przy gotowych kontach (DNS i weryfikacja domeny w Resend mogą potrwać do doby).
**Koszt:** Supabase Pro ok. 25 USD/mies., Vercel Pro ok. 20 USD/mies. (patrz krok 0), domena, Resend i Sentry/monitor na darmowych planach.

## Co jest w repozytorium (🤖)

| Plik | Do czego |
| --- | --- |
| `vercel.json` | Region funkcji Frankfurt (`fra1`) i cron powiadomień co minutę (`/api/cron/outbox`) |
| `npm run env:check -- --file .env.staging` | Sprawdza zmienne środowiskowe przed wklejeniem do Vercel (format, długość sekretów, klucze demo, adresy https); **nie wypisuje wartości** |
| `npm run smoke -- https://adres` | Test dymny wdrożenia: strony publiczne, PWA, nagłówki bezpieczeństwa, przekierowania, zabezpieczenie crona |
| `supabase/migrations/` | Migracje 0001-0018 (schemat, RLS, funkcje) |
| `supabase/templates/` | Dwujęzyczne wiadomości Supabase Auth (potwierdzenie konta, reset hasła) do wklejenia w panelu (krok 1.6) |
| `.github/workflows/ci.yml` | CI (po scaleniu PR-ów z CI) |

## Krok 0. Decyzje (5 min)

1. **Adres:** subdomena aplikacji, np. `staging.twojadomena.pl` (na produkcji później `app.twojadomena.pl`).
2. **Plan Vercel:** cron co minutę wymaga planu **Pro**. Na planie Hobby Vercel odrzuci wdrożenie z takim harmonogramem: wtedy usuń blok `crons` z `vercel.json` i ustaw zewnętrzny harmonogram (np. cron-job.org) wywołujący `GET https://adres/api/cron/outbox` co 1-5 minut z nagłówkiem `Authorization: Bearer <CRON_SECRET>`.
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
5. Wdróż (push do `dev` albo „Redeploy”). Cron pojawi się w Settings → Cron Jobs; działa tylko dla wdrożenia produkcyjnego.

## Krok 6. Test dymny (🧑, 2 min)

```powershell
$env:CRON_SECRET = "<wartość z .env.staging>"
npm.cmd run smoke -- https://staging.twojadomena.pl
Remove-Item Env:CRON_SECRET
```

Oczekiwany wynik: wszystkie pozycje `OK` (strony publiczne, manifest, `sw.js`, 404, przekierowania z `/app`, `/portal`, `/admin`, nagłówki bezpieczeństwa w tym HSTS, cron odrzuca brak sekretu i przyjmuje poprawny). Błąd „503: CRON_SECRET nie jest ustawiony” znaczy, że zmienne nie dotarły do wdrożenia (po zmianie zmiennych zrób Redeploy).

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

## Krok 8. Test ręczny na telefonie (🧑, 45 min)

Wykonaj listę z sekcji 6 dokumentu [WDROZENIE-DEMO-10-TESTEROW.md](WDROZENIE-DEMO-10-TESTEROW.md) (szkoła, klient z psem, pakiet, wpłata, zajęcia, zaproszenie QR na drugim telefonie, PWA na Androidzie i iPhonie, push, e-maile, zawieszenie szkoły w `/admin`, offline). Dodatkowo na stagingu sprawdź:
- przełączenie języka w `Więcej` (polski ↔ angielski) w obu panelach;
- regulamin i politykę prywatności (`/terms`, `/privacy`): dane operatora, banner „wersja robocza” (zdejmiesz go po przeglądzie prawnika);
- „Zgłoś problem lub pomysł” w obu panelach i wpis w `/admin/feedback`;
- import klientów z pliku (`/app/clients/import`) na przykładowym arkuszu;
- e-mail z zaproszeniem klienta i zespołu (polski i angielski).

## Krok 9. Monitoring i kopie (🧑, 20 min)

1. **Monitor dostępności** (UptimeRobot lub podobny): adres `https://staging.twojadomena.pl/login`, alert na e-mail. Trasa crona wymaga nagłówka, więc zdrowie powiadomień sprawdzaj w Vercel → Logs (wywołania `/api/cron/outbox` co minutę; kod 500 oznacza zdarzenia, które wyczerpały 5 prób).
2. **Sentry** (opcjonalnie, darmowy plan): na razie nie jest podłączony w kodzie (to osobne zadanie).
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
| Wdrożenie odrzucone z powodu crona | Plan Hobby: usuń blok `crons` z `vercel.json` i użyj zewnętrznego harmonogramu (krok 0.2) |
| Link w e-mailu (potwierdzenie, reset) prowadzi na `localhost` albo kończy błędem | Zły `Site URL` / `Redirect URLs` w Supabase (krok 1.4) |
| E-maile Supabase (potwierdzenie, reset) nie dochodzą | Nie ustawiono własnego SMTP (krok 1.7) albo domena nie jest zweryfikowana w Resend |
| E-maile aplikacji (powiadomienia, zaproszenia) nie dochodzą | `RESEND_API_KEY` / `EMAIL_FROM` niepoprawne; zobacz `notification_log` (kolumna `detail`) i logi crona |
| Brak powiadomień push | Cron nie działa (krok 6), brak kluczy VAPID, na iPhonie aplikacja nie jest dodana do ekranu głównego |
| `/admin` pyta o weryfikację dwuetapową i nie wpuszcza | Skonfiguruj TOTP w `/admin/mfa` (krok 7.3); awaryjnie `ADMIN_REQUIRE_MFA=0` i Redeploy |
| „Rejestracja jest na razie zamknięta” u nowego testera | Prawidłowe zachowanie: podaj mu kod beta z `/admin/codes` |
| Smoke: brak HSTS | Sprawdź, że to wdrożenie produkcyjne (`NODE_ENV=production`) pod adresem https |

## Lista kontrolna: staging gotowy do zaproszenia testerów

- [ ] `npm run env:check -- --file .env.staging` bez błędów (i uzupełnione dane operatora)
- [ ] `npm run smoke` bez błędów na adresie stagingu
- [ ] Rejestracja z potwierdzeniem e-mail działa, wiadomość po polsku i angielsku
- [ ] Konto właściciela z MFA, rejestracja zamknięta, kod beta działa
- [ ] Push i e-mail z powiadomieniem dochodzą (telefon), PWA zainstalowana
- [ ] Monitor dostępności i alert, test odtworzenia kopii
- [ ] Regulamin i polityka prywatności przejrzane przez prawnika (do tego czasu banner „wersja robocza”)
