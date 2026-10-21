# Wdrożenie wielojęzyczności (i18n) i globalnej aplikacji

Stan na 2026-10-21. Plan i zasady, jak z aplikacji po polsku zrobić aplikację wielojęzyczną i globalną: najpierw polski i angielski, potem kolejne języki bez zmian w kodzie. Dokument jest też instrukcją dodawania nowego języka (sekcja 10) i dziennikiem postępu (sekcja 11). Kontekst: [ARCHITEKTURA-I-STAN-PRAC.md](ARCHITEKTURA-I-STAN-PRAC.md), decyzja: [ADR 0013](adr/0013-i18n.md).

Oznaczenia: ✅ zrobione, ⏳ w toku albo następne, ⬜ zaplanowane, ⚠️ pułapka.

## 1. Cel i zasady

Aplikacja ma być globalna: trener i klient widzą interfejs, daty, kwoty i powiadomienia we własnym języku, bez konfiguracji. Docelowo wiele języków; teraz polski (język źródłowy) i angielski.

1. **Język dotyczy osoby, nie szkoły.** Trener i jego klient mogą używać różnych języków. Powiadomienie jest renderowane w języku odbiorcy.
2. **Automatycznie z telefonu lub przeglądarki** (nagłówek `Accept-Language`), z możliwością zmiany w ustawieniach (menu `Więcej` w obu panelach, tak jak powiadomienia push).
3. **Waluta dobiera się automatycznie** z języka i regionu systemowego przy zakładaniu szkoły (np. `pl-PL` → PLN, `en-GB` → GBP, `en-US` → USD, `de-DE` → EUR). Kwoty zostają zapisane w walucie szkoły (to dane, nie widok), więc waluty nie zmienia się per odbiorca. Płatności tylko gotówkowe, żadnych bramek.
4. **Teksty to klucze w katalogach**, nie literały w kodzie. Pełne zdania w kluczach (bez sklejania kawałków), odmiana i formatowanie przez ICU MessageFormat.
5. **Warstwy czyste (`domain`, `application`) nie znają języka**: zwracają klucze i parametry, a tłumaczy dopiero granica UI.
6. **Nowy język to praca nad katalogiem**, nie nad kodem (sprawdzamy to trzecim językiem, etap 6).
7. **Bez wielkiego wybuchu**: migracja modułami, a polski wygląd aplikacji nie zmienia się w trakcie (testy to pilnują).

## 2. Decyzje właściciela (2026-10-21)

| Decyzja | Treść |
| --- | --- |
| Biblioteka | `next-intl` (ADR 0013) |
| Kolejność | Etapy 0-2 od razu (przed oddaniem testerom); etapy 3-4 równolegle do pierwszych tygodni testów; angielski wydajemy po zebraniu pierwszych opinii |
| Wybór języka | Automatycznie z urządzenia, zmiana w `Więcej`, jak powiadomienia push |
| Pierwszy dodatkowy język | Angielski, potem decyzja o kolejnych |
| Płatności | Tylko gotówkowe, bez bramek |
| Waluty | Dobierane automatycznie po języku i regionie systemu/przeglądarki |

## 3. Stan wyjściowy (pomiar 2026-10-21)

Na plus: warstwy (`domain`/`application`/`infrastructure`/`ui`), kody błędów bazy `DT001`-`DT016` neutralne językowo, centralna mapa błędów (`fromDbError`), etykiety w jednym miejscu (`*_LABELS`), plan powiadomień w jednej czystej funkcji (`plan.ts`), kolumny `locale` w `profiles` i `organization_settings`, waluta i strefa czasowa per szkoła, `Money` z walutą.

| Obszar | Stan |
| --- | --- |
| Teksty w UI | około 750 linii z polskimi tekstami w 181 z 212 plików `.ts`/`.tsx` (bez testów); wiele zdań sklejanych z kawałków |
| Formatowanie | `"pl-PL"` na sztywno w około 15 miejscach, `lang="pl"` w `<html>` i w manifeście PWA, `formatIsoDate` zapisuje po polsku (`16.10.2026`), `formatMoney` domyślnie `pl-PL`, `formatDateHeading` po polsku |
| Odmiana | `sessionsWord()` to ręczna odmiana polska |
| Błędy | 80 wywołań `appError(...)` z gotowym polskim tekstem, 86 polskich komunikatów Zod w `domain/` |
| Powiadomienia | **`notifications.title/body` to gotowy polski tekst zapisany w bazie**; e-mail i push biorą go stamtąd |
| SQL | kilka tekstów zapisywanych do rejestrów (np. „Cofnięcie zakończenia zajęć”) |
| Reszta | `public/offline.html` po polsku, wyszukiwanie `ilike` bez ignorowania znaków diakrytycznych, założenie polskiego numeru telefonu (`+48`), lista metod płatności |

## 4. Architektura docelowa

### 4.1. Wybór języka
Kolejność: **cookie `dt_locale`** (ustawia przełącznik w `Więcej`) → **`Accept-Language`** → domyślny (`pl`). Tylko języki z listy włączonych (`ENABLED_LOCALES`, domyślnie `pl`) wchodzą w grę, więc nieukończony język nie jest nikomu pokazywany. Dopasowanie po języku i regionie (`en-GB` → `en`, region zostaje do waluty i formatów).

- **Adresy bez prefiksu języka** w aplikacji (`/app`, `/portal`). Prefiks `/en/...` tylko dla stron publicznych i marketingowych (SEO), osobny etap.
- **Profil:** przy rejestracji zapisujemy wykryty język do `profiles.locale` (metadane `locale` w `signUp` i trigger `handle_new_user`), a zmiana w `Więcej` aktualizuje cookie i `profiles.locale`. `profiles.locale` służy do powiadomień (e-mail, push), bo ich renderowanie nie ma ciasteczka przeglądarki. Istniejące konta zostają przy `pl`.
- **Klient i trener mają niezależne języki.** Domyślny język szkoły (`organization_settings.locale`) ustawiany jest przy jej zakładaniu z języka założyciela i jest tylko wartością zapasową, gdy odbiorca nie ma własnej.

### 4.2. Katalogi tekstów
- `messages/<język>/<moduł>.json`, zgodnie z modułami (każdy moduł ma własną przestrzeń nazw: `clients`, `packages`, `scheduling`..., plus `common`, `errors`, `validation`, `formats`). Granice modułów zostają: moduł używa tylko swojej przestrzeni i `common`.
- Język źródłowy: **polski** (pełny katalog). Zapasowy łańcuch: żądany → `en` → `pl` (do czasu pełnego angielskiego brakujące klucze nie psują widoku). Test w CI sprawdza, że każdy klucz istnieje w każdym **włączonym** języku.
- ICU MessageFormat: odmiana (polskie *one/few/many/other*, angielskie *one/other*), liczby, daty, waluty, wybór (`select`) i listy.
- Komentarze dla tłumaczy przy kluczach (kontekst, miejsce użycia) i glosariusz (sekcja 9).
- Granica klienta: komponenty klienckie dostają tylko potrzebne przestrzenie nazw, żeby nie rosła paczka JS.

### 4.3. `lang` w `<html>` i Cache Components
Aplikacja używa Cache Components i częściowego prerenderingu, a język zależy od żądania (cookie, nagłówek). Dlatego dostawca tłumaczeń jest komponentem serwerowym w `<Suspense>` w głównym layoucie, a atrybut `lang` ustawia się też po stronie klienta po hydracji (`<html lang>` w prerenderowanym szkielecie jest wartością domyślną). Dla stron publicznych i marketingowych (SEO) docelowo używamy trasy z segmentem języka i `generateStaticParams`, gdzie `lang` jest znany w czasie budowania. ⚠️ Czytanie `cookies()`/`headers()` poza `<Suspense>` psuje build, więc każdy komponent z tekstami musi być pod granicą Suspense (to już nasza konwencja).

### 4.4. Błędy i walidacja jako klucze
- `AppError` zachowuje `message` (polski tekst zapasowy, bez zmian wywołań), a **kodowane komunikaty** mają postać klucza z parametrami: `msg("validation.max_length", { max: 100 })` zwraca tekst `validation.max_length|{"max":100}`. Granica UI (`FormMessage`, `TextField`, strony pokazujące `error.message`) tłumaczy każdy napis, który jest takim kluczem, a zwykły tekst wyświetla bez zmian. Dzięki temu można migrować miejsce po miejscu.
- `fromDbError` zwraca klucze (`errors.db.*`) zamiast polskich zdań. Wspólne pomocniki Zod (`formText`, `formInt`, e-mail, hasło...) i komunikaty walidacji w `domain/` używają kluczy.
- Wiadomości nieprzetłumaczone nadal wyświetlają się po polsku (zapasowo), więc nic się nie psuje w trakcie migracji.

### 4.5. Formatowanie: jeden moduł
`shared/i18n/formats`: funkcje przyjmujące język, strefę i walutę: data kalendarzowa, data i godzina, nagłówek dnia, godzina, kwota, liczba, lista, względny czas. Serwer: `getFormats()`, klient: `useFormats()` (oparte o `next-intl`). Zastępują sztywne `pl-PL`, `formatIsoDate`, `formatDateHeading`, `formatMoney`. Funkcje czyste (testowalne) przyjmują `locale` jawnie. Parsowanie kwot (`parseAmountToMinor`) przyjmuje przecinek i kropkę dziesiętną, spacje i twarde spacje jako separator tysięcy. Pierwszy dzień tygodnia i format 12/24 h zależą od języka i regionu.

### 4.6. Waluta, strefa czasowa, region
- Przy założeniu szkoły: `currency` z regionu i języka przeglądarki (tabela: region → waluta, potem język → waluta, zapasowo PLN), `timezone` z przeglądarki (`Intl.DateTimeFormat().resolvedOptions().timeZone` przez ukryte pole formularza), `locale` z języka. Zapisane w `organization_settings` (właściciel może zmienić w ustawieniach szkoły, ekran do dodania).
- Waluta jest atrybutem danych (należności, wpłaty), więc przeliczeń nie robimy; szkoła ma jedną walutę.
- Metody płatności: tylko gotówkowe (gotówka, przelew własny, ewentualnie „inna”); lista `PAYMENT_METHOD_LABELS` trafia do katalogów.

### 4.7. Powiadomienia, e-mail i push (etap 4)
Najważniejsza zmiana architektury. `notifications` przechowuje `message_key` i `params` (nowe kolumny, stare wiersze zachowują `title`/`body` jako tekst zapasowy). `plan.ts` zwraca klucze i parametry. Dzwonek renderuje wpis w języku widza. E-mail i push renderuje procesor outbox w języku odbiorcy (`profiles.locale`), a nie w języku nadawcy. Szablony e-mail (temat, treść, stopka) mają katalog. Strona offline PWA w wielu językach (wybór po `navigator.language`), manifest z `lang` per wdrożenie.

### 4.8. Baza
- Teksty zapisywane do rejestrów (np. opis korekty salda) zamieniamy na **kody powodu** (`reason_code`) renderowane w UI; stare wpisy zostają jako tekst.
- Komunikaty wyjątków SQL są już kodami `DTxxx` (tłumaczone w aplikacji).
- `status_reason` i notatki właściciela platformy to dane wpisywane przez ludzi (nie tłumaczymy). Panel `/admin` zostaje na razie po polsku (narzędzie właściciela).
- Wyszukiwanie i sortowanie: rozszerzenie `unaccent` i kolejność wg ICU, żeby „zoe” znajdowało „Zoë”, a „Łukasz” sortowało się poprawnie.

## 5. Globalność poza tłumaczeniem

| Temat | Plan |
| --- | --- |
| Telefon | biblioteka numerów (libphonenumber-js): normalizacja do E.164, domyślny kraj z regionu przeglądarki, walidacja per kraj (dziś zakładamy `+48`) |
| Płatności | tylko gotówka, bez bramek; faktury i VAT per kraj dopiero przy sprzedaży (patrz `WDROZENIE-PELNE-PRODUKCJA.md`) |
| Prawo | regulamin, polityka prywatności, DPA i zgody per język i jurysdykcja (UE/RODO, UK GDPR, USA); osobne wersje dokumentów z numerem wersji w zgodach |
| Adres i nazwisko | pola imienia i nazwiska bez zakładania kolejności; adres opcjonalny i elastyczny |
| Czas | strefa per szkoła (jest); dni tygodnia i format godzin wg regionu |
| RTL (arabski, hebrajski) | piszemy nowe style właściwościami logicznymi Tailwind (`ms-`/`ps-`/`text-start` zamiast `ml-`/`pl-`/`text-left`); pełne RTL jako osobny etap, gdy będzie taki język |
| SEO | strony publiczne z prefiksem języka, `hreflang`, mapa strony per język |
| E-mail | domena nadawcy i treść per język, stopka z adresem i linkiem do wypisania |

## 6. Plan etapów

Każdy etap to osobny PR (review i zatwierdzenie: właściciel). Szacunki dla jednej osoby z agentem.

### Etap 0. Spike i decyzje ✅ (1 dzień)
- [x] `next-intl` zainstalowane i sprawdzone z Next 16.4, Cache Components i `proxy.ts` (konfiguracja bez routingu językowego, dostawca w `<Suspense>`).
- [x] ADR 0013 (biblioteka, wybór języka, model błędów, powiadomienia, glosariusz).
- [x] Ten dokument.

### Etap 1. Fundament ✅ (2-3 dni, zrobiony 2026-10-21)
- [x] Dodane zależności i konfiguracja (`src/i18n/*`), `ENABLED_LOCALES`.
- [x] Rozpoznawanie języka (`cookie → Accept-Language → domyślny`) z testami jednostkowymi; mapa region → waluta z testami.
- [x] Główny layout: dostawca tłumaczeń w `<Suspense>`, `lang` ustawiany po hydracji.
- [x] Przełącznik języka w `Więcej` (trener i klient): cookie + `profiles.locale`; widoczny, gdy włączone są co najmniej dwa języki.
- [x] Rejestracja zapisuje wykryty język do `profiles.locale`.
- [x] Moduł formatowania (`shared/i18n/formats`), `getFormats()`/`useFormats()`; literalne `pl-PL` usunięte z paneli trenera i klienta (panel `/admin` zostaje po polsku). `formatIsoDate`, `formatDateHeading` i `formatMoney` przyjmują język jawnie (domyślnie polski); ich wywołania (16 + 16 + 48 miejsc) przechodzą na formatery razem z modułami w etapie 3. Parsowanie kwot z kropką i przecinkiem działało już wcześniej.
- [x] Szkoła: `currency`, `timezone`, `locale` z urządzenia przy zakładaniu. Znalezione przy okazji: kolumny `currency` miały stałe `'PLN'`, więc dodany trigger `app.apply_school_currency` ustawia walutę szkoły na nowych rekordach (migracja 0012).
- [x] Test parzystości kluczy katalogów (`src/i18n/catalog.test.ts`: te same klucze i parametry w każdym języku, każdy `msg(...)` z kodu istnieje w katalogu).
- [ ] Ekran ustawień szkoły (waluta, strefa, język domyślny) i blokada zmiany waluty, gdy są rekordy z kwotami: do zrobienia w etapie 3 (wymaga katalogów).
- [ ] Przeklikanie rejestracji i zakładania szkoły przy `ENABLED_LOCALES=pl,en` z urządzeniem w innym języku i regionie oraz na prawdziwym telefonie: do zrobienia (sprawdzone w przeglądarce: przełącznik w `Więcej`, zapis cookie i `profiles.locale`, `lang` w `<html>`, angielskie błędy walidacji).

### Etap 2. Błędy i walidacja ✅ (2 dni, zrobiony 2026-10-21)
- [x] Mechanizm kluczy komunikatów (`msg()`, tłumaczenie na granicy UI) z testami.
- [x] `fromDbError`, pomocniki Zod i komunikaty walidacji w `domain/` na klucze; wszystkie 80 wywołań `appError` (z częścią komunikatów pól) na klucze.
- [x] Katalogi `errors`, `validation` i `common` po polsku (źródło) i angielsku (kompletne).
- [ ] Komunikaty tworzone w warstwie aplikacji (`src/app`, np. teksty w akcjach zaproszeń: `MESSAGES`), etykiety (`*_LABELS`), powiadomienia i e-maile: zostają po polsku do etapów 3-4 (to zwykły tekst, więc przechodzi przez granicę UI bez zmian).

### Etap 3. Wyciągnięcie tekstów ✅ część UI (zrobione 2026-10-21, PR `feat/i18n-ui-texts`)
Zrobione półautomatem (codemod na drzewie składni TypeScript, potem ręczne dopracowanie zdań z formatowaniem): **680 kluczy w 17 przestrzeniach** (`common`, `errors`, `validation`, `feedback`, `labels`, `shared`, `auth`, `marketing`, `trainer`, `portal`, `clients`, `dogs`, `packages`, `payments`, `scheduling`, `notifications`, `invitations`), tylko katalog `pl` (aplikacja wygląda tak samo; sprawdzone w przeglądarce w panelu trenera i klienta).
- [x] Teksty komponentów (JSX, atrybuty `label`/`title`/`description`/`hint`/`confirmLabel`/`pendingLabel`, gałęzie warunków) na klucze `t("przestrzeń.plik.klucz")`; wspólne napisy (powtarzające się w co najmniej dwóch plikach) w `common`.
- [x] Zdania z formatowaniem (pogrubienie, link) jako `t.rich`; odmiana (zajęcia) i warianty (`select`) w ICU; poprawiono przy okazji „zaprasza Cię do panelu klienta,.” (brak imienia).
- [x] Etykiety z domeny (`*_LABELS`: statusy, role, metody płatności, powody wpisów) w przestrzeni `labels`; użycia w UI zamienione na `t(`labels.<mapa>.${wartość}`)` (mapy w `domain/` zostają dla powiadomień i panelu właściciela).
- [x] Komunikaty sukcesu akcji serwerowych (`feedback.*`) i błędy zaproszeń (`errors.invite.*`) jako klucze tłumaczone przez `Msg`; wiek psa (`dogs.age.*`), nazwy osób w zespole (UI decyduje o „Ty” i „Użytkownik bez imienia”).
- [x] Wywołania `formatMoney`/`formatIsoDate`/`formatDateHeading(Title)` w komponentach na `formats.*` (27 miejsc; komponenty serwerowe, które były synchroniczne, stały się asynchroniczne).
- [x] Test: każdy klucz użyty w kodzie (`msg`, `t`, `tr`, `t.rich`) istnieje w katalogu; każdy plik katalogu jest w `NAMESPACES`; język niekompletny nie ma kluczy spoza źródła.
- [x] Powiadomienia, e-maile, metadane, manifest i strona offline: zrobione w etapie 4. Zostaje na kolejne etapy: panel `/admin` zostaje po polsku (narzędzie właściciela); teksty zależne od kraju: wzmianka o BLIK i przelewie na stronie płatności klienta, podpowiedź o numerze polskim (`+48`) przy telefonie (etap 5, razem z decyzją „tylko gotówka”); ekran ustawień szkoły (waluta, strefa, język domyślny) i blokada zmiany waluty przy istniejących rekordach z kwotami.
- Uwagi: nazwy kluczy powstały automatycznie ze skrótu polskiego tekstu (np. `trainer.clientsBillingSection.historia_i_korekta`), więc przy zmianie sformułowania klucz zostaje; przy tłumaczeniu liczy się wartość, nie nazwa. Do klienta trafia cały katalog (ok. 46 KB, kilkanaście KB po kompresji); podział na paczki per grupa tras to optymalizacja na później. Pozostają krótkie polskie wstawki w kodzie, które nie są tekstem interfejsu (np. komunikaty logów).

### Etap 4. Powiadomienia i e-mail ✅ (zrobione 2026-10-21, PR `feat/i18n-notifications`)
Powiadomienia składane są z klucza i parametrów w języku odbiorcy; polski tekst nie jest już zapisywany w kodzie planowania.
- [x] Migracja 0013: `notifications.message_key` (prosty identyfikator) i `message_params` (obiekt JSON); `title`/`body` zostają jako tekst zapasowy (starsze wpisy, klucz nieznany nowszej wersji). Test pgTAP `notification_messages.test.sql` (ograniczenia, odczyt przez odbiorcę, brak prawa zmiany klucza i parametrów).
- [x] `plan.ts` zwraca `messageKey` + `params` (surowe wartości: kwota w groszach, moment w UTC, strefa szkoły, nazwy); usunięto `sessionsWord` (odmiana to ICU `plural` w katalogu).
- [x] Katalog `messages/pl/notify.json` (przestrzeń `notify`: `notify.<klucz>.title|body`, 19 komunikatów, odmiana zajęć, warianty `select` dla opcjonalnych części). `domain/render.ts`: `localizeParams` (kwota → `amount`, `startsAt` + `timezone` → `date`/`time`, `dueDate` → `due`, `accessUntil` → `until`, flagi → `yes`/`no`), `renderNotification`, `renderExternalMessage` z podpisem linku w języku odbiorcy.
- [x] Procesor outbox: język odbiorcy z `profiles.locale` (tylko spośród języków włączonych w `ENABLED_LOCALES`, inaczej polski); tekst zapisany w skrzynce, e-mail i push w tym języku. Tłumacz poza żądaniem: `src/shared/i18n/translator.ts` (`createTranslator` + katalogi, cache na język).
- [x] Dzwonek składa treść z klucza w języku, który widz ma teraz (zmiana języka w `Więcej` zmienia też stare powiadomienia); wpisy bez klucza pokazują zapisany tekst.
- [x] E-maile zaproszeń (klient, zespół) z katalogu `invitations.emails.*`, w języku szkoły (`organization_settings.locale`, nowe pole w `OrganizationSettings`); osoba zapraszana nie ma jeszcze konta ani języka. Rola w zaproszeniu do zespołu z `labels.memberRole`.
- [x] Opis strony (`generateMetadata` w `layout.tsx`), tytuł `/suspended` i manifest PWA (`lang`, opis, skróty; trasa dynamiczna) w języku żądania; strona offline (`public/offline.html`) wybiera język po ciasteczku `dt_locale` albo `navigator.language` (polski, angielski).
- [x] Testy: `plan.test.ts` (klucze i parametry), `infrastructure/render.test.ts` (dawny polski tekst z katalogu, odmiana 0/1/2/5/12/22, opcjonalne części, dane użytkownika nie są szablonem, pokrycie kluczy, zapas polski), `message.test.ts` (zaproszenia), integracyjne: zapis klucza i parametrów, e-mail w języku odbiorcy, język niewłączony daje polski.
- [ ] Zostaje: kody powodu (`reason_code`) w rejestrach SQL zamiast tekstu (opis korekty salda i podobne): osobna zmiana razem z tłumaczeniem angielskim (etap 5); w `en` trzeba pisać apostrof jako `''` (ICU). `sw.js` ma jeszcze jeden polski tekst zapasowy („Brak połączenia”, odpowiedź 503 bez sieci i bez strony offline).

### Etap 5. Angielski ✅ wersja robocza (2026-10-21, PR `feat/i18n-english`), ⏳ przegląd człowieka
Angielski jest kompletny i włączony: w `Więcej` pojawia się wybór języka (`ENABLED_LOCALES=pl,en` w `.env.example`; bez zmiennej działa tylko polski).
- [x] Katalog `messages/en/` dla wszystkich 18 przestrzeni (742 klucze, w tym `notify`, e-maile zaproszeń, `labels`, `feedback`); parytet kluczy i parametrów ICU pilnuje `catalog.test.ts` (`COMPLETE_LOCALES` wymusza kompletność `en` niezależnie od `ENABLED_LOCALES`).
- [x] Tłumaczenie robocze (AI) z terminologią: package = pakiet, session = zajęcia, open slot = wolny termin, waitlist = lista chętnych, amount due = należność, reverse a payment = storno wpłaty, client area/trainer area = panel klienta/trenera.
- [x] Teksty zależne od kraju: usunięto wzmiankę o BLIK i przelewie na stronie płatności klienta (pl i en), w polach kwot nie ma już „(zł)” w wersji angielskiej. Etykieta metody płatności „BLIK” zostaje w liście metod (dane, nie tekst interfejsu). Podpowiedź o numerze bez prefiksu zapisuje „Polish (+48)”: zostaje do zmiany razem z biblioteką numerów (sekcja 5).
- [x] Przy przeklikaniu angielskiego znaleziono i poprawiono pominięte teksty: „Organizacja:” na pulpicie trenera, „od ...” przy koncie klienta, „..., termin ...” przy zaległościach, potwierdzenia próśb klienta (były polskie, teraz klucze `labels.requestConfirmation.*`), „Klient” w zapasowej nazwie. Skrypt AST szukający tekstu JSX poza katalogiem nie znajduje już nic (poza panelem `/admin`).
- [ ] Zostaje: przegląd języka przez osobę znającą branżę (nazwy własne, ton), pseudo-lokalizacja do wykrycia przepełnień układu, przeklikanie na telefonie, strony publiczne i prawne po angielsku, format daty zależny od regionu (profil zna tylko język, więc `en` = zapis amerykański 10/21/2026; w przeglądarce region z `Accept-Language` jest brany pod uwagę).
- Uwaga: Vite buforuje rozwinięcie dynamicznego `import()` katalogów, więc po dodaniu plików nowego języka zmień `src/i18n/messages.ts` (albo usuń `node_modules/.vite`), inaczej testy nie zobaczą nowych plików.

### Etap 6. Trzeci język ⬜ (1-2 dni)
Test skalowalności (np. niemiecki lub hiszpański): ma wymagać wyłącznie pracy nad katalogiem i listą włączonych języków. Wnioski zapisać w sekcji 10.

## 7. Zabezpieczenia jakości
- Test parzystości: każdy klucz ze źródłowego katalogu istnieje we wszystkich włączonych językach (w CI i lokalnie `npm test`).
- Test składni ICU: katalog parsuje się, parametry zgadzają się między językami.
- Reguła lint: brak polskich znaków w literałach JSX w katalogach oznaczonych jako zmigrowane.
- Testy jednostkowe: wybór języka, region → waluta, formatery (daty, kwoty, odmiana), kodowane komunikaty.
- Testy integracyjne (etap 4, zrobione): język odbiorcy w powiadomieniach.
- Przeklikanie: `pl`, `en` i pseudo-język; długie teksty (niemieckie złożenia, angielskie przyciski w wąskich komórkach).

## 8. Ryzyka
| Ryzyko | Jak ograniczamy |
| --- | --- |
| Jakość tłumaczeń terminologii (pakiet, zajęcia, szkoła) | glosariusz (sekcja 9), przegląd człowieka, komentarze dla tłumaczy |
| Zdania sklejane z kawałków (`zostało {n} {słowo}`) | pełne zdania z odmianą ICU, lint na konkatenację w migrowanych plikach |
| Cache Components a język z żądania | dostawca w `<Suspense>`, `lang` po hydracji; strony publiczne z segmentem języka |
| Paczka JS rośnie z katalogami | przestrzenie nazw per moduł, do klienta tylko potrzebne |
| Polskie dane historyczne w bazie (powiadomienia, opisy) | zostają jako tekst zapasowy, bez backfillu; nowe wpisy w kluczach |
| Regresja wyglądu `pl` | migracja najpierw tylko do katalogu `pl` z testami i przeklikaniem |
| Nieukończony język widoczny dla użytkowników | `ENABLED_LOCALES` (język niewidoczny, dopóki nie jest gotowy) |

## 9. Słownik (polski → angielski)
Przy tłumaczeniu trzymaj spójność. Jedno pojęcie, jedno tłumaczenie.

| Polski | Angielski | Uwagi |
| --- | --- | --- |
| trener, asystent, właściciel | trainer, assistant, owner | role w szkole |
| szkoła (organizacja) | school | nazwa firmy trenera |
| klient (kartoteka) | client | także w panelu klienta |
| pies | dog | |
| zajęcia (pojedyncze) | session | „training session” w pełnych zdaniach |
| pakiet zajęć | package | „session package”, saldo = „sessions left” |
| saldo | balance | |
| należność | charge (amount due) | |
| wpłata, storno wpłaty | payment, void payment | |
| odwołać, przywrócić zajęcia | cancel, restore session | |
| zakończyć zajęcia, cofnij | complete session, undo | |
| wolny termin | open slot | |
| lista chętnych | waitlist | |
| „Biorę” | “I’ll take it” | przycisk klienta |
| prośba klienta | client request | |
| zaproszenie, kod zaproszenia | invitation, invite code | |
| zespół | team | |
| panel trenera, panel klienta | trainer app, client portal | |
| tylko do odczytu, zawieszone | read-only, suspended | stany szkoły (panel właściciela) |
| powiadomienia push | push notifications | |

## 10. Jak dodać nowy język (docelowa procedura)
1. Dodaj kod języka do listy obsługiwanych (`src/i18n/config.ts`) i region → waluta, jeśli brakuje.
2. Skopiuj `messages/pl/*` do `messages/<język>/*` i przetłumacz (AI + przegląd), trzymając się słownika.
3. Uruchom test parzystości i składni ICU; popraw braki.
4. Przeklikaj panel trenera i klienta, powiadomienia (dzwonek, e-mail, push) i stronę offline.
5. Dodaj język do `ENABLED_LOCALES` (staging, potem produkcja).
6. Dodaj dokumenty prawne i stronę marketingową w tym języku.
Po etapie 6 zapisz tu, ile to faktycznie zajęło i co trzeba było poprawić w kodzie.

## 11. Dziennik
- 2026-10-21 (etap 5, angielski): katalog `en` kompletny i włączony, 229 testów jednostkowych, 139 integracyjnych, build, przeklikanie panelu trenera i klienta po angielsku. Szczegóły w sekcji etapu 5.
- 2026-10-21 (etap 4): powiadomienia, e-maile zaproszeń, metadane, manifest i strona offline w języku odbiorcy; 228 testów jednostkowych, 239 pgTAP, 139 integracyjnych, build, przeklikanie dzwonka. Szczegóły w sekcji etapu 4.
- 2026-10-21 (etap 3, część UI): 680 kluczy `pl`, codemod + ręczne dopracowanie, testy 207 jednostkowych, 136 integracyjnych, build, przeklikanie panelu trenera i klienta (bez przecieku kluczy). Szczegóły w sekcji etapu 3.
- 2026-10-21: plan, [ADR 0013](adr/0013-i18n.md), etapy 0-2 (PR `feat/i18n-foundation`). Migracja 0012 (język profilu z rejestracji, waluta szkoły na nowych rekordach). Testy: 29 jednostkowych formatów/języka/komunikatów + 5 katalogów, 9 pgTAP, 3 integracyjne (język w profilu, ustawienia szkoły z urządzenia, waluta rekordów). Etapy 3-6 zaplanowane. Angielski niewidoczny dla użytkowników do czasu etapu 5 (`ENABLED_LOCALES=pl`); lokalnie `ENABLED_LOCALES=pl,en` w `.env.local` pokazuje przełącznik.
