# ADR 0005: Pakiety i płatności (etap 1 demo)

**Status:** przyjęta (2026-10-16)

## Decyzje
- **Zapisy przez funkcje SQL, odczyt przez RLS.** Tabele `client_packages`, `package_ledger`, `charges`, `payments` i `payment_allocations` nie mają polityk insert/update/delete. Zapisują je wyłącznie funkcje `sell_package`, `record_payment`, `adjust_package` i `void_charge` (`security definer`, pusty `search_path`), które same sprawdzają rolę (owner/admin/trainer) i przynależność identyfikatorów do organizacji. Dzięki temu sprzedaż (pakiet + wpis „zakup" + należność + zdarzenie + audyt) i wpłata (płatność + alokacje) są atomowe, a klient lub asystent nie może zapisać ich bezpośrednio przez API. Szablony (`package_templates`) zapisuje zwykłe RLS.
- **Dziennik tylko do dopisywania.** `package_ledger` blokuje UPDATE i DELETE triggerem nawet dla właściciela tabeli. Saldo to suma `delta` (widok `v_client_package_balance`); ręczna korekta nie może zejść poniżej zera.
- **Należności, wpłaty i alokacje to osobne tabele.** Status należności jest wyliczany z salda w kodzie (`chargeStatus`), nie przechowywany. Po terminie jest od dnia następnego po terminie płatności. Nadpłata to wpłata, której część nie została rozliczona (`paid - allocated` w `v_client_balance`).
- **Podział wpłaty decyduje aplikacja, bazę pilnuje niezmienników.** `allocatePayment` (domena) rozdziela wpłatę na najstarsze otwarte należności lub na wskazaną. Funkcja SQL sprawdza, że należność należy do klienta i nie jest anulowana, że kwota nie przekracza tego, co zostało, i że suma alokacji nie przekracza wpłaty.
- **Wyścigi wpłat.** Należność jest blokowana (`FOR UPDATE`) osobnym zapytaniem, a suma alokacji liczona dopiero po zdobyciu blokady. Suma liczona w tym samym zapytaniu co `FOR UPDATE` używała starego snapshotu (READ COMMITTED) i pozwalała przekroczyć kwotę należności. Wykryte testem równoległych wpłat (sześć wpłat po 100 zł na należność 300 zł: przechodzą dokładnie trzy), poprawka sprawdzona w 12 powtórzeniach.
- **Migawka przy sprzedaży.** `client_packages` kopiuje nazwę, liczbę zajęć, cenę i ważność z szablonu, więc późniejsza zmiana szablonu nie zmienia sprzedanych pakietów.
- **Wpłatę księguje trener** (klient w panelu tylko widzi kwotę i termin). Płatności online są osobnym dodatkiem (faza 3).
- **Kwoty** w groszach (`integer`), wpisywane jako tekst („800,50") i parsowane bez zaokrągleń (`parseAmountToMinor`), limit 1 000 000 zł na kwotę. Daty (termin płatności, ważność) to daty kalendarzowe YYYY-MM-DD.
- **Dane finansowe nie są usuwane kaskadowo** (klucze bez `on delete cascade`): usunięcie klienta z danymi finansowymi wymaga świadomej procedury RODO z uwzględnieniem obowiązku przechowywania dokumentów księgowych.

## Konsekwencje
- Operacja obejmująca tabele dwóch modułów (sprzedaż tworzy też należność modułu `payments`) żyje w funkcji SQL, a nie w kodzie aplikacji. To świadome odstępstwo od reguły „jedna tabela, jeden moduł-właściciel", bo atomowość jest ważniejsza.
- Brak jeszcze: storna wpłaty, anulowania pakietu, wygasania pakietu zadaniem dziennym, obsługi wielu walut u jednego klienta, powiązania zużycia pakietu z zajęciami (etap 2).
