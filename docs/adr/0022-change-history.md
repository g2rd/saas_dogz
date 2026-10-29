# ADR 0022: historia zmian z „Cofnij”

Status: przyjęta, 2026-10-29. Bez migracji.

## Kontekst

Dziennik audytu (`audit_log`) zapisuje zmiany od początku, ale nie miał ekranu. Trener po pomyłce (zła wpłata, pakiet sprzedany nie temu klientowi, przedwcześnie zakończone zajęcia)
szukał odpowiedniego przycisku na kartach klienta i zajęć. Odwracanie istnieje od ADR 0011 (okno 30 s, cofanie do końca dnia), brakowało jednego miejsca, które pokazuje „kto, co, kiedy”.

## Decyzje

1. **Ekran `/app/history`** (pozycja „Historia zmian” w „Więcej”), tylko dla ról z uprawnieniem `audit.read` (właściciel, administrator); RLS na `audit_log` robi to samo w bazie.
   Najnowsze 50 wpisów, „Pokaż starsze” zwiększa o 50 (do 500, parametr `limit` z adresu jest ograniczony).
2. **Moduł `history`** (tylko odczyt): `listHistory` czyta `audit_log` kontekstem użytkownika i dołącza opis obiektu (klient, kwota, pakiet, termin zajęć) oraz nazwę autora zmiany. Opis składa
   interfejs w języku widza (`history.action.<rodzaj_wpisu>` w katalogach pl i en, kropki w kodzie wpisu zamienione na podkreślniki); nieznany rodzaj wpisu pokazuje swój kod, więc nic nie znika z historii.
3. **Cofnąć można cztery rodzaje zmian**: wpłatę (`void_payment`), sprzedaż pakietu (`cancel_package`), zakończenie zajęć (`undo_complete`) i odwołanie zajęć (`undo_cancel`). Przycisk „Cofnij” pojawia się
   tylko przy **najnowszym** wpisie danego rodzaju dla obiektu i tylko gdy stan obiektu nadal na to pozwala (wpłata nie anulowana, pakiet nie anulowany, zajęcia nadal zakończone tego samego dnia
   w strefie szkoły albo nadal odwołane i jeszcze nieodbyte). Pozostałe zmiany (korekty salda, zaproszenia, zespół, ogłoszenia terminów) są tylko do wglądu.
4. **Cofanie wykonują te same przypadki użycia co przyciski na kartach** (`voidPayment`, `cancelPackage`, `undoCompleteSession`, `restoreCanceledSession`), więc uprawnienia, okno czasu, warunek
   „pakiet nieużywany” i tryb „tylko do odczytu” egzekwuje baza (`DT011`, `DT012` itd.); odmowa wraca jako komunikat pod wpisem, a ekran nie zgaduje reguł poza tym, co potrzebne do ukrycia przycisku.
   Każde cofnięcie zostawia własny wpis w historii (np. „Anulowano wpłatę”), więc historii nie da się „wyczyścić”.
5. **Testy:** `e2e/history.spec.ts`: opisy wpisów i autor, cofnięcie wpłaty i pakietu (znika przycisk, pojawia się wpis o cofnięciu), cofnięcie zakończenia zajęć, odmowa anulowania użytego pakietu
   widoczna pod wpisem.

## Skutki

- Wpisy audytu mają tylko `entity_id` bez szczegółów (`changes` wypełnione tylko w niektórych), więc opis odtwarzamy z aktualnego stanu obiektu; usunięty lub zarchiwizowany obiekt daje opis ogólny bez przycisku.
- Zostaje: filtr po kliencie i rodzaju zmiany, cofanie korekt salda i ogłoszeń wolnych terminów, widok historii pojedynczego klienta (te same dane, filtr po obiekcie).
