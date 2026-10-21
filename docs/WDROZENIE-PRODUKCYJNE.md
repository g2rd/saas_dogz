# Wdrożenie na produkcję i start sprzedaży: kroki, limitacje, ryzyka

Stan na 2026-10-21 (`origin/dev` = `ee20159`). Dokument uzupełnia `ARCHITEKTURA-I-STAN-PRAC.md` (sekcja 8 to szczegółowa lista zadań; tu jest ułożona ścieżka do pierwszej sprzedaży, z bramkami „nie sprzedajemy, dopóki…”). Statusy: ✅ jest, 🟡 częściowo, ❌ brak.

## 1. Gdzie jesteśmy

Działa lokalnie: rejestracja i logowanie, klienci i psy, pakiety i płatności (ewidencja przez trenera, ze stornem wpłaty i anulowaniem pakietu), zajęcia z rozliczaniem pakietu i cofaniem pomyłek, wolne terminy z listą chętnych, zaproszenia klientów (QR, link, kod, e-mail), panel klienta `/portal`, powiadomienia po obu stronach (dzwonek, web push, e-mail), prośby klientów, zespół i zaproszenia personelu, PWA z panelem trenera na telefonie, potwierdzenia wrażliwych operacji. 184 testy pgTAP, 121 integracyjnych, 163 jednostkowe (szczegóły: `ARCHITEKTURA-I-STAN-PRAC.md`).

Nie ma: hostingu, CI, płatnego abonamentu (Stripe), regulaminu i RODO, planów i limitów, zadań domowych, monitoringu, kopii zapasowych, aplikacji w sieci pod żadnym adresem, importu klientów, seedu demo; push i instalacja PWA nie były sprawdzone na prawdziwym telefonie.

**Decyzje właściciela:** bez SMS; najpierw 2 tygodnie testów bez płatności, potem opłaty, jeśli komuś się spodoba; freemium, plany i Stripe odłożone; natywna aplikacja po walidacji (patrz sekcja 7).

## 2. Ścieżka do pierwszej płatnej sprzedaży

Kolejność ma znaczenie: bramki (🚧) blokują kolejne kroki.

### Faza A. Fundament bezpieczeństwa i jakości (przed jakimkolwiek zewnętrznym użytkownikiem)
1. 🚧 **CI w GitHub Actions** ❌: typecheck, lint, testy jednostkowe, `supabase test db`, testy integracyjne (z lokalnym Supabase w kontenerze), granice modułów, build; blokada scalania do `dev`/`main` przy czerwonym CI.
2. 🚧 **Przegląd zależności**: `npm audit` zgłaszał 5 podatności o wysokiej wadze w scaffoldzie (nie były przeglądane), Dependabot, przypięcie wersji.
3. 🚧 **Audyt RLS i funkcji `security definer`** 🟡: każda tabela ma politykę i test pgTAP, ale potrzebny jest przegląd z perspektywy atakującego (ręczne próby przez API z kluczem anon: odczyt cudzych danych, podmiana `organization_id`, wywołania funkcji bez roli). Sprawdzić, czy żadna funkcja nie jest wywoływalna przez `anon`/`public` bez potrzeby, i czy testy cross-tenant pokrywają **każdą** tabelę.
4. **Limity prób i ochrona przed nadużyciami** ❌: ograniczanie logowania, rejestracji, resetu hasła, wysyłki zaproszeń e-mailem i odczytu zaproszeń per IP (dziś tylko globalny licznik w bazie dla zaproszeń). Captcha lub ograniczenie rejestracji (Turnstile). Zaproszenie e-mailem jest dziś nieograniczone: trener może zalać cudzą skrzynkę.
5. **Nagłówki i CSP** ❌, `error.tsx` i `not-found.tsx` dla panelu ❌, obsługa wygasłej sesji (komunikat zamiast „Brak uprawnień”, zaobserwowany przy przyjęciu zaproszenia po wylogowaniu), linki powrotu na podstronach w trybie `standalone` PWA.
6. **Typy bazy generowane** ❌ (`npm run db:types`): repozytoria mają ręczne typy wierszy, więc zmiana schematu nie wywoła błędu kompilacji.
7. **Zapisy do `audit_log` z przypadków użycia** 🟡: funkcje SQL zapisują m.in. zaproszenia, zajęcia, wpłaty, storna, cofnięcia i ogłoszenia, ale nie wszystko (np. edycje klienta); brak ekranu historii zmian. Potrzebne do rozliczalności i RODO.

### Faza B. Infrastruktura produkcyjna
8. 🚧 **Środowiska**: osobne projekty Supabase dla staging i produkcji w UE (Frankfurt), Vercel w regionie `fra1` (lub inny hosting Node 24), domeny (`app.`, strona marketingowa), HTTPS. Migracje wdrażane z CI (nigdy ręcznie na produkcji).
9. **Sekrety i konfiguracja**: osobne `SUPABASE_SERVICE_ROLE_KEY`, `INVITATION_HASH_SECRET` (zmiana unieważnia oczekujące zaproszenia), `CRON_SECRET`, klucze VAPID (nowe, nie lokalne), `RESEND_API_KEY`, `NEXT_PUBLIC_SITE_URL`, lista dozwolonych przekierowań w Supabase Auth. Rotacja i zasady przechowywania (menedżer sekretów, nie czat).
10. 🚧 **Własny SMTP / domena nadawcy dla e-maili**: konto Resend, weryfikacja domeny (SPF, DKIM, DMARC), adres nadawcy. Bez tego e-maile (reset hasła, zaproszenia, powiadomienia) trafią do spamu lub nie dojdą. Supabase Auth też musi używać własnego SMTP (domyślny ma twarde limity).
11. 🚧 **Harmonogram dla `/api/cron/outbox`**: bez niego **nie ma żadnych powiadomień** (lokalnie robi to pętla `next dev`). Co minutę lub rzadziej: Vercel Cron minutowy według mojej wiedzy wymaga planu Pro (do zweryfikowania), alternatywa to zewnętrzny harmonogram wołający trasę z `CRON_SECRET`. Alert, gdy trasa zwraca 500 (zdarzenia zalegają).
12. **Włączenie potwierdzenia e-mail** w Supabase Auth (lokalnie wyłączone): przeklikać rejestrację, zaproszenie klienta i zaproszenie personelu z potwierdzeniem (nie było testowane).
13. **Kopie zapasowe** ❌: dzienne kopie Supabase, cotygodniowy zaszyfrowany zrzut poza dostawcą, **test przywracania** przed startem (kopia, której nie odtworzono, nie istnieje). Rozważyć PITR.
14. **Monitoring** ❌: Sentry (z usuwaniem danych osobowych), logi strukturalne z `request_id` i `organization_id`, monitor dostępności, alerty: błędy zadań, rosnący outbox, błędy dostarczania e-maili, wolne zapytania.
15. **Wydajność RLS**: indeksy poza podstawowymi i zachowanie na dużych zbiorach nie były mierzone. Test obciążeniowy na kilkuset organizacjach z danymi syntetycznymi.

### Faza C. Prawo i zgodność (bez tego nie wolno pobierać pieniędzy ani danych)
16. 🚧 **Regulamin, polityka prywatności, umowa powierzenia przetwarzania danych (trener jest administratorem danych swoich klientów, my procesorem)**, wzór zgody na wizerunek (filmy z psami i właścicielami) ❌. Konsultacja z prawnikiem. Akceptacja regulaminu przy rejestracji (`legal_documents`, `consents`) ❌.
17. **RODO operacyjnie** ❌: eksport danych klienta i organizacji, usuwanie i retencja (dziś brak twardego usuwania, tylko archiwizacja), rejestr czynności, procedura incydentu (72 h), lista podprocesorów (Supabase, Vercel, Resend, ewentualnie Stripe), wpisy w umowie powierzenia.
18. **Księgowość i VAT** ❌: forma działalności, VAT na abonament (ceny 49/79/119 zł są netto), faktury (Fakturownia lub Stripe Invoicing), konsultacja z księgowym, regulamin sprzedaży B2B.
19. **Znak towarowy i domena**, adres kontaktowy i support (skrzynka, SLA „best effort”).

### Faza D. Model sprzedaży (żeby było co sprzedawać)
20. 🚧 **Rozliczenia SaaS** ❌: Stripe Billing (abonament, portal klienta, ponawianie nieudanych płatności, webhooki weryfikowane podpisem), tabele `plans`, `plan_entitlements`, `subscriptions`, `billing_events`.
21. **Okres próbny 14 dni bez karty**, tryb tylko do odczytu po jego końcu, funkcje `can(org, feature)` i `limit(org, klucz)` wymuszane w bazie, nie tylko w UI.
22. **Samodzielna rejestracja z listą kroków aktywacji** (dodaj klienta, sprzedaj pakiet, zaproś klienta), puste stany i podpowiedzi. Dziś onboarding kończy się na kreatorze organizacji.
23. **Strona marketingowa z cennikiem** ❌ (dziś pusta strona główna), formularz kontaktowy, analityka (PostHog) po zgodzie na cookies.
24. **Import klientów z CSV/Excela** ❌: trener z 100 klientami nie wpisze ich ręcznie; to realna bariera wejścia.
25. **Oferta Founding Member** i umowy z 5-10 pilotażystami (cena, warunki, zgoda na kontakt i opinie).

### Faza E. Produkt, który da się sprzedać trenerowi
26. **PWA i telefon** ✅ kod gotowy (manifest, ikony, service worker, instalacja, widok „Dziś”, dolna nawigacja trenera i klienta, menu „Więcej”); 🚧 **test na prawdziwych telefonach** (Android i iPhone, push) po wdrożeniu stagingu z HTTPS.
27. **Seed demo i „sterowanie demo”** ❌: pokaz obiegu na żywo w minutę.
28. **Kalendarz poza minimum** 🟡 (są wolne terminy z listą chętnych i „Nie mogę przyjść”; brakuje): widoki dzień/tydzień, edycja i przeniesienie terminu, serie cykliczne, zajęcia grupowe z limitem miejsc, nieobecność (`no_show`), kanał ICS. Dla trenera szkoły grupowej brak zajęć grupowych może przekreślić produkt.
29. **Zadania domowe z filmami** ❌ (obiecywane w opisie produktu): wymaga Storage, limitów, kompresji i retencji; największe ryzyko kosztowe. Można świadomie wyciąć z pierwszej oferty.
30. **Płatności online od klientów** ❌: dziś klient tylko widzi, ile i kiedy ma zapłacić, a trener księguje wpłatę ręcznie. Wielu trenerów będzie tego oczekiwać; to osobny moduł (Stripe Connect lub BLIK przez operatora) z konsekwencjami prawnymi.
31. **Przełącznik organizacji** ❌ (osoba w kilku szkołach trafia do pierwszej), zmiana roli i zawieszanie członków zespołu ❌, zwrot wpłaty ❌ (storno wpłaty i anulowanie nieużytego pakietu są gotowe).
32. **Dostępność i wersje językowe**: przegląd WCAG dla formularzy, `next-intl` (na start tylko polski).

### Faza F. Walidacja i start
33. 🚧 **10-15 wywiadów z trenerami**, weryfikacja cen 49/79/119 zł (to hipotezy), 5-10 pilotażystów na warunkach Founding Member. Zbierać, czego brakuje, zanim zbudujesz kolejne moduły.
34. **Pilotaż na produkcji** z realnymi danymi 1-2 tygodnie, codzienny przegląd błędów i outboxu, szybka ścieżka naprawy (hotfix z `dev` przez `main`).
35. **Plan wsparcia i komunikacji**: kanał zgłoszeń, status systemu, powiadomienie klientów o awarii, procedura wyłączenia funkcji.
36. **Dopiero potem** publiczna sprzedaż: kampania, polecenia, raporty dla trenera, plan „Szkoła” (wielu trenerów z widocznością klientów per trener — wymaga zmiany polityk RLS).

## 3. Limitacje obecnego stanu (co aplikacja dziś NIE robi)

**Powiadomienia i kanały**
- Powiadomienia działają tylko tam, gdzie ktoś woła `/api/cron/outbox`. Opóźnienie: do minuty (cron) zamiast „na żywo”; brak WebSocketów, widok odświeża się przy nawigacji.
- **Brak SMS** (decyzja właściciela): kanały to dzwonek, web push i e-mail. Klient bez zainstalowanej PWA (iPhone) dostanie tylko e-mail i dzwonek w aplikacji.
- **Web push nie był sprawdzony na prawdziwym telefonie.** Na iPhonie działa dopiero po dodaniu aplikacji do ekranu głównego (iOS 16.4+). Subskrypcje wygasają i bywają odrzucane.
- Powiadomienia wywołane przez trenera idą z opóźnieniem 30 s (okno „Cofnij”).
- E-maile to prosty HTML, bez szablonów, bez wypisania się ani godzin ciszy nocnej; brak podsumowania dziennego (przy wielu klientach dostajesz każde powiadomienie osobno).
- Brak ponowień poza 5 próbami; zdarzenie po 5 próbach zalega, a ktoś musi to zauważyć (alert nie jest wdrożony).
- `payment.recorded` zakłada walutę PLN.

**Płatności i rozliczenia**
- Klient **nie płaci w aplikacji**. Wpłaty księguje trener ręcznie; jest storno wpłaty, ale brak zwrotów.
- Jedna waluta na organizację w praktyce. Brak faktur i paragonów generowanych z aplikacji.
- Przyciski „Zapłacę” / „Odnów pakiet” / „Kończę współpracę” / „Nie mogę przyjść” są **tylko informacją dla trenera**: nic nie odnawia się, nie kończy ani nie odwołuje automatycznie (decyzja właściciela).

**Dane i uprawnienia**
- Każdy członek organizacji widzi **wszystkich** klientów (widoczność per trener dopiero z planem Szkoła). Asystent nie widzi płatności ani notatek o psach, ale widzi klientów.
- Brak zmiany roli i zawieszania członków zespołu, brak przełącznika organizacji (wielu szkół).
- Brak twardego usuwania (tylko archiwizacja); brak eksportu danych i procedur RODO.
- Brak zadań domowych, filmów, kursów, importu, raportów.

**Zajęcia**
- Tylko zajęcia indywidualne, jedna lokalizacja jako tekst, bez serii, grup, przenoszenia terminu (jest odwołanie, przywrócenie i ogłoszenie wolnego terminu), nieobecności i integracji z Google Calendar.
- Wolny termin przydziela trener (nie automat); lista chętnych jest ogólna (bez preferencji dni i godzin).
- Przypomnienie o zajęciach liczy się z `reminder_hours_before` organizacji; brak ustawień per klient.

**Aplikacja i operacje**
- PWA (manifest, instalacja, strona offline, push) jest w kodzie, ale **niesprawdzona na prawdziwych telefonach**; pełnego trybu offline nie ma (offline to tylko strona z komunikatem, dane zawsze z serwera).
- Brak CI, hostingu, monitoringu, kopii zapasowych, strony marketingowej, rozliczeń SaaS, planów i limitów, okresu próbnego, importu klientów, seedu demo.
- Cofnięcie zakończenia zajęć działa tylko do końca dnia; po północy zostaje korekta salda pakietu. Brak ekranu historii zmian.
- Typy bazy nie są generowane; część zachowań (np. czas wygasania pakietu zadaniem dziennym) nie jest zaimplementowana (`expiry`).
- Next.js 16 z Cache Components jest nowy; **zmiany łamiące względem dokumentacji publicznej** (pilnuje tego `AGENTS.md`); aktualizacje frameworka mogą wymagać pracy.
- Zaproszenie klienta: sekret widoczny tylko raz (po odświeżeniu trzeba utworzyć nowe zaproszenie, które unieważnia poprzednie); brak magic linku.

## 4. Ryzyka

Skala: **W** wysokie, **Ś** średnie, **N** niskie (prawdopodobieństwo × skutek, moja ocena).

**Bezpieczeństwo i dane**
| # | Ryzyko | Ocena | Ograniczenie |
| --- | --- | --- | --- |
| R1 | Błąd RLS lub funkcji `security definer` ujawnia dane innej organizacji (dane klientów, **zdrowie i zachowanie psów**, płatności) | W | Audyt zewnętrzny lub przegląd „red team”, testy cross-tenant dla każdej tabeli i funkcji, zasada: nowa tabela = polityka + test |
| R2 | Wyciek klucza `service_role` (omija RLS) | W | Tylko po stronie serwera, reguła boundaries, rotacja, brak w repozytorium i czacie; osobne klucze per środowisko |
| R3 | Nadużycie zaproszeń i e-maili (spam, zgadywanie kodów, enumeracja kont) | Ś | Limity per IP, captcha, kod 50 bitów + globalny licznik (jest), monitoring |
| R4 | Wyciek lub utrata danych bez kopii | W | Kopie + test przywracania, PITR, szyfrowanie zrzutów |
| R5 | Niezgodność z RODO (dane osobowe i wizerunek w Polsce) | W | Umowa powierzenia, eksport i usuwanie, rejestr, lista podprocesorów, konsultacja prawna |
| R6 | Podatności w zależnościach (5 wysokich zgłoszonych) | Ś | Dependabot, `npm audit` w CI |

**Operacyjne**
| # | Ryzyko | Ocena | Ograniczenie |
| --- | --- | --- | --- |
| R7 | Brak harmonogramu outboxu = ciche „brak powiadomień” (kluczowa obietnica produktu) | W | Cron + alert na 500 i na wiek najstarszego niezałatwionego zdarzenia |
| R8 | E-maile w spamie / niedostarczone (domena, SPF/DKIM) | W | Własna domena, Resend, monitoring odbić, dziennik dostarczeń jest |
| R9 | Awaria jednej osoby: **jeden deweloper**, brak zastępstwa | W | ADR-y, testy, automatyzacja wdrożeń, dokumentacja stanu (są), uproszczony zakres |
| R10 | Dług techniczny i zmiany łamiące w Next 16 / Supabase | Ś | Przypięte wersje, CI, aktualizacje partiami |
| R11 | Skalowanie: wydajność RLS i indeksy niezmierzone; koszt zapytań na kartach z wieloma relacjami | Ś | Test obciążeniowy, `EXPLAIN` na krytycznych zapytaniach |
| R12 | Brak monitoringu = o awarii dowiemy się od klienta | W | Sentry, monitor dostępności, alerty |

**Biznesowe**
| # | Ryzyko | Ocena | Ograniczenie |
| --- | --- | --- | --- |
| R13 | **Ceny 49/79/119 zł i rynek to hipotezy**, nie walidowane | W | Wywiady, pilotaż Founding Member, test cen |
| R14 | Trenerzy nie przejdą z arkusza/zeszytu/WhatsAppa bez importu i telefonu pod ręką | W | Import CSV, PWA i widok „Dziś”, onboarding |
| R15 | Brak płatności online od klientów obniża wartość („i tak muszę pilnować przelewów”) | Ś | Rozważyć jako pierwszy dodatek po pilotażu |
| R16 | Koszt wideo (przechowywanie i transfer) przy zadaniach domowych | W (gdy ruszą) | Limity per plan, kompresja, retencja; nie włączać przed wyliczeniem kosztu |
| R17 | Niezawodność web push na iOS (wymaga instalacji PWA); bez SMS klient bez aplikacji dostaje tylko e-mail | Ś | Instalacja PWA jako część onboardingu, e-mail jako kanał zapasowy, ewentualnie push natywny |
| R18 | Konkurencja (gotowe systemy dla szkół psów i ogólne kalendarze) | Ś | Wąski, dopracowany rdzeń: pakiety, saldo, obustronne monity |
| R19 | Zależność od dostawców (Supabase, Vercel, Resend, Stripe) i ich limity/cennik | Ś | Moduły za interfejsami (adaptery), eksport danych, monitoring kosztów |

**Prawne i księgowe**
| # | Ryzyko | Ocena | Ograniczenie |
| --- | --- | --- | --- |
| R20 | Pobieranie opłat bez regulaminu, VAT i faktur | W | Faza C przed pierwszym przelewem |
| R21 | Wiadomości marketingowe bez zgód (RODO, prawo komunikacji elektronicznej) | Ś | Rozdzielić powiadomienia transakcyjne od marketingu, zgody, wypisanie |
| R22 | Zgoda na wizerunek klientów w filmach, dane osób trzecich | Ś | Wzór zgody, retencja, usuwanie na żądanie |

## 5. Minimalny zakres „sprzedajemy pilotażystom” (propozycja)

Najkrótsza droga do pierwszych płatnych użytkowników, jeśli cel to 5-10 pilotażystów, a nie publiczna sprzedaż:
1. Faza A (kroki 1-7), B (8-14, bez PITR), C (16-18 w wersji minimalnej: regulamin, polityka, umowa powierzenia, VAT/faktura ręczna).
2. Test PWA na telefonach (staging z HTTPS), seed demo i import CSV (24).
3. Rozliczanie pilotażu **ręcznie** (faktura i przelew) zamiast Stripe Billing; Stripe dopiero po walidacji (kroki 20-21).
4. Wyciąć z oferty: zadania domowe, płatności online od klientów, zajęcia grupowe. Uczciwie je komunikować jako „w planie” (SMS: rezygnacja).
5. Pilotaż 4-6 tygodni, potem decyzja o publicznym starcie.

Szacunek pracy podaję orientacyjnie i bez gwarancji: fazy A+B+C minimalne to zwykle kilka tygodni pracy jednej osoby, głównie dlatego, że część to praca poza kodem (prawnik, księgowy, DNS, wywiady), której nie da się zrównoleglić w kodzie.

## 6. Pytania do właściciela (blokują planowanie)
1. Czy pierwsza sprzedaż to **pilotaż ręcznie rozliczany**, czy od razu Stripe Billing z samodzielną rejestracją?
2. Czy zajęcia grupowe i płatności online od klientów są wymagane w ofercie startowej?
3. Jaki budżet na infrastrukturę (Supabase, Vercel Pro, Resend, Sentry)? (SMS: rezygnacja)
4. Kto robi prawo (regulamin, umowa powierzenia) i księgowość (VAT, faktury)?
5. Na jakim telefonie pokazujemy aplikację (iPhone wymaga PWA dla push)?

## 7. Decyzje i pomysły z 2026-10-16 (wpływ na plan; stan na 2026-10-21)

- **Decyzja (zrobione): rezygnujemy z SMS.** Kanały powiadomień to dzwonek w aplikacji, web push (a w przyszłości push natywny) i e-mail (też dla zaproszeń, potwierdzenia konta i resetu hasła). Usunięte: adapter SMS, kolumna `notification_preferences.sms`, wartość `sms` w `notification_log.channel` (migracja 0008), przycisk „Wyślij SMS”. Numer telefonu klienta zostaje w kartotece.
- **Decyzja (zrobione): PWA ważna na telefonach** (ADR 0009); **najpierw 2 tygodnie testów bez płatności, potem opłaty**, jeśli komuś się spodoba; freemium, plany i Stripe Billing odłożone.
- **Zrobione na prośbę właściciela:** jasny motyw, menu „Więcej” w portalu (ustawienia push), wolne terminy z listą chętnych (ADR 0010), potwierdzenia i cofanie pomyłek z oknem 30 s (ADR 0011).
- **Do przemyślenia: natywna aplikacja mobilna.** PWA jest zrobiona; ewentualnie Capacitor jako nakładka na istniejącą aplikację (ok. 1-3 tygodnie), pełna natywna (Expo/React Native, ok. 2-4 miesięcy) wymaga warstwy `/api/v1` i tokenów push urządzeń. Decyzja po walidacji z trenerami i po teście push na iPhonie.
- **Odłożone: freemium (2 klientów za darmo, potem płatny plan).** Wymusza przesunięcie rozliczeń SaaS (kroki 20-21) przed publiczną sprzedaż: `plans`, `plan_entitlements`, `subscriptions`, limit klientów egzekwowany w bazie (wyzwalacz na `clients`, także przy przywracaniu z archiwum), tryb tylko do odczytu po przekroczeniu limitu, Stripe Billing od pierwszego dnia (bez ręcznego fakturowania), ochrona przed wielokrotnymi darmowymi organizacjami.
