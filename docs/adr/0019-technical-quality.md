# ADR 0019: jakość techniczna: kody powodu, typy bazy, pseudo-lokalizacja

Status: przyjęta, 2026-10-29. Migracja `20261029000004_reason_codes.sql`.

## Decyzje

1. **Kody powodu zamiast polskich tekstów w rejestrach SQL.** Automaty zapisywały po polsku: uwagi w `package_ledger.note` („Cofnięcie zakończenia zajęć”,
   „Przywrócenie odwołanych zajęć”), `organizations.status_reason` („Okres dostępu dobiegł końca”) i `outbox_events.last_error` („cofnięte przed wysłaniem”).
   Teraz: `package_ledger.note_code` (`undo_complete`, `restore_canceled`), `organizations.status_reason_code` (`access_expired`), a `last_error` dostaje
   `undone_before_send`. Funkcje `undo_complete_session`, `undo_cancel_session`, `expire_organization_access`, `admin_set_organization_status`,
   `app.drop_pending_events` i wyzwalacz ochrony kolumn szkoły zostały odtworzone; istniejące wiersze są przepisane na kody. Uwagi i powody wpisane
   przez ludzi zostają tekstem (`note`, `status_reason`), a ręczna zmiana statusu zeruje kod. Interfejs składa treść z kodu w języku widza
   (`labels.ledgerNote.*`), powiadomienie o końcu dostępu ma własny klucz `notify.org_access_expired`, a panel właściciela (po polsku) dostaje tekst z
   funkcji `admin_organizations_overview`.
2. **Typy bazy generowane z migracji** (`npm run db:types` → `src/shared/db/database.types.ts`): klienci `createUserClient` i `createServiceClient` są typowani
   (`Database`). CI sprawdza, że plik jest aktualny (`git diff --exit-code` po wygenerowaniu), więc zmiana schematu bez regeneracji typów zatrzymuje build.
   Repozytoria nadal rzutują wyniki własnymi typami wierszy; przechodzenie na typy generowane dzieje się stopniowo, przy dotykaniu danego repozytorium.
3. **Tekst zapasowy w `public/sw.js`:** gdy brak sieci i brak strony offline w pamięci, odpowiedź to neutralne „Offline” (503), a nie polski napis; właściwa strona
   offline jest już w języku odbiorcy (ADR 0013).
4. **Pseudo-lokalizacja** (`src/shared/i18n/pseudo.ts`): wydłuża każdy komunikat (samogłoski podwojone z akcentem, ok. +35%), ujmuje go w `[ ]` i zachowuje składnię
   ICU i tagi. Działa tylko, gdy serwer ma `ENABLE_PSEUDO_LOCALE=1` (serwer testów E2E) **i** przeglądarka ma ciasteczko `dt_pseudo=1`; na produkcji zmiennej nie ustawiamy.
   Test `e2e/pseudo-locale.spec.ts` przechodzi ekrany trenera (16) i klienta (7) w widoku telefonu i wymaga braku poziomego przewijania; tekst bez nawiasów na
   ekranie oznacza napis wpisany na stałe.

## Skutki

- Nowy tekst automatyczny w bazie = nowy kod + klucz w katalogach (pl, en), nie literał w SQL.
- Po każdej migracji zmieniającej schemat: `npm run db:types` i commit pliku typów.
- Zostaje: trzeci język (etap 6) jako test skalowalności; pseudo-lokalizacja nie obejmuje e-maili i stron publicznych.
