# ADR 0017: wygasła sesja i linki powrotu w trybie standalone

Status: przyjęta, 2026-10-29. Bez migracji.

## Kontekst

1. Gdy sesja Supabase wygasała lub została unieważniona, użytkownik trafiał na stronę logowania bez słowa wyjaśnienia, a formularz wysłany po utracie sesji
   kończył się ogólnym komunikatem lub „Brak uprawnień do tej operacji”.
2. Aplikacja zainstalowana na ekranie głównym (`display: standalone`) nie ma przycisku „Wstecz” przeglądarki, a część podstron z menu „Więcej”
   (zespół, powiadomienia, zgłoszenia) nie miała linku powrotu.

## Decyzje

1. **Proxy** (`src/shared/supabase/proxy.ts`): niezalogowany na trasie chronionej jest odsyłany na `/login?next=...`; gdy żądanie niosło ciasteczko sesji
   (`sb-…auth-token`), które nie przeszło weryfikacji, dodajemy `expired=1`. Przekierowanie ma kod 303. Brak ciasteczka (pierwsza wizyta) nie daje komunikatu.
2. **Strona logowania** pokazuje komunikat „Sesja wygasła. Zaloguj się ponownie.” (`role="status"`) przy `expired=1`; po zalogowaniu wracamy pod `next`.
3. **Akcje serwerowe:** proxy przepuszcza żądania z nagłówkiem `next-action` (przekierowanie z proxy zostawiało formularz bez reakcji). Każda akcja sama sprawdza sesję;
   `getRequestContext` i `getPortalContext` zwracają `unauthenticated` ze szczegółem `reason: "session_expired"`, a `toFormState` zamienia taki błąd na
   `redirect("/login?expired=1")`. Błędne dane logowania (też `unauthenticated`, bez tego szczegółu) działają jak dotąd. Strony (`requireContext`,
   `requirePortalContext`, pulpit) odsyłają do `/login?expired=1`.
4. **`BackLink`** (`src/shared/ui/back-link.tsx`, `data-testid="back-link"`) na podstronach z menu „Więcej” bez linku powrotu: `/app/team`, `/app/notifications`,
   `/app/feedback`, `/portal/notifications`, `/portal/feedback`. Pozostałe podstrony miały już link powrotu albo są zakładkami dolnej nawigacji.
5. **Testy:** `e2e/session.spec.ts` (zepsute ciasteczka sesji: wejście na stronę, wysłanie formularza, brak komunikatu bez sesji; linki powrotu w obu panelach).
   Powitania w `language.spec.ts` i `portal.spec.ts` szukane po roli nagłówka, bo ogłaszacz zmiany trasy (rola `alert`) powtarza ten sam tekst.

## Skutki

- Odświeżanie wygasłej sesji nadal robi proxy; zmiana dotyczy tylko tego, co widzi użytkownik, gdy odświeżenie się nie udaje.
- Akcje, które nie używają `toFormState`, pokazują zwykły komunikat „Zaloguj się, aby kontynuować.” (kod `unauthenticated`).
