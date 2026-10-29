# ADR 0016: zapowiedź końca dostępu szkoły (7 dni i 1 dzień)

Status: przyjęta, 2026-10-29. Migracja `20261029000002_access_ending_notice.sql`.

## Kontekst

Szkoła z ustawionym terminem dostępu (`organizations.access_until`, status `trial` lub `active`) po jego upływie przechodzi automatem w tryb
„tylko do odczytu” ([ADR 0012](0012-platform-admin-and-access-control.md)). Trener dowiadywał się o tym dopiero po fakcie (powiadomienie
`org_read_only`), co przy testach kończących się po 2 tygodniach oznaczało nagły brak zapisu.

## Decyzje

1. **Zdarzenie `organization.access_ending`** powstaje w regułach dziennych (`enqueue_daily_notification_events`, wywoływanych z crona outboxu):
   dla szkół w statusie `trial` lub `active`, których termin dostępu jest w przyszłości, nie dalej niż za 7 dni. Ładunek ma `days` = 7
   (termin dalej niż doba) albo 1 (w ciągu doby). Szkoła, której termin jest bliższy niż doba, dostaje tylko zapowiedź „1 dzień”.
2. **Idempotencja:** klucz deduplikacji zawiera identyfikator szkoły, termin dostępu i liczbę dni, więc ponowne uruchomienie reguł niczego nie
   dubluje, a po przedłużeniu dostępu (nowy termin) zapowiedzi pojawiają się znowu.
3. **Odbiorcy i kanały:** właściciele i administratorzy szkoły, tak jak przy zmianie statusu (te same fakty w `outbox-repository.ts`). Treść
   `notify.org_access_ending` (pl i en, liczba mnoga ICU) trafia do dzwonka, e-maila i push według preferencji odbiorcy, w jego języku, z terminem
   w strefie szkoły; link prowadzi do `/app`.
4. **Bez zmian w automacie wygaszania:** `expire_organization_access` działa jak dotąd; zapowiedź jest tylko ostrzeżeniem.
5. **Test:** scenariusz E2E w `e2e/notifications.spec.ts` (termin za 5 dni → e-mail „za 7 dni”; ponowny przebieg bez duplikatu; termin za pół doby →
   e-mail „za 1 dzień”; szkoła z terminem za 20 dni bez zdarzenia).
