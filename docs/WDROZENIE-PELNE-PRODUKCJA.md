# Pełne wdrożenie produkcyjne: sprzedaż gotowego produktu

Stan na 2026-10-21. Instrukcja krok po kroku, jak przejść od wersji testowej ([WDROZENIE-DEMO-10-TESTEROW.md](WDROZENIE-DEMO-10-TESTEROW.md)) do **płatnej usługi dla dowolnego trenera**: publiczna rejestracja, abonament, faktury, wsparcie, zgodność prawna, monitoring i skalowanie. Limitacje i ryzyka produktu: [WDROZENIE-PRODUKCYJNE.md](WDROZENIE-PRODUKCYJNE.md). Stan kodu: [ARCHITEKTURA-I-STAN-PRAC.md](ARCHITEKTURA-I-STAN-PRAC.md).

Oznaczenia: 🧑 robisz Ty, 🤖 robi się w kodzie, ⚖️ wymaga prawnika/księgowego, ⚠️ pułapka. Ceny i limity dostawców pochodzą z publicznych źródeł i **trzeba je zweryfikować przed decyzją** („do weryfikacji”). Szacunki czasu są orientacyjne.

## 0. Zakres i warunek wejścia

**Warunek wejścia:** zakończony test demo z decyzją „go” (kryteria sukcesu spełnione, lista brakujących funkcji z priorytetami, co najmniej kilku trenerów deklaruje zapłatę). Bez tego nie buduj rozliczeń: najdroższy błąd to zbudować fakturowanie dla produktu, którego nikt nie chce kupić.

**Zakres:** (A) stabilizacja i środowiska, (B) rozliczenia i abonament, (C) publiczna rejestracja i onboarding, (D) zgodność prawna i bezpieczeństwo, (E) obserwowalność i operacje, (F) wsparcie i marketing, (G) start i skalowanie.

## A. Środowiska, CI/CD i jakość (🤖 + 🧑)

1. **Trzy środowiska:** lokalne, **staging** (osobny projekt Supabase, osobny projekt Vercel lub środowisko Preview, własna subdomena `staging.`, dane sztuczne, tryb płatności testowych) i **produkcja**. Zmienne środowiskowe rozdzielone (Vercel: Production/Preview). ⚠️ Staging nigdy nie wskazuje na bazę produkcyjną.
2. **CI (GitHub Actions)** na każdy PR do `dev`/`main`: `typecheck`, `lint`, `test`, `db:test` (Supabase CLI w kontenerze), `test:integration`, `check:boundaries`, `build`. Wymagany zielony status do scalenia (ochrona gałęzi `main` i `dev`).
3. **Wdrażanie migracji:** krok w pipeline po scaleniu do `main`: `supabase db push` na produkcji **przed** wdrożeniem aplikacji; zasada **rozszerz → wdróż → zawęź** (zmiany kompatybilne wstecz, np. nowa kolumna nullable, potem kod, potem ograniczenia), żeby wdrożenie bez przestoju było możliwe. Migracje nigdy nie są edytowane po wdrożeniu; poprawka = nowa migracja.
4. **Wydania:** tagi wersji, krótka lista zmian (changelog), wdrożenie z `main` po zgodzie właściciela; szybkie wycofanie (Vercel Instant Rollback; sprawdź nazwę opcji) i przygotowana procedura dla migracji, których nie da się cofnąć (migracja naprawcza do przodu).
5. **Testy dodatkowe:** kilka scenariuszy end-to-end (Playwright) dla ścieżek krytycznych: rejestracja → szkoła → klient → pakiet → zajęcia → zaproszenie → portal; uruchamiane na stagingu przed wydaniem. Test obciążeniowy prostych zapytań (patrz sekcja G).
6. **Higiena zależności:** Dependabot/Renovate, `npm audit` w CI, przypięte wersje Node.

## B. Rozliczenia i abonament (🤖 + 🧑 + ⚖️)

### B1. Decyzje produktowe (🧑, przed kodem)
Do ustalenia po teście: model (abonament miesięczny/roczny; freemium z limitem klientów była opcja odroczona), progi cenowe (np. według liczby aktywnych klientów lub liczby trenerów), okres próbny (np. 14 dni bez karty), co dzieje się po nieopłaceniu (karencja, tryb tylko do odczytu, zawieszenie, usunięcie danych po X dniach), ceny założycielskie dla testerów, polityka zwrotów i wypowiedzenia, okres rozliczeniowy, waluta (PLN). Zapisz jako ADR.

### B2. Stripe Billing (rekomendacja: gotowy system subskrypcji zamiast własnego)
- Konto Stripe (weryfikacja firmy), produkty i ceny (miesięczna/roczna), **Customer Portal** (zmiana karty, plan, anulowanie, historia faktur), Checkout w trybie subskrypcji; metody płatności: karta, BLIK, Przelewy24 (zależnie od dostępności dla subskrypcji; **do weryfikacji**). Prowizja Stripe w PL ok. 1,5% + 1 zł dla kart europejskich (**do weryfikacji**).
- **Kod (moduł `billing`):** tabele `billing_customers (organization_id, stripe_customer_id)`, `subscriptions (organization_id, stripe_subscription_id, plan, status, current_period_end, cancel_at_period_end, trial_end)`, `billing_events (stripe_event_id unique, type, payload, processed_at)` dla idempotencji webhooków.
- Trasa `POST /api/webhooks/stripe` (service_role, grupa dozwolona regułą granic): **weryfikacja podpisu** (`stripe-signature` + sekret webhooka), zapis zdarzenia do `billing_events` (unikalny `stripe_event_id`), obsługa: `checkout.session.completed`, `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`. Logika jako czysta funkcja zdarzenie → zmiana stanu (testowalna jednostkowo).
- **Uprawnienia (entitlements):** funkcja `app.org_entitlements(org)` zwracająca plan i limity (liczba klientów, liczba osób w zespole, funkcje); egzekwowanie w bazie (trigger/sprawdzenie przy `insert` klienta) i w UI (komunikat „odblokuj plan”). To jest ten sam mechanizm, który w demo realizują `status` i `access_until` w `organizations`; rozliczenia **ustawiają te same pola** (opłacone → `active` + `access_until = current_period_end`).
- **Windykacja (dunning):** `invoice.payment_failed` → e-mail do trenera (dzień 0), przypomnienia (3, 7 dzień, harmonogram Stripe Smart Retries), po karencji (np. 7-14 dni) → `read_only`, po kolejnych X dniach → `suspended`; dane przechowywane np. 90 dni po wygaśnięciu, potem usunięcie po uprzedzeniu (⚖️ ustal w regulaminie).
- ✅ Testy: tryb testowy Stripe i karty testowe (udane, odrzucone, wymagające 3-D Secure), Stripe CLI do lokalnego przekazywania webhooków, scenariusze: nowy zakup, odnowienie, nieudana płatność, anulowanie, ponowna aktywacja, zmiana planu, **ten sam webhook dwa razy** (idempotencja), webhook w złej kolejności.

### B3. Faktury i księgowość (⚖️ 🧑)
- Stripe wystawia potwierdzenia/faktury płatności, ale **polską fakturę VAT** (NIP nabywcy, kody, numeracja, KSeF zależnie od obowiązujących terminów; **do weryfikacji u księgowej**) zwykle wystawia się systemem fakturowym (np. Fakturownia, wFirma, iFirma) zintegrowanym ze Stripe przez API/Zapier-podobne narzędzie lub własny webhook. Zbieraj w rozliczeniach dane firmy trenera (nazwa, NIP, adres) w ustawieniach szkoły.
- VAT: usługa SaaS dla przedsiębiorców i konsumentów w UE, stawka krajowa 23% dla PL; sprzedaż do innych krajów UE (OSS/VAT-UE) tylko po konsultacji.
- Własna działalność (JDG/spółka), rachunek firmowy, ubezpieczenie OC działalności (rozważ).

## C. Publiczna rejestracja i onboarding (🤖)

1. **Otwarcie rejestracji:** usuń wymóg kodu beta (lub zostaw jako opcjonalny kod rabatowy/zaproszeniowy); zamiast tego: CAPTCHA (Turnstile/hCaptcha) i limity (Supabase rate limits, limit zakładania szkół na IP/dzień), potwierdzenie e-mail wymagane.
2. **Onboarding:** kreator szkoły (jest), checklista „Pierwsze kroki” w panelu (dodaj klienta, zaproś klienta, zaplanuj zajęcia, włącz powiadomienia), dane przykładowe jednym kliknięciem (opcjonalnie), instalacja PWA (jest), import CSV z innego narzędzia (z demo).
3. **Okres próbny:** po rejestracji `status = trial`, `access_until = teraz + 14 dni`; przypomnienia e-mail w dniach 7, 12, 14; w dniu końca ekran wyboru planu (Checkout). Brak karty przy starcie zwiększa konwersję rejestracji, a wymóg karty zwiększa konwersję płatną; wybór według danych z testu.
4. **Zarządzanie subskrypcją w aplikacji:** ekran „Plan i płatności”: aktualny plan, data odnowienia, przycisk do Customer Portal, historia faktur, wykorzystanie limitów.
5. **Eksport danych i usunięcie konta (RODO):** trener może wyeksportować dane szkoły (CSV/JSON: klienci, psy, pakiety, wpłaty, zajęcia) i zażądać usunięcia; procedura usunięcia na żądanie dla klientów trenera (anonimizacja z zachowaniem księgi, bo księga jest niezmienna); odpowiedź na żądania w 30 dni.
6. **Strona marketingowa** (grupa `(marketing)`): hero, funkcje, cennik, FAQ, kontakt, regulamin, polityka prywatności, polityka cookies; SEO podstawowe (meta, `sitemap.xml`, `robots.txt`), analityka bez ciasteczek (np. Plausible; **do weryfikacji** koszt), baner cookies tylko, jeśli używasz niekoniecznych.

## D. Prawo, prywatność i bezpieczeństwo (⚖️ + 🤖)

### D1. Dokumenty (⚖️, nie pomijaj)
- **Regulamin świadczenia usług drogą elektroniczną** (zasady konta, abonament, odpowiedzialność, rozwiązanie, zawieszenie), **polityka prywatności**, **polityka cookies**.
- **Umowa powierzenia przetwarzania danych (DPA)**: trener (administrator danych klientów) powierza Ci dane (Ty jako procesor), z listą **podprocesorów**: Supabase, Vercel, Resend, Stripe, Sentry, system fakturowy (z lokalizacją przetwarzania i transferami poza EOG, jeśli występują, z klauzulami SCCs; **do weryfikacji w dokumentach dostawców**). Akceptacja DPA przy rejestracji i zapis wersji zgody.
- **Rejestr czynności przetwarzania**, ocena ryzyka, procedura naruszeń (zgłoszenie do UODO w 72 h), procedury żądań osób (dostęp, usunięcie, sprostowanie). Dla danych o Twoich użytkownikach (trenerach) jesteś administratorem.
- Dla konsumentów (jeśli trener bez firmy kupuje usługę): prawo odstąpienia i informacje przedumowne ⚖️.
- Dane o psach nie są danymi osobowymi, ale dane właściciela, telefon i adres są; unikaj gromadzenia danych szczególnych kategorii.

### D2. Bezpieczeństwo (🤖)
- **Audyt RLS**: przegląd wszystkich tabel i funkcji `security definer` (ustalony `search_path`, sprawdzenie roli i organizacji), testy z kluczem `anon` i tokenem użytkownika innej szkoły; automatyczny test w CI wykrywający tabelę bez RLS.
- Nagłówki: CSP (z `nonce`), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`; sprawdzenie na securityheaders.com.
- **Ograniczenia częstotliwości** na logowaniu, rejestracji, resetowaniu hasła, zaproszeniach i endpointach publicznych (limity Supabase + własne na trasach akcji, np. baza w Upstash/Vercel KV; **do weryfikacji**).
- **MFA (TOTP)** dla właściciela platformy i konta `platform_admins` (obowiązkowo), opcjonalnie dla trenerów.
- Rotacja sekretów (klucze, `CRON_SECRET`, VAPID, `INVITATION_HASH_SECRET`) i ich lista z datami; dostęp do paneli Supabase/Vercel tylko z MFA, osobne konta robocze.
- **Test penetracyjny** lub przynajmniej lista kontrolna OWASP ASVS L1 i zewnętrzny przegląd kodu uwierzytelniania; polityka zgłaszania podatności (`/.well-known/security.txt`).
- Logi dostępu administratora do danych szkół (audyt wejść w `/admin`) i zasada najmniejszych uprawnień: panel nie pokazuje danych klientów, tylko metryki, chyba że świadczysz wsparcie za zgodą trenera.

## E. Obserwowalność i operacje (🤖 + 🧑)

- **Błędy:** Sentry (serwer i klient) z wyłączonym zbieraniem danych osobowych, powiązanie z wersją wdrożenia, alerty na nowe błędy i wzrost.
- **Dostępność:** monitor zewnętrzny na `/login`, `/api/health` (dodać: sprawdza bazę) i wywołanie crona; strona statusu (np. Better Stack/Instatus; **do weryfikacji**).
- **Cron/outbox:** metryki: liczba zdarzeń oczekujących, najstarsze zdarzenie, błędy po 5 próbach; alert, gdy najstarsze zdarzenie ma > 10 min. Rozważ przeniesienie przetwarzania na stałego workera lub Supabase Edge/queue, gdy wolumen urośnie.
- **Baza:** monitoring połączeń, wolnych zapytań (`pg_stat_statements`), wielkości tabel (`audit_log`, `outbox_events`, `notification_log` rosną: dodać **retencję** i archiwizację), indeksy sprawdzone planem zapytań dla list klientów/zajęć. Pula połączeń (Supavisor) dla funkcji serverless.
- **Kopie:** Supabase Pro daje dzienne kopie; dla produkcji z płatnymi klientami włącz **PITR** (przywracanie do punktu w czasie; dodatkowy koszt, **do weryfikacji**), plus cotygodniowy własny zrzut logiczny (`pg_dump`) do osobnego magazynu; **kwartalny test odtworzenia**.
- **Runbook awarii:** komunikat statusu, kto decyduje, szablony wiadomości, wycofanie wdrożenia, przywrócenie z kopii, post-mortem w 5 dni. Cele (SLO): dostępność 99,5% miesięcznie, push/e-mail w < 2 min od zdarzenia (poza oknem „Cofnij” 30 s), odpowiedź wsparcia w 1 dzień roboczy. Nie obiecuj SLA umownego, dopóki nie masz zapasu (redundancji) i procesów.
- **Koszty i limity:** miesięczny przegląd zużycia (Supabase: rozmiar bazy, transfer, MAU; Vercel: funkcje, transfer; Resend: wolumen e-maili) z alertami przy 70% limitu.

## F. Wsparcie, sprzedaż i marketing (🧑)

- **Wsparcie:** skrzynka pomocy, baza wiedzy (instalacja PWA na Android/iOS, push, zaproszenia QR, rozliczenia pakietów, FAQ), szablony odpowiedzi, czas odpowiedzi w regulaminie, system zgłoszeń (np. Crisp/Help Scout/Freshdesk; **do weryfikacji**), formularz „Zgłoś problem” w aplikacji (z demo).
- **Pozycjonowanie i cennik:** przed ceną przelicz koszty (sekcja H) i wartość dla trenera (godziny oszczędzone na zarządzaniu pakietami i przypominaniu o płatnościach). Cennik prosty: 2-3 plany, miesięczny i roczny (rabat), cena założycielska dla testerów jako nagroda.
- **Pozyskiwanie klientów:** testerzy jako polecający (referencje, case study), grupy i społeczności trenerów psów, kursy kynologiczne, wydarzenia branżowe, współpraca ze szkołami kynologicznymi i hodowcami, treści (poradniki o organizacji szkoły), płatna reklama dopiero po sprawdzeniu retencji.
- **Wskaźniki produktu:** aktywacja (rejestracja → pierwszy klient w 7 dni), retencja tygodniowa/miesięczna, konwersja z próby na płatny, churn miesięczny, MRR, CAC, liczba klientów trenera, liczba zajęć/tydzień, NPS co kwartał. Panel właściciela rozbudowuje się o te widoki (sekcja G).

## G. Panel właściciela w wersji pełnej (🤖)

Rozszerzenie panelu `/admin` z wersji demo: widok MRR/ARR i prognozy odnowień (z `subscriptions`), lejek rejestracji (rejestracje → pierwsze zajęcia → płatny), lista szkół z ryzykiem odejścia (brak logowania 14 dni), zawieszanie/odwieszanie i przedłużanie okresu (z powodem), podgląd stanu rozliczeń szkoły, kody rabatowe, historia akcji administratora, **personifikacja (wsparcie) tylko za zgodą i z logiem**, eksport CSV metryk, role wewnętrzne (właściciel, wsparcie z uprawnieniami tylko do odczytu).

## H. Koszty i skalowanie (orientacyjnie, do weryfikacji)

Z wcześniejszego wyliczenia (ceny publiczne w USD zamienione na PLN, kursy zmienne): koszt stały infrastruktury ok. **200-300 zł/mies.** dla 5-20 trenerów (Supabase Pro + Vercel Pro + e-mail + domena + monitoring), rosnący do ok. **500-700 zł/mies.** przy ~100 trenerach (większa baza, transfer, e-maile, ewentualnie wyższy plan obliczeń Supabase i PITR), do tego prowizja płatności (ok. 1,5% + 1 zł od transakcji), system fakturowy (kilkadziesiąt zł), Sentry (darmowy lub ok. 26 USD), obsługa księgowa i prawna (jednorazowo kilka tys. zł na dokumenty, miesięcznie księgowość). Koszt krańcowy jednego trenera jest niski (poniżej kilku zł/mies.), więc marża zależy głównie od ceny abonamentu i kosztu wsparcia.

**Wąskie gardła przy wzroście:**
| Zasób | Kiedy zaboli | Środek |
| --- | --- | --- |
| Cron co minutę przetwarzający outbox w jednej funkcji | setki zdarzeń na minutę | `limit` i równoległość partii, worker stały, kolejka (Supabase Queues/pgmq; **do weryfikacji**) |
| Połączenia do bazy z funkcji serverless | wiele równoczesnych żądań | Supavisor (pooler), mniej zapytań na stronę |
| Rozmiar `audit_log`, `notification_log`, `outbox_events` | miesiące działania | retencja/archiwizacja, partycjonowanie po czasie |
| Limity e-mail (Resend) | tysiące powiadomień/mies. | plan płatny, preferowanie push i dzwonka, zbiorcze podsumowania |
| Web push na iOS | duży udział iPhone'ów | e-mail jako zapas; ewentualnie aplikacja natywna (Capacitor/Expo) dopiero po walidacji |
| Wsparcie | ponad 30-50 płacących | baza wiedzy, onboarding automatyczny, część wsparcia zlecona |

## I. Aplikacja natywna (decyzja po walidacji)

PWA jest priorytetem. Natywna aplikacja (Capacitor jako opakowanie, ewentualnie Expo/React Native) ma sens, gdy: dużo klientów na iPhone'ach nie włącza push w PWA, potrzebne są funkcje urządzenia (kontakty, kalendarz, biometria), albo trenerzy oczekują obecności w sklepie. Koszty: konto Apple Developer ok. 99 USD rocznie i Google Play jednorazowo ok. 25 USD (**do weryfikacji**), recenzje sklepów, aktualizacje, push przez APNs/FCM (zmiana wysyłki w `senders.ts`: dodatkowy kanał, plan i outbox bez zmian). Kontrola zawieszeń i abonamentu pozostaje po stronie serwera, więc nie wymaga zmian logiki bazy.

## J. Plan startu (kamienie milowe)

| Etap | Treść | Orientacyjny czas |
| --- | --- | --- |
| 1 | Wyniki testu demo, decyzje cenowe (B1), ADR | 1 tydzień |
| 2 | CI/CD, staging, retencja, audyt RLS, nagłówki, limity (A, D2) | 1-2 tygodnie |
| 3 | Stripe Billing, webhook, uprawnienia, dunning, ekran planu (B2) | 2-3 tygodnie |
| 4 | Publiczna rejestracja, onboarding, trial, eksport/usunięcie danych, strona marketingowa (C) | 2 tygodnie |
| 5 | Dokumenty prawne i DPA, faktury i księgowość (D1, B3) | równolegle, 2-4 tygodnie (⚖️) |
| 6 | Monitoring, status, PITR, runbook awarii, baza wiedzy, system wsparcia (E, F) | 1-2 tygodnie |
| 7 | Miękki start: darmowi testerzy → płatni (ceny założycielskie), tydzień obserwacji metryk | 2-4 tygodnie |
| 8 | Publiczny start, marketing, cykl przeglądów kwartalnych | ciągły |

Łącznie około **3-4 miesięcy** pracy jednej osoby z agentem, plus czas zewnętrzny (prawnik, księgowa, Stripe). Pracę zrównoleglaj tylko tam, gdzie zmiany nie dotykają tych samych plików.

## K. Lista kontrolna „gotowe do sprzedaży”
- [ ] Test demo zakończony; decyzja go; ceny i plany zapisane w ADR
- [ ] Staging i produkcja rozdzielone; CI wymagane do scalenia; migracje wdrażane w pipeline
- [ ] Stripe Billing: Checkout, Customer Portal, webhook z podpisem i idempotencją, dunning, testy na kartach testowych
- [ ] Uprawnienia/limity planu egzekwowane w bazie i UI; blokada po terminie działa (`read_only`/`suspended`)
- [ ] Faktury VAT wystawiane automatycznie lub półautomatycznie, ustalone z księgową
- [ ] Publiczna rejestracja z CAPTCHA i limitami; trial; onboarding; eksport i usunięcie danych
- [ ] Regulamin, polityka prywatności, cookies, DPA z listą podprocesorów, rejestr przetwarzania, procedura naruszeń (⚖️)
- [ ] Audyt RLS, nagłówki bezpieczeństwa, limity, MFA admina, rotacja sekretów, `security.txt`
- [ ] Sentry, monitor dostępności, strona statusu, alerty outbox, retencja logów, PITR, test odtworzenia
- [ ] Baza wiedzy, system wsparcia, kanał kontaktu, SLO opisane w regulaminie
- [ ] Panel właściciela z MRR, lejkiem i zarządzaniem szkołami
- [ ] Strona marketingowa z cennikiem; analityka; plan pozyskiwania pierwszych 20 płacących
