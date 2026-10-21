# ADR 0011: potwierdzenia, cofanie pomyłek i okno 30 sekund

Status: przyjęta, 2026-10-16.

## Kontekst

Operacje trenera (odwołanie i zakończenie zajęć, wpłaty, pakiety, dostęp klientów) wykonywały się jednym kliknięciem, a część nie miała
odwrotności. Pomyłka powodowała wysłanie powiadomienia do klienta albo zmianę salda bez drogi powrotu. Decyzje właściciela: potwierdzenia
i odwrotności od razu, okno cofnięcia powiadomień 30 sekund, cofnięcie zakończenia zajęć do końca dnia.

## Decyzje

1. **Warstwa 1, zapobieganie: `ConfirmSubmit`** (`src/shared/ui/confirm.tsx`). Wstawiany w miejsce przycisku zatwierdzającego formularz:
   otwiera okno dialogowe (na telefonie arkusz od dołu) z opisem skutków, domyślnie zaznaczone „Anuluj”; po „Potwierdź” wysyła formularz
   (`requestSubmit`), więc działa z każdą akcją serwerową i `useActionState`. Użyty przy: zakończeniu i odwołaniu zajęć, cofnięciu i
   przywróceniu, ogłoszeniu wolnego terminu, wyborze zgłoszenia i zamknięciu ogłoszenia, wpłacie, sprzedaży pakietu, korekcie salda,
   anulowaniu należności, wpłaty i pakietu, odebraniu dostępu, odwołaniu zaproszenia do zespołu, archiwizacji (klient, pies, szablon,
   rodzaj zajęć), odrzuceniu psa i usunięciu notatki. „Przywróć z archiwum” zostaje bez potwierdzenia (to samo jest cofnięciem).
2. **Warstwa 2, odwrotności jako zapisy kompensujące** (migracja 0010), z wpisem w `audit_log`; rejestry zostają „tylko do dopisywania”:
   - `undo_complete_session` (do końca dnia w strefie organizacji, błąd `DT012`): zwraca zajęcie do pakietu wpisem `adjustment +1`,
     anuluje nieopłaconą należność za zajęcia (`DT010`, gdy opłacona: najpierw storno wpłaty), zajęcia wracają do „Zaplanowane”;
   - `undo_cancel_session` (przed rozpoczęciem zajęć): zwraca zajęcie zabrane przy późnym odwołaniu, zamyka ogłoszenie wolnego terminu,
     odrzuca oczekujące zgłoszenia; błąd `DT013`, gdy termin już oddano innej osobie;
   - `void_payment` (storno, `DT014` przy powtórzeniu): wpłata zostaje w historii z `voided_at`, alokacje są zdejmowane z należności,
     widok salda ignoruje anulowane wpłaty;
   - `cancel_package` (`DT011`, gdy pakiet był używany): anuluje nieużyty pakiet i jego nieopłaconą należność (`DT010`, gdy opłacona).
3. **Warstwa 3, okno 30 sekund przed wysłaniem powiadomień:** kolumna `outbox_events.not_before`; wyzwalacz `outbox_events_before_insert` ustawia
   `now() + 30 s` dla zdarzeń wywołanych przez trenera (zaplanowanie, odwołanie, przywrócenie, ogłoszenie, wybór i odrzucenie zgłoszenia,
   wpłata, anulowanie wpłaty, niskie saldo); `claim_outbox_events` pomija zdarzenia przed `not_before`. Cofnięcie w oknie wycofuje jeszcze
   niewysłane zdarzenia (`app.drop_pending_events`), więc klient nie dostaje niczego; po oknie dostaje informację korygującą
   („Zajęcia przywrócone”, „Wpłata anulowana”). Zaplanowanie i odwołanie tych samych zajęć w oknie znoszą się, a przywrócenie po takim
   zniesieniu wysyła „Zaplanowano zajęcia”.
4. **UI cofania:** karta zakończonych dziś zajęć ma „Cofnij zakończenie” (dane `completed_at` w widoku `v_session_details`), karta odwołanych
   przyszłych zajęć ma „Przywróć zajęcia”, historia wpłat ma „Anuluj wpłatę” (anulowane przekreślone z plakietką), strona pakietu ma
   „Anuluj pakiet” dla nieużytego pakietu.

## Konsekwencje

- Powiadomienia wywołane przez trenera dochodzą z opóźnieniem 30 s (lokalnie i na produkcji); to świadomy koszt okna „Cofnij”. Powiadomienia
  inicjowane przez klienta (np. „Biorę”, prośby) i zdarzenia dzienne nie są opóźniane.
- Testy integracyjne zdejmują `not_before` przed przetwarzaniem (`drain`), a test `undo.integration.test.ts` sprawdza samo opóźnienie.
- Cofnięcie zakończenia po północy jest zablokowane: korekta salda pakietu (zapis z notatką) zostaje właściwym narzędziem.
- Nie zrobiono jeszcze: widoku historii zmian (audyt jest zapisywany, brak ekranu), cofnięcia wyboru zgłoszenia (rozwiązanie: odwołać
  utworzone zajęcia i ogłosić termin ponownie), potwierdzeń w panelu klienta.
