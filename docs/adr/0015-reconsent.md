# ADR 0015: ponowna zgoda po zmianie regulaminu

Status: przyjęta, 2026-10-29. Migracja `20261029000001_accept_legal.sql`.

## Kontekst

Zgodę na regulamin i politykę prywatności zapisywał tylko wyzwalacz zakładania konta ([migracja 0018](../../supabase/migrations/20261016000018_consents.sql)).
Po podniesieniu `LEGAL_VERSION` (`src/shared/legal.ts`) istniejące konta zostawały bez zgody na nową wersję, a aplikacja nie miała jak jej zebrać.

## Decyzje

1. **Funkcja `public.accept_legal(p_version)`** (`security definer`, `search_path = ''`): dopisuje zalogowanemu użytkownikowi zgody na oba dokumenty
   w podanej wersji (format `RRRR-MM-DD`, powtórzenie nic nie zmienia, język z profilu). Tabela `consents` pozostaje bez praw zapisu dla użytkownika,
   a stare zgody zostają jako ślad. Dostęp tylko dla roli `authenticated`.
2. **Bramka w układach `/app` i `/portal`** (komponent `LegalGate` owijający treść strony w `<Suspense>`; wcześniej `await` wprost w układzie blokował prerender trasy i dev zgłaszał „uncached data during prerendering”, poprawka 2026-10-29): kto nie ma zgody na wszystkie dokumenty w wersji `LEGAL_VERSION`, trafia na
   `/accept-terms`. Sprawdzenie robi serwer przy każdym wejściu (jedno zapytanie RLS po `consents`), więc działa też po wejściu z zakładki, przez
   PWA i przez bezpośredni adres. Panel `/admin` i strony publiczne bez bramki.
3. **Ekran `/accept-terms`**: komunikat o zmianie, to samo pole zgody co w rejestracji (`ConsentField`, linki do obu dokumentów), przycisk
   „Akceptuję i przechodzę dalej” i wylogowanie. Po zapisie przekierowanie do `/start` (właściwy panel); kto ma już bieżącą zgodę, jest od razu odsyłany.
4. **Egzekwowanie tylko w interfejsie.** Akcje serwerowe i API nie sprawdzają zgody (blokada w bazie, jak przy statusie szkoły, byłaby uciążliwa przy
   każdej zmianie tekstu). Zgoda jest dowodem akceptacji, a nie zabezpieczeniem danych; jeśli kiedyś będzie potrzebna w bazie, trzeba ją dodać do sprawdzeń zapisu w funkcjach SQL.
5. **Testy tylko automatyczne** (decyzja właściciela): scenariusz E2E w `e2e/auth.spec.ts` (konto ze zgodą na starą wersję → logowanie → `/accept-terms`,
   `/app/clients` i `/portal` zablokowane → zaznaczenie zgody → panel, cztery wiersze w `consents`). Konta zakładane w E2E dostają `consent_version`
   bieżącej wersji (`createAccount`), żeby pozostałe scenariusze nie zatrzymywały się na ekranie zgody.

## Skutki

- Zmiana treści dokumentów: podnieś `LEGAL_VERSION`, a każde konto zaakceptuje nową wersję przy najbliższym wejściu do panelu.
- Układy `/app` i `/portal` są teraz asynchroniczne (`await requireCurrentConsent()`); nagłówek strony czeka na to jedno zapytanie.
- Powitania w E2E szukamy po roli nagłówka, bo ogłaszacz zmiany trasy (rola `alert`) powtarza ten sam tekst.
