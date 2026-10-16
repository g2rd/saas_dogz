# ADR 0003: Pakiety jako dziennik zużyć, płatności jako należności i alokacje

**Status:** przyjęta (2026-10-16)

## Decyzja
- Saldo pakietu nie jest licznikiem. To suma `delta` z `package_ledger` (zakup dodaje liczbę zajęć, zajęcie i późne odwołanie odejmują, korekty i zwroty zmieniają saldo). Logika w `src/modules/packages/domain/ledger.ts`.
  - Odstępstwo od planu v2.0: widok `v_client_package_balance` liczy samą sumę `delta`, a nie `sessions_total + suma delta`, bo wpis `purchase` już dodaje zakupioną liczbę zajęć. Inaczej saldo liczyłoby się podwójnie.
- Należność (`charges`), wpłata (`payments`) i rozliczenie (`payment_allocations`) to osobne tabele. Status należności jest wyliczany z salda (`src/modules/payments/domain/charge-status.ts`), nigdy przechowywany.
- Kwoty jako `amount_minor` (integer, grosze) z walutą.

## Konsekwencje
Płatności częściowe, nadpłaty, zwroty i korekty nie wymagają zmian schematu. Historia każdego zużycia jest audytowalna.
