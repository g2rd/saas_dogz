# Wdrożenie wersji demo: 10 trenerów, test przez kilka tygodni

Stan na 2026-10-21. Dokument jest instrukcją krok po kroku. Cel: dać **10 wybranym trenerom działającą aplikację** (z ich klientami) na **4-6 tygodni**, żeby zebrać opinie i sprawdzić, czy ktoś będzie chciał za nią płacić. **Bez pobierania opłat**, ale z pełną kontrolą właściciela: wgląd w to, kto i jak używa aplikacji, oraz możliwość zawieszenia dostępu (np. po okresie testów albo braku płatności). Wersja pełna (sprzedaż): [WDROZENIE-PELNE-PRODUKCJA.md](WDROZENIE-PELNE-PRODUKCJA.md). Kontekst: [ARCHITEKTURA-I-STAN-PRAC.md](ARCHITEKTURA-I-STAN-PRAC.md), [WDROZENIE-PRODUKCYJNE.md](WDROZENIE-PRODUKCYJNE.md) (limitacje i ryzyka).

Oznaczenia: 🧑 robisz Ty (konta, DNS, decyzje, rozmowy), 🤖 robi się w kodzie (agent albo programista), ⚠️ pułapka, ✅ test sprawdzający. Szacunki czasu są orientacyjne i bez gwarancji.

## 0. Założenia i zakres

**Co dostają testerzy:** panel trenera i panel klienta jako PWA (telefon), klienci i psy, pakiety i płatności (ewidencja), zajęcia, wolne terminy, powiadomienia (dzwonek, push, e-mail), zaproszenia klientów przez QR. **Czego nie dostają:** zadań domowych, płatności online, zajęć grupowych, SMS, faktur.

**Model dostępu:** zamknięta rejestracja (tylko trenerzy z kodem od Ciebie), każdy trener ma własną „szkołę” (organizację), klienci wchodzą przez zaproszenia trenera. Ty jesteś właścicielem platformy z panelem `/admin`.

**Kryteria sukcesu testu (ustal przed startem):** np. co najmniej 7 z 10 trenerów zalogowało się w każdym tygodniu; co najmniej 5 dodało klientów i zaprosiło ich do panelu; co najmniej 3 użyło push/powiadomień na co dzień; co najmniej 3 deklaruje gotowość zapłaty po teście (z ceną). Wymyślone liczby to propozycja, zmień je po rozmowie z pierwszymi trenerami.

**Koszt miesięczny (orientacyjnie, ceny z wyszukiwań, sprawdź u dostawców):** Supabase Pro ok. 25 USD, Vercel Pro ok. 20 USD (potrzebny dla crona co minutę i komercyjnego użycia), Resend darmowy lub 20 USD, domena ok. 50-100 zł rocznie. **Razem ok. 50-70 USD miesięcznie.** Darmowy plan Supabase usypia projekt po okresie braku aktywności i nie daje gwarancji kopii zapasowych, więc do testów z cudzymi danymi nie polecam.

## 1. Co trzeba zbudować w kodzie przed startem (🤖, blokujące)

> **Stan na 2026-10-21:** punkty 1.1 i 1.2 (panel `/admin`, blokada, kody beta, MFA) są zrobione i przetestowane lokalnie (ADR 0012, migracja 0011). Do zrobienia zostały 1.3-1.6. Opisy poniżej to specyfikacja; różnice względem wykonania są oznaczone „Zrobione:”.

Bez punktów 1.1-1.3 nie spełnisz wymagań „wgląd i blokowanie” ani „zamknięta rejestracja”. Łącznie orientacyjnie 4-7 dni pracy (z testami i ADR), punkty 1.4-1.6 szybciej.

### 1.1. Panel właściciela `/admin` (wgląd i zawieszanie dostępu) ✅
**Zrobione:** dostęp = to samo logowanie (e-mail + hasło) co reszta aplikacji, konto z wpisem w `platform_admins` (nadajesz skryptem `npm run admin:grant -- twoj@adres` albo SQL-em), a na produkcji dodatkowo weryfikacja dwuetapowa TOTP (`/admin/mfa`; wyłączysz tylko świadomie `ADMIN_REQUIRE_MFA=0`). Zalecane osobne konto właściciela. Osoby spoza listy dostają 404. Status w `organizations.status`, termin w `access_until`; pasek w aplikacji trenera, ekran `/suspended`; e-mail do właścicieli szkoły przy zmianie statusu; automat końca dostępu w cronie. Poniższe punkty „Dane” i „Egzekwowanie” opisują zrobione rozwiązanie (nazwy funkcji i kolumn mogą się nieznacznie różnić: źródłem prawdy jest migracja 0011).
**Dane (migracja 0011):**
- `platform_admins (user_id)`: kto jest właścicielem platformy (RLS: odczyt tylko dla siebie; zapis wyłącznie `service_role`).
- Kolumny w `organizations`: `status` (`trial` | `active` | `read_only` | `suspended`), `access_until timestamptz` (koniec testu lub opłaconego okresu), `suspended_reason text`, `status_changed_at`, `notes` (Twoje notatki: telefon, uwagi).
- Funkcja `public.platform_overview()` (`security definer`, tylko dla `platform_admins`): jedna linia na szkołę: nazwa, status, `access_until`, data założenia, e-mail właściciela, liczba członków personelu, liczba klientów (niezarchiwizowanych), klientów z dostępem do portalu, zajęcia (ostatnie 7 i 30 dni), ostatnie logowanie (z `auth.users.last_sign_in_at`), ostatnia aktywność (maks. z `audit_log`/zajęć), liczba wysłanych powiadomień (30 dni), liczba aktywnych subskrypcji push.
- Funkcje `public.set_organization_status(org, status, reason, until)` i `public.extend_access(org, until)`: zapisują zmianę w `audit_log`.

**Egzekwowanie blokady (w bazie i w UI):**
- Baza: `app.has_org_role()` (używane przy zapisach) zwraca `false`, gdy organizacja ma status `read_only` lub `suspended`; `app.is_org_member()` i `app.is_client_of_org()` zwracają `false` dla `suspended`. To działa także przy bezpośrednich wywołaniach API.
- UI: `getRequestContext` rozpoznaje status organizacji **zanim** uzna użytkownika za „bez organizacji” (⚠️ inaczej zawieszony trener zobaczy kreator tworzenia nowej szkoły) i pokazuje pełnoekranową stronę „Konto zawieszone. Skontaktuj się z …”; dla `read_only` baner „Konto tylko do odczytu” i wyłączone przyciski zapisu. Portal klienta zawieszonej szkoły pokazuje „Szkoła chwilowo niedostępna”.
- Procesor powiadomień pomija zdarzenia organizacji `suspended`.
- Automat: zadanie dzienne (cron) przełącza `trial/active` → `read_only`, gdy minęło `access_until` (opcjonalnie z 3 dniami karencji) i wysyła trenerowi e-mail z wyprzedzeniem (7 i 1 dzień przed końcem).

**Interfejs `/admin`** (nowa grupa tras `(admin)`; reguła granic modułów już dopuszcza tam klienta `service_role`): tabela szkół z filtrami i sortowaniem, karta szkoły (członkowie, metryki, historia zmian statusu), przyciski „Zawieś”, „Tylko do odczytu”, „Aktywuj”, „Przedłuż do …”, pole notatek, **kafelki na górze**: liczba szkół, trenerzy aktywni w 7 dni, klienci z dostępem do portalu, zajęcia w tym tygodniu, szkoły nieaktywne od 7 dni (do przypomnienia). Każda zmiana statusu z potwierdzeniem (`ConfirmSubmit`).
✅ Testy: pgTAP (kto może wywołać funkcje, blokada zapisów, izolacja), integracyjne (zawieszona szkoła nie zapisuje, odczyt tylko dla `read_only`, portal klienta zablokowany), przeklikanie.

**Do czasu powstania panelu** (zwłaszcza na stagingu): przegląd w Supabase → SQL Editor:
```sql
select o.name, o.created_at::date as zalozona,
  (select count(*) from organization_members m where m.organization_id=o.id and m.status='active') as czlonkowie,
  (select count(*) from clients c where c.organization_id=o.id and c.archived_at is null) as klienci,
  (select count(*) from training_sessions s where s.organization_id=o.id and s.starts_at > now()-interval '30 days') as zajecia_30d,
  (select max(u.last_sign_in_at)::date from organization_members m join auth.users u on u.id=m.user_id where m.organization_id=o.id) as ostatnie_logowanie
from organizations o order by o.created_at desc;
```
a zablokowanie osoby: w Supabase → Authentication → Users → zablokuj (ban) użytkownika. To rozwiązanie awaryjne: nie zawiesza klientów szkoły i nie ma historii.

### 1.2. Zamknięta rejestracja kodem beta ✅
**Zrobione:** kody w `/admin/codes` (etykieta, liczba użyć, ważność w dniach; jawny kod pokazany raz), przełącznik „Zamknij rejestrację” (domyślnie rejestracja jest **otwarta**, żeby nie psuć środowiska lokalnego: zamknij ją na środowisku testerów), pole „Kod zaproszenia” w `/signup`, wyzwalacz na `auth.users` blokujący także bezpośrednie wywołania API. Klienci i zespół rejestrują się z zaproszeń trenera bez kodu.
⚠️ Samo ukrycie formularza nie wystarczy: punkt końcowy rejestracji Supabase jest publiczny (klucz `anon` jest w przeglądarce). Dlatego walidacja musi być **w bazie**:
- Tabela `beta_codes (code_hash, max_uses, used_count, expires_at, label)` i wyzwalacz `before insert` na `auth.users`, który przepuszcza rejestrację tylko, gdy `raw_user_meta_data` zawiera ważny `beta_code` **albo** skrót ważnego, oczekującego zaproszenia (`invite_hash`: klienci zakładają konta z zaproszenia trenera, personel z zaproszenia do zespołu). Inaczej wyjątek.
- Formularz `/signup` dostaje pole „Kod zaproszenia”, a `signUp` przekazuje je w metadanych; strony `/invite` i `/join` przekazują skrót zaproszenia.
- W panelu `/admin` zakładka „Kody”: generowanie kodu (np. 1 użycie, ważny 14 dni, etykieta „Anna K., Szkoła Łapa”), unieważnianie.
✅ Test: rejestracja bez kodu bezpośrednio przez API zwraca błąd; z poprawnym kodem działa; zużyty kod nie działa drugi raz; rejestracja klienta z zaproszenia nadal działa.

### 1.3. Zgoda na regulamin testów i politykę prywatności
- Strony statyczne `/regulamin-testow` i `/prywatnosc` (treść od prawnika; minimum: kto jest administratorem danych, że trener jest administratorem danych swoich klientów, a platforma procesorem, jakie dane, gdzie przechowywane (UE), kontakt, usuwanie danych na żądanie, brak gwarancji dostępności w teście, zasady zawieszenia).
- Pole wyboru przy rejestracji trenera i zapis zgody (`consents`: użytkownik, dokument, wersja, czas). Klient przy przyjęciu zaproszenia akceptuje politykę prywatności szkoły/platformy.
- **Umowa powierzenia przetwarzania danych** z każdym trenerem (może być zgodą w regulaminie, ale konsultuj z prawnikiem; trener wprowadza dane osobowe klientów i **wizerunek/dane o psach**).

### 1.4. Zbieranie opinii ✅ (zrobione 2026-10-21)
**Zrobione:** przycisk „Zgłoś problem lub pomysł” w `Więcej` obu paneli (`/app/feedback`, `/portal/feedback`), tabela `feedback` (migracja 0014; autor, szkoła, rodzaj, treść, ekran, język), przegląd w `/admin/feedback` z oznaczaniem jako obejrzane. Zostaje ankieta tygodniowa (ręcznie) i ewentualny link do zewnętrznego formularza w stopce e-maili. Pierwotny plan:
Link do formularza opinii (Tally/Google Forms) w menu „Więcej” obu paneli i w stopce e-maili; opcjonalnie tabela `feedback` z przyciskiem „Zgłoś problem lub pomysł” (strona, wersja, wiadomość). Plus ankieta tygodniowa (5 pytań) wysyłana ręcznie.

### 1.5. Import klientów z CSV ✅ (zrobione 2026-10-21)
**Zrobione:** `/app/clients/import` (link na liście klientów): plik CSV albo wklejona tabela, podgląd i raport problemów, atomowy zapis klientów i psów (funkcja SQL `import_clients`, migracja 0015), bez zaproszeń. Wzór arkusza dla testerów: kolumny `Imię;Nazwisko;E-mail;Telefon;Pies;Rasa` (rozpoznawane także nagłówki angielskie). Pierwotny plan:
Trener z 30-100 klientami nie wpisze ich ręcznie, więc test bez importu da zafałszowany obraz. Minimum: przesłanie pliku (imię, nazwisko, telefon, e-mail, pies), podgląd i raport błędów, zapis do `clients`/`dogs`, bez zaproszeń. Jeśli nie zdążysz, importuj **Ty** dane testerów skryptem jednorazowo (ustalasz z nimi wzór arkusza).

### 1.6. Jakość i bezpieczeństwo minimum (przed pierwszym obcym użytkownikiem)
**Zrobione 2026-10-21 (PR `feat/ci-quality-minimum`, szczegóły: [PRZEGLAD-BEZPIECZENSTWA.md](PRZEGLAD-BEZPIECZENSTWA.md)):** CI w GitHub Actions (blokadę scalania włączasz w rulesecie), `error.tsx`/`not-found.tsx`/`global-error.tsx`, limity (opinie, zaproszenia, import, rozmiar akcji), przegląd `npm audit` (produkcja bez podatności) i RLS z testem niezmienników, nagłówki bezpieczeństwa. **Zostaje:** Sentry i monitor dostępności (konta), komunikat wygasłej sesji, limity Supabase Auth i Resend przy wdrożeniu. Pierwotny plan:
- CI w GitHub Actions: typecheck, lint, testy jednostkowe, pgTAP, integracyjne, granice, build; blokada scalania przy czerwonym CI.
- `error.tsx` i `not-found.tsx`, komunikat wygasłej sesji, linki powrotu w trybie `standalone` PWA.
- Limity: ograniczenie wysyłki zaproszeń e-mailem na trenera na dobę; captcha lub kod beta (jest) na rejestracji.
- Przegląd `npm audit` (5 wysokich podatności zgłoszonych w scaffoldzie) i RLS „z perspektywy atakującego”: ręczne próby z kluczem `anon` i tokenem trenera A na danych szkoły B.
- Sentry (darmowy plan) po stronie serwera, z wyłączonymi danymi osobowymi; monitor dostępności (np. UptimeRobot) na `/login` i na `/api/cron/outbox` (wywołanie z sekretem).

## 2. Konta i zasoby do założenia (🧑, kolejność)

| # | Usługa | Po co | Uwagi |
| --- | --- | --- | --- |
| 1 | **Domena** (np. `twojadomena.pl`) | Adres aplikacji i nadawca e-maili | Kup u rejestratora z łatwym DNS (Cloudflare, OVH i in.). Subdomena `app.` dla aplikacji |
| 2 | **GitHub** (jest: `g2rd/saas_dogz`) | Repozytorium i CI | Repozytorium prywatne |
| 3 | **Supabase**, plan Pro, region UE (Frankfurt) | Baza, Auth, kopie | Organizacja i projekt; zapisz hasło bazy w menedżerze haseł |
| 4 | **Vercel**, plan Pro | Hosting, cron | Połącz z GitHub |
| 5 | **Resend** | E-maile (powiadomienia, zaproszenia, reset hasła) | Zweryfikuj domenę (SPF, DKIM) |
| 6 | **Sentry** (opcjonalnie) | Błędy | Darmowy plan |
| 7 | **UptimeRobot** lub podobny | Monitor dostępności | Darmowy plan |
| 8 | Skrzynka kontaktowa (np. `pomoc@domena`) | Wsparcie i kontakt w regulaminie | |

⚠️ Sekretów (klucze Supabase `service_role`, Resend, VAPID, `CRON_SECRET`) nie wklejaj do czatów ani do repozytorium. Trzymaj je w menedżerze haseł i w panelu Vercel.

## 3. Supabase (🧑 + 🤖)

1. Utwórz projekt: region **Central EU (Frankfurt)**, silne hasło bazy. Zapisz: `Project URL`, `anon key`, `service_role key` (Settings → API), `project ref`.
2. Lokalnie zainstaluj CLI (w repozytorium jest w `devDependencies`): `npx.cmd supabase login`, potem `npx.cmd supabase link --project-ref <ref>`.
3. Zastosuj migracje: `npx.cmd supabase db push` (pokaże listę oczekujących migracji; zatwierdź). Dojdą też migracja 0011 (panel właściciela) i ewentualne kolejne. ⚠️ Nigdy nie uruchamiaj `seed:dev` ani `db reset` na produkcji. Migracje wdrażaj **przed** wdrożeniem kodu, który ich wymaga.
4. **Authentication → URL Configuration:** `Site URL` = `https://app.twojadomena.pl`, w `Redirect URLs` dodaj `https://app.twojadomena.pl/**`.
5. **Authentication → Providers → Email:** włącz „Confirm email” (potwierdzenie adresu). Po wdrożeniu przeklikaj rejestrację z potwierdzeniem: zaproszenie klienta i zespołu wracają na swoją stronę po kliknięciu linku (nie było testowane lokalnie).
6. **Authentication → SMTP Settings (własny SMTP):** użyj Resend (host `smtp.resend.com`, użytkownik `resend`, hasło = klucz API, nadawca `powiadomienia@twojadomena.pl`; nazwy pól i porty zweryfikuj w dokumentacji Resend). Bez własnego SMTP domyślny serwer Supabase ma bardzo niskie limity i e-maile (reset hasła) nie będą dochodzić.
7. **Kopie zapasowe:** w planie Pro są dzienne kopie; sprawdź w Database → Backups, że działają. ✅ Zrób **jeden test odtworzenia** na osobnym projekcie przed startem (kopia, której nie odtworzono, nie istnieje).
8. Utwórz swoje konto właściciela (rejestracja jest jeszcze otwarta, więc zrób ją zwykłym formularzem **przed** zamknięciem naboru), nadaj mu uprawnienia (`npm run admin:grant -- <twój e-mail>` z `NEXT_PUBLIC_SUPABASE_URL` i `SUPABASE_SERVICE_ROLE_KEY` ustawionymi tylko na czas polecenia, albo w SQL Editorze: `insert into platform_admins (user_id) select id from auth.users where email = '<twój e-mail>';`), zaloguj się, skonfiguruj weryfikację dwuetapową w `/admin/mfa` i dopiero wtedy zamknij rejestrację w `/admin/codes`. Wygenerowane tam kody rozdajesz testerom.

## 4. Resend i DNS (🧑)

1. W Resend dodaj domenę `twojadomena.pl` (region UE, jeśli dostępny), dodaj w DNS rekordy, które pokaże (SPF, DKIM, opcjonalnie DMARC `v=DMARC1; p=none; rua=mailto:...` na początek), poczekaj na weryfikację.
2. Utwórz klucz API (uprawnienie wysyłania). Zapisz go jako `RESEND_API_KEY`; nadawca: `EMAIL_FROM="DogTrainer <powiadomienia@twojadomena.pl>"`.
3. ✅ Test: wyślij testowy e-mail do trzech skrzynek (Gmail, Onet/WP, Outlook): trafia do głównej, a nie do spamu. Nagłówki powinny pokazać SPF/DKIM `pass`.
4. Darmowy plan ma limity dzienne i miesięczne; przy 10 trenerach i ich klientach prawdopodobnie wystarczy na start, ale sprawdź zużycie po pierwszym tygodniu.

## 5. Vercel i zmienne środowiskowe (🧑 + 🤖)

1. Vercel → Add New → Project → zaimportuj repozytorium. Framework: Next.js (wykryty). Gałąź produkcyjna: **`main`** (zmieniamy ją tylko po Twojej zgodzie). Wersja Node: ustaw zgodną z lokalną (24.x, jeśli dostępna, w przeciwnym razie najnowsza LTS; sprawdź, czy `build` przechodzi). Region funkcji: **Frankfurt (`fra1`)** (Settings → Functions).
2. **Zmienne środowiskowe (Production):**

| Zmienna | Wartość | Uwagi |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | klucz `anon` | publiczny |
| `SUPABASE_SERVICE_ROLE_KEY` | klucz `service_role` | **tajny**, tylko po stronie serwera |
| `NEXT_PUBLIC_SITE_URL` | `https://app.twojadomena.pl` | linki w e-mailach i QR |
| `INVITATION_HASH_SECRET` | losowy ciąg min. 24 znaki | tajny; zmiana unieważnia oczekujące zaproszenia |
| `CRON_SECRET` | losowy ciąg min. 24 znaki | tajny |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | `npx web-push generate-vapid-keys` | **nowa para** (nie lokalna) |
| `VAPID_SUBJECT` | `mailto:pomoc@twojadomena.pl` | prawdziwy adres |
| `RESEND_API_KEY`, `EMAIL_FROM` | z kroku 4 | |
Nie ustawiaj `DEV_TUNNEL`, `OUTBOX_DEV_POLL`, `MAILPIT_URL`. Zmienne `NEXT_PUBLIC_*` są wbudowywane przy buildzie, więc po ich zmianie trzeba przebudować.
3. **Cron powiadomień (krytyczne):** bez niego aplikacja **nie wysyła żadnych powiadomień**. W katalogu głównym repozytorium dodaj `vercel.json` (🤖):
```json
{ "crons": [{ "path": "/api/cron/outbox", "schedule": "* * * * *" }] }
```
Vercel wywołuje trasę nagłówkiem `Authorization: Bearer $CRON_SECRET` (nasza trasa tego wymaga). Częstość co minutę wymaga planu Pro (na Hobby cron działa najwyżej raz dziennie, według dokumentacji Vercel; zweryfikuj aktualny cennik). Cron działa tylko dla wdrożeń produkcyjnych, a Vercel nie ponawia nieudanych wywołań (nasz procesor sam ponawia zdarzenia do 5 razy). Alternatywa: zewnętrzny harmonogram (np. cron-job.org) wołający `GET https://app.twojadomena.pl/api/cron/outbox` z nagłówkiem `Authorization: Bearer <CRON_SECRET>` co minutę.
4. **Domena:** Vercel → Settings → Domains → dodaj `app.twojadomena.pl`, ustaw w DNS rekord CNAME wskazany przez Vercel; HTTPS włącza się automatycznie.
5. Wdróż (push do `main`). ✅ Sprawdź: `https://app.twojadomena.pl/login` ładuje się; `/manifest.webmanifest` zwraca 200; `/sw.js` zwraca JavaScript; `/api/cron/outbox` bez nagłówka zwraca 401, a z nagłówkiem 200 z JSON-em.

## 6. Test dymny na produkcji (✅ przed zaproszeniem kogokolwiek)

Wykonaj na własnych kontach (trener i klient na telefonie):
1. Rejestracja bez kodu: **odrzucona** (także bezpośrednio przez API); z kodem: działa, e-mail z potwierdzeniem dochodzi, po kliknięciu wraca do aplikacji.
2. Kreator szkoły, rodzaj zajęć, klient z psem, sprzedaż pakietu, wpłata, zaplanowanie zajęć.
3. Zaproszenie klienta przez QR na drugim telefonie: konto, `/portal`, saldo „N z M”.
4. **PWA:** Android (Chrome → Zainstaluj) i iPhone (Safari → Udostępnij → Do ekranu początkowego, otwarcie z ikony). Strona działa z ikony, `/start` kieruje do właściwego panelu.
5. **Push:** w portalu klienta `Więcej` → „Włącz push”; trener planuje zajęcia klientowi: push dociera po ok. 30-90 s (okno „Cofnij” 30 s + cykl crona). Sprawdź też klik w powiadomienie.
6. E-mail z powiadomieniem i resetem hasła w skrzynce głównej.
7. Panel `/admin`: nowa szkoła widoczna z metrykami; „Zawieś” → trener widzi ekran „Konto zawieszone”, klient „Szkoła niedostępna”, zapisy w API zwracają błąd; „Aktywuj” przywraca.
8. Odwołanie zajęć z potwierdzeniem, „Przywróć zajęcia”, storno wpłaty.
9. Offline: wyłącz sieć w telefonie, otwórz aplikację: strona „Brak połączenia”.
10. Wyłącz `CRON_SECRET` lub cron na chwilę i potwierdź, że monitor zgłasza problem (alert); przywróć.

## 7. Wdrożenie 10 testerów (🧑)

**Przed startem:** wybierz 10 trenerów o różnym profilu (pojedynczy trener, mała szkoła, ktoś z grupami, ktoś, kto dziś pracuje na zeszycie/Excelu). Ustal z każdym: czas trwania (4-6 tygodni), co dostajesz w zamian (opinie, 15-minutowa rozmowa tygodniowo), że dane są testowe lub prawdziwe, kto jest administratorem danych, co po teście (usunięcie lub kontynuacja za opłatą).
**Dla każdego trenera:**
1. Wygeneruj w `/admin` kod beta (1 użycie, ważny 14 dni, etykieta z imieniem) i ustaw `access_until` na koniec testu.
2. Wyślij wiadomość: link do `app.twojadomena.pl/signup`, kod, **jednostronicową instrukcję** (instalacja PWA, włączenie push, dodanie klienta, zaproszenie QR), link do regulaminu testów i do kanału pomocy.
3. **30-minutowe wdrożenie na żywo** (wideorozmowa): rejestracja, dodanie 3 klientów (albo import CSV), zaproszenie jednego klienta QR-em, włączenie push na jego telefonie. Pierwszy tydzień jest najważniejszy; trener, który nie doda klientów w 3 dni, zwykle porzuca narzędzie.
4. Kanał wsparcia (grupa WhatsApp/Signal lub e-mail) z obiecanym czasem odpowiedzi (np. do 24 h w dni robocze).

**Rytm 4-6 tygodni:**
- Tydzień 0: wdrożenia, test dymny, poprawki krytyczne.
- Co tydzień: przegląd `/admin` (kto się nie logował 7 dni, kto nie dodał klientów) i krótka wiadomość do nieaktywnych; ankieta 5 pytań (co działa, co przeszkadza, czego brakuje, czy poleciłbyś, ile byłbyś gotów płacić); rozmowa 15 min z 3-4 trenerami.
- W połowie testu: przegląd metryk względem kryteriów sukcesu; decyzja, co poprawiać, a co odłożyć.
- Koniec testu: ankieta końcowa, rozmowy, decyzja go/no-go (patrz sekcja 9).

**Jak śledzisz użycie (wymaganie właściciela):** `/admin` pokazuje na jednym ekranie: liczbę szkół i trenerów, aktywnych w 7 dni, klientów z dostępem do portalu, zajęcia w tygodniu, powiadomienia, szkoły „uśpione”. Karta szkoły ma historię statusów i Twoje notatki.

**Jak blokujesz dostęp (np. po teście, braku płatności, nadużyciu):** `/admin` → szkoła → „Tylko do odczytu” (trener widzi dane, nie może zapisywać; łagodny krok przed zawieszeniem) albo „Zawieś” (pełna blokada, klienci też), z powodem i notatką. Automat po `access_until`: najpierw e-mail z wyprzedzeniem, potem tryb tylko do odczytu. Dane **nie są kasowane** przy blokadzie; usuwanie na żądanie robisz osobną, udokumentowaną procedurą (RODO).

## 8. Codzienna obsługa (🧑 + 🤖)

- Rano (5 min): `/admin` (nowi, nieaktywni), Sentry (nowe błędy), monitor dostępności, skrzynka pomocy.
- Cron i powiadomienia: trasa zwraca 500, gdy są zdarzenia, które wyczerpały 5 prób; sprawdź w Vercel → Logs i w tabeli `outbox_events` (`last_error`). Zapytanie: `select type, last_error, attempts from outbox_events where processed_at is null and attempts >= 5;`.
- E-maile: panel Resend (odbicia, skargi); jeśli rośnie liczba odbić, sprawdź domenę i treść.
- **Wdrażanie poprawek:** zmiana w `dev` → testy w CI → Twoja zgoda → merge `dev` → `main` → Vercel wdraża sam. Migracje: `npx.cmd supabase db push` **przed** merge'em, który ich wymaga. Poprawki krytyczne (hotfix) tą samą drogą, ale od razu.
- Awaria: komunikat do testerów (kanał wsparcia), przywrócenie poprzedniego wdrożenia w Vercel (Deployments → Promote/Instant Rollback; sprawdź nazwę opcji), a migracji nie cofasz ręcznie: robi się nową migrację naprawczą.
- Kopie: raz w tygodniu sprawdź, że kopia z ostatniej doby istnieje.

## 9. Zakończenie testu i decyzja

Po 4-6 tygodniach zbierz: metryki z `/admin` względem kryteriów z sekcji 0, ankiety, notatki z rozmów, listę zgłoszonych braków (sortuj według liczby trenerów, którzy o to prosili). Decyzja: (a) **go**: przechodzisz do [wdrożenia pełnego](WDROZENIE-PELNE-PRODUKCJA.md) i oferujesz testerom ceny założycielskie; (b) **iteruj**: poprawiasz największe braki i przedłużasz test; (c) **stop**: zamykasz dostęp (`read_only` → `suspended`), eksportujesz i usuwasz dane na żądanie.

## 10. Ryzyka specyficzne dla demo

| Ryzyko | Co robić |
| --- | --- |
| Push na iPhonie nie działa, bo klient nie zainstalował PWA | Instrukcja z obrazkami; w onboardingu trenera pokaż instalację; e-mail jako zapas |
| Powiadomienia nie wychodzą (cron nie działa) | Monitor na trasie crona, alert na 500, sprawdzenie na początku dnia |
| E-maile w spamie | Weryfikacja domeny, test do 3 skrzynek, DMARC |
| Wyciek lub błąd RLS na cudzych danych | Przegląd z perspektywy atakującego przed startem, brak danych wrażliwych w teście (poproś o nieszczególne dane zdrowotne psów) |
| Tester dodaje prawdziwe dane klientów bez zgody klientów | Umowa powierzenia, polityka prywatności, jasna informacja w regulaminie testów |
| Brak czasu na wsparcie 10 trenerów | Ogranicz do 5-6 na początek albo wdrażaj po 2-3 trenerów tygodniowo |
| Za mało funkcji (zadania domowe, grupy) zniechęca | Uczciwie komunikuj, że to wersja testowa; zapisuj prośby i licz je |
| Nadużycie (spam zaproszeń) | Limit zaproszeń na dobę, możliwość zawieszenia w `/admin` |

## 11. Lista kontrolna „gotowe do zaproszenia testerów”
- [ ] Panel `/admin` z wglądem, zawieszaniem i `access_until` (1.1) i testami
- [ ] Zamknięta rejestracja kodem, sprawdzona przez bezpośrednie API (1.2)
- [ ] Regulamin testów, polityka prywatności, zgoda przy rejestracji (1.3)
- [x] Formularz opinii (1.4) i import CSV (1.5) zrobione; do tego dać testerom wzór arkusza
- [ ] CI zielone i wymagane w rulesecie (jest, 1.6); Sentry i monitor dostępności włączone (zostaje)
- [ ] Supabase Pro w UE, migracje wdrożone, Auth (URL-e, potwierdzenie e-mail, własny SMTP), kopia przetestowana
- [ ] Resend z zweryfikowaną domeną, e-maile trafiają do głównej skrzynki
- [ ] Vercel Pro, zmienne środowiskowe, `vercel.json` z cronem, domena z HTTPS
- [ ] Test dymny (sekcja 6) przeszedł na prawdziwych telefonach (Android i iPhone)
- [ ] Kryteria sukcesu, rytm tygodniowy, kanał wsparcia i jednostronicowa instrukcja gotowe
- [ ] Jesteś w `platform_admins`, masz kody beta dla 10 trenerów

## 12. Orientacyjny harmonogram

| Okres | Praca |
| --- | --- |
| Tydzień 1 | Konta i domena (🧑), Supabase i Resend (🧑), CI i jakość (🤖), start panelu `/admin` i kodów beta (🤖) |
| Tydzień 2 | Dokończenie `/admin`, zgody i strony prawne, opinie, import CSV (🤖); prawnik (🧑); Vercel i DNS (🧑) |
| Tydzień 3 | Wdrożenie na produkcję, test dymny na telefonach, poprawki; rekrutacja i umowy z trenerami (🧑) |
| Tygodnie 4-9 | Test 4-6 tygodni z rytmem z sekcji 7 |

To przybliżenie dla jednej osoby z pomocą agenta; czas prawnika, DNS i rekrutacji nie zależy od kodu.
