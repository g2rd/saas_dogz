# ADR 0006: Zajęcia (etap 2 demo)

**Status:** przyjęta (2026-10-16)

## Decyzje
- **Zapisy przez funkcje SQL, odczyt przez RLS** (jak w ADR 0005). `schedule_session`, `complete_session` i `cancel_session` są `security definer`, same sprawdzają rolę i przynależność identyfikatorów do organizacji. Tabele `training_sessions` i `session_attendees` nie mają polityk zapisu; `session_types` zapisuje zwykłe RLS (owner/admin/trainer).
- **Zakończenie zajęć jest atomowe.** `complete_session` w jednej transakcji: blokuje zajęcia, wybiera i blokuje pakiet, dopisuje wpis `session` (-1) do dziennika, oznacza uczestnika jako obecnego, dopisuje zdarzenia do outbox (także `client_package.low_balance` przy saldzie ≤ 2) i wpis audytu. Stan zajęć i saldo czytamy osobnymi zapytaniami po uzyskaniu blokady (READ COMMITTED), więc równoległe rozliczenia nie zużyją tego samego ostatniego zajęcia ani nie rozliczą zajęć dwa razy. Potwierdzone testami: trzy równoległe zakończenia tego samego terminu i trzy zajęcia walczące o ostatnie zajęcie z pakietu.
- **Wybór pakietu.** Trener może wskazać pakiet; bez wskazania `app.pick_package` bierze ważny (w dniu zajęć, w strefie organizacji) pakiet z wolnymi zajęciami, który wygasa najwcześniej (bez terminu na końcu), potem najstarszy.
- **Bez pakietu.** Zakończenie zwraca konflikt `no_package` (kod SQL `DT001`). Dopiero świadome „Zakończ bez pakietu” tworzy należność za pojedyncze zajęcia z ceny rodzaju zajęć (`source_type = session`); wymaga uprawnienia do płatności, więc asystent tego nie zrobi.
- **Kolizje terminów.** Ograniczenie wykluczające (`btree_gist`) blokuje nakładające się zajęcia tego samego trenera. Odwołane zajęcia zwalniają termin, zajęcia „jeden po drugim” są dozwolone (przedział półotwarty). Błąd trafia do użytkownika jako błąd pola godziny.
- **Odwoływanie.** Polityka organizacji (`late_cancel_hours`, `late_cancel_consumes_session`) wyznacza domyślną decyzję w domenie (`shouldConsumeOnCancel`), a trener może ją zmienić na formularzu. Baza dostaje gotową decyzję i tylko ją wykonuje (wpis `late_cancel`, o ile klient ma pakiet).
- **Czas.** Zajęcia w `timestamptz` (UTC); data i godzina z formularza są interpretowane w strefie organizacji (`date-fns-tz`), a doby „Dziś” i „Najbliższe” liczone w tej strefie, także w dniach zmiany czasu (23 i 25 godzin).
- **Minimalny zakres.** Jeden uczestnik na zajęcia (zajęcia indywidualne). Model (`session_attendees`) przewiduje grupy, ale nie ma jeszcze pojemności, serii, edycji ani przenoszenia terminu.

## Konsekwencje
- Świadome odstępstwa od planu v2.0: brak tabeli `locations` (miejsce jako tekst), brak `session_private_notes`, brak serii i zajęć grupowych. Dojdą w kolejnych etapach (migracje rozszerzające).
- Komunikat po zakończeniu lub odwołaniu żyje w stanie komponentu karty; po odświeżeniu strony znika, a odwołane zajęcia znikają z listy „Najbliższe”.
- Zdarzenia w outbox (`training_session.*`, `client_package.low_balance`) czekają na procesor powiadomień (etap 4).
