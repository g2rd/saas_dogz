# ADR 0021: stały link i kod QR szkoły z akceptacją trenera

Status: przyjęta, 2026-10-29. Migracja `20261029000005_school_join.sql`.

## Kontekst

Zaproszenia klientów ([ADR 0007](0007-client-invitations-portal.md)) są jednorazowe i dotyczą konkretnej kartoteki: trener musi najpierw dodać klienta, potem wygenerować mu
kod. Dla szkoły z wieloma klientami przydałby się jeden stały kod QR (na drzwiach, wizytówce, stronie), po którego zeskanowaniu klient sam zakłada konto i prosi o dostęp.

## Decyzje

1. **Jeden aktywny link na szkołę** (`school_join_links`): token 256 bitów (base64url), **jawny** w bazie, bo ma być widoczny po każdym otwarciu ekranu (wydruk QR). Daje wyłącznie prawo
   do wysłania prośby, nigdy do danych. Czytają go tylko właściciel i administrator (RLS), zmiany tylko funkcją `rotate_school_join_link` (nowy token unieważnia poprzedni,
   audyt). Wymiana linku służy też jako „wycofanie” wydrukowanego kodu.
2. **Prośba o dołączenie** (`join_requests`): `request_school_join` (zalogowany użytkownik, token aktywnego linku, szkoła nie zawieszona i nie tylko do odczytu) zapisuje imię, nazwisko,
   telefon, wiadomość i e-mail konta (z `auth.users`, nie z formularza) oraz **nazwę szkoły w chwili prośby** (osoba bez dostępu nie czyta tabeli `organizations`). Jedna oczekująca
   prośba na osobę i szkołę (powtórzenie zwraca tę samą); limity nadużyć: 5 oczekujących i 10 próśb na dobę na osobę (`DT003`); personel i klienci szkoły dostają `DT006`.
   Autor widzi własne prośby, personel (właściciel, administrator, trener) prośby swojej szkoły; zapisy wyłącznie funkcjami.
3. **Decyzja trenera** (`decide_join_request`, właściciel/administrator/trener, szkoła nie zamrożona, blokada wiersza): akceptacja zakłada kartotekę z danych prośby **albo** łączy konto z
   wybraną istniejącą (np. klientem, którego trener już prowadził), tworzy `client_access` (`owner`, a przy drugim koncie tej samej kartoteki `family`), zapisuje zdarzenie i audyt;
   odrzucenie niczego nie tworzy. Rozpatrzonej prośby nie można rozpatrzyć ponownie (`DT019`).
4. **Zamknięta rejestracja:** token aktywnego linku jest dowodem w `app.signup_check` (obok kodu beta i zaproszeń), więc klient może założyć konto także w trakcie zamkniętej bety;
   konto może wyłącznie wysłać prośbę. Jeśli link zostanie nadużyty, trener wymienia go jednym przyciskiem.
5. **Aplikacja:** `/school/[token]` (publiczna; nazwa szkoły, formularz rejestracji albo prośby), `/school` (status własnych próśb; tam trafia po zalogowaniu osoba z oczekującą prośbą,
   `resolveLandingPath`), `/app/join-requests` (link i QR dla właściciela/administratora, lista próśb z akceptacją/odrzuceniem i wyborem istniejącego klienta; pozycja w „Więcej”). Powiadomienia:
   `join_request.created` do właścicieli i administratorów, `join_request.approved` do klienta (dzwonek, e-mail, push w jego języku).
6. **Testy:** pgTAP `school_join.test.sql` (RLS, funkcje, zamknięta rejestracja, wyjątki z listy funkcji publicznych w `security_invariants`), E2E `e2e/school-join.spec.ts`
   (link, rejestracja, prośba, powiadomienia e-mail, akceptacja, odrzucenie, połączenie z istniejącym klientem, wymiana linku, izolacja szkół).

## Skutki

- Token w linku widzi każdy, kto zobaczy wydruk; dlatego prośba wymaga akceptacji, a link można wymienić. Prośba nie ujawnia żadnych danych szkoły poza jej nazwą.
- Zostaje: edycja danych prośby przez trenera przed akceptacją, powiadomienie o odrzuceniu (dziś klient widzi status na `/school`), kafelek próśb na pulpicie, licznik w menu.
