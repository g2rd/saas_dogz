# ADR 0010: wolne terminy, lista chętnych i prośba „Nie mogę przyjść”

Status: przyjęta, 2026-10-16.

## Kontekst

Klientka odwołuje zajęcia, a trener chce zaproponować zwolniony termin innym kursantom i wybrać, kto go dostanie.
Klienci mają mieć własne opcje w portalu. Decyzje właściciela: klient sam zapisuje się na listę chętnych na wcześniejsze lub
zwolnione terminy; kto pierwszy naciśnie „Biorę”, jest pierwszy na liście, ale trener widzi kolejność i zatwierdza wybraną
osobę; wybrany dostaje komunikat, że miejsce jest dla niego.

## Decyzje

1. **Lista chętnych jest zapisem klienta** (`waitlist_entries`, jeden wiersz na klienta; wpis i wypis własnymi uprawnieniami
   RLS). Ogłoszenia widzą i zgłaszają się tylko zapisani.
2. **Ogłoszenie dotyczy odwołanych, przyszłych zajęć** (`create_slot_offer`, błąd `DT007` w innych przypadkach, `DT008` gdy już
   ogłoszone, `23P01` gdy termin trenera został w międzyczasie zajęty). Oferta zawiera kopię terminu (czas, rodzaj zajęć,
   miejsce, notatka), żeby klient nie czytał cudzych zajęć. Jedna otwarta oferta na zajęcia (częściowy indeks unikalny).
   Klient, który odwołał, jest wykluczony z powiadomienia.
3. **Powiadomienia przez outbox:** `slot_offer.created` jest rozwijane na klientów z listy chętnych (procesor wczytuje ich i
   układa osobne powiadomienia; push, dzwonek, e-mail wg preferencji). `slot_claim.created` informuje trenera,
   `slot_claim.accepted` wybranego klienta („Miejsce jest dla Ciebie!”), `slot_claim.declined` pozostałych („Termin został zajęty”).
4. **„Biorę”** (`claim_slot`): zgłoszenie z opcjonalnym wyborem zatwierdzonego psa; idempotentne, kolejność wyznacza
   `created_at`; wycofanie (`withdraw_slot_claim`) i ponowienie są możliwe. Blokada wiersza oferty serializuje równoległe zgłoszenia.
5. **Wybór trenera** (`accept_slot_claim`): rezerwacja przez istniejącą funkcję `schedule_session` (kolizje terminów trenera,
   zatwierdzony pies, uprawnienia), oferta przechodzi w `filled`, pozostałe zgłoszenia w `declined`. Trener nie musi wybrać
   pierwszego na liście. `close_slot_offer` zamyka ogłoszenie i odrzuca oczekujące zgłoszenia. Zajęcia nadal rozlicza się z pakietu
   przy zakończeniu, jak zawsze.
6. **„Nie mogę przyjść” jako prośba, nie odwołanie** (`client_requests`, rodzaj `cancel` z `session_id`): klient informuje trenera,
   a odwołanie (z decyzją, czy zajęcie z pakietu przepada, wg polityki szkoły) i ewentualne ogłoszenie robi trener. Dzięki temu
   klient nie obchodzi zasad późnego odwołania ani rozliczeń.
7. **Widoczność dla trenera:** na `/app/sessions` sekcja „Wolne terminy” (kolejka zgłoszeń z przyciskiem „Wybierz”, „Zamknij
   ogłoszenie”) i „Odwołane terminy” (odwołane przyszłe zajęcia z przyciskiem „Ogłoś wolny termin”; także na karcie odwołanych zajęć
   z dzisiaj). Dla klienta: `/portal` (karta wolnych terminów lub zachęta do zapisu) i `/portal/sessions` (pełna sekcja, „Nie mogę
   przyjść” przy nadchodzących zajęciach).

## Konsekwencje

- Klient niezapisany na listę nie dostanie powiadomienia ani nie zobaczy ogłoszeń; trener widzi liczbę osób na liście przy ogłoszeniu
  i komunikat, gdy lista jest pusta.
- Brak preferencji dni i godzin na liście chętnych (zapis jest ogólny); można dodać później.
- Brak automatycznego przydziału („pierwszy wygrywa”): zawsze decyduje trener. Opcja automatyczna to osobna decyzja produktowa.
- Testy integracyjne zależą od tego, że żaden inny proces nie przetwarza outboxu równolegle; testy slotów ponawiają asercje do skutku,
  ale przy uruchamianiu całego pakietu lepiej zatrzymać pętlę `outbox:run` i serwery `next dev`.
