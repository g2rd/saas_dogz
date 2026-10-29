# ADR 0014: ustawienia szkoły i blokada zmiany waluty

Status: przyjęta, 2026-10-21. Migracja `20261021000001_school_settings.sql`.

## Kontekst

Szkoła ma jedną walutę, strefę czasową i język w `organization_settings`. Wartości startowe bierzemy z urządzenia przy zakładaniu szkoły
([ADR 0013](0013-i18n.md)), ale właściciel nie miał jak ich poprawić, a nic nie chroniło przed zmianą waluty w szkole, która ma już
zapisane kwoty (kwoty w groszach bez waluty straciłyby sens, a rejestry finansowe są tylko do dopisywania).

## Decyzje

1. **Ekran „Ustawienia szkoły”** (`/app/settings`, link w `Więcej`) dla ról z uprawnieniem `organization.update` (właściciel, administrator).
   Trener i asystent nie widzą linku, a adres bezpośredni daje 404. Pola: waluta, strefa czasowa, język szkoły (spośród `ENABLED_LOCALES`),
   próg późnego odwołania (godziny, 0-720) i czy późne odwołanie zużywa zajęcie z pakietu. Dwa ostatnie pola istniały w bazie i
   były używane przez logikę zajęć, ale nie miały ekranu.
2. **Zapis wprost do `organization_settings`** przez klienta w kontekście użytkownika (polityka RLS dla owner/admin już istniała), bez nowej
   funkcji `security definer`. Aplikacja waliduje wejście (Zod, `Intl`), a **bazę pilnują wyzwalacze**, więc obejście aplikacji (bezpośrednie
   wywołanie API) niczego nie omija:
   - `organization_settings_guard` (przed zmianą): zmiana waluty przy istniejących `client_packages`, `charges` lub `payments` kończy się błędem
     `DT018`; strefa musi istnieć w `pg_timezone_names` (inaczej `23514`);
   - ograniczenia tabeli: waluta `^[A-Z]{3}$`, język `^[a-z]{2,3}$`, próg odwołania do 720 godzin;
   - `organization_settings_after_update` (po zmianie): dozwolona zmiana waluty przepisuje walutę cennika (`session_types`,
     `package_templates`), a każda zmiana wartości trafia do `audit_log` (`organization.settings_updated`, pola `from` i `to`).
3. **Blokada waluty jest twarda i bez wyjątku w aplikacji.** Gdy szkoła ma rekordy z kwotami, ekran pokazuje walutę tylko do odczytu z
   wyjaśnieniem i odsyła do „Zgłoś problem lub pomysł”. Wyzwalacz blokuje też `service_role`, więc ewentualna zmiana w razie pomyłki wymaga
   świadomej interwencji w bazie (tymczasowe wyłączenie wyzwalacza po przeliczeniu lub korekcie zapisanych kwot), a nie kliknięcia.
4. **Cennik przy zmianie waluty:** kwoty w groszach zostają bez zmian (nie przeliczamy kursem), zmienia się tylko waluta; ekran ostrzega,
   żeby sprawdzić ceny. Zmiana jest możliwa tylko w szkole bez kwot, więc dotyczy wyłącznie cennika w przygotowaniu.
5. **Strefa czasowa** zmienia sposób wyświetlania godzin zajęć i granice dnia; zapisane terminy (`timestamptz`) nie są przeliczane.
6. **Język szkoły** (`locale`) służy wiadomościom do osób bez konta (zaproszenia e-mail); osoby z kontem widzą aplikację we własnym języku.

## Konsekwencje

- Pierwsze wywołanie `update` przy zakładaniu szkoły (ustawienia z urządzenia) też trafia do `audit_log`, jeśli zmienia wartości domyślne.
- Zmiana waluty przez właściciela platformy w panelu `/admin` (service_role) nadal jest blokowana wyzwalaczem, jeśli są kwoty; to zamierzone.
- Kolejne ustawienia szkoły (np. region do formatu dat, numer telefonu z biblioteką numerów) dodajemy do tego samego ekranu i tabeli.
