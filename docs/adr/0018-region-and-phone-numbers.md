# ADR 0018: region użytkownika i numery telefonów

Status: przyjęta, 2026-10-29. Migracja `20261029000003_profile_region.sql`.

## Kontekst

Numer bez prefiksu był zawsze liczony jako polski (`+48`, tylko 9 cyfr), a region (kraj) znaliśmy wyłącznie z nagłówka `Accept-Language`, bez możliwości
poprawienia go w ustawieniach. Poza Polską numery krajowe były odrzucane lub źle zapisywane.

## Decyzje

1. **Region wybierany w „Więcej”** (sekcja „Język i region”): lista krajów z `SUPPORTED_REGIONS` (te, dla których znamy walutę), nazwy z `Intl.DisplayNames`
   w języku interfejsu, opcja „Automatycznie (z urządzenia)”. Wybór zapisuje ciasteczko `dt_region` (działa od razu) i `profiles.region` (kod `AA`, `null` =
   automatycznie). Interfejs czyta region z ciasteczka; kolumna w profilu służy do powiadomień i późniejszych funkcji po stronie serwera.
   `resolveLocale` zwraca `region` (wybrany albo z przeglądarki) i `chosenRegion` (tylko ręczny wybór).
2. **Numery telefonów przez `libphonenumber-js` (wersja `min`)** w `src/shared/phone.ts`: `normalizePhone(raw, defaultCountry)` zapisuje E.164
   (`+447911123456`); numer z `+` lub `00` zachowuje własny kraj, numer bez prefiksu jest numerem z kraju `defaultCountry`. Poprawność to `isPossible()`
   (długość i wzorzec kraju), nie `isValid()`, żeby nie odrzucać numerów, których plan numeracji jeszcze nie zna. Nierozpoznany numer zostaje bez zmian i
   odrzuca go walidacja („Niepoprawny numer telefonu”).
3. **Kraj domyślny to region użytkownika, a bez niego Polska** (`getPhoneCountry`, `DEFAULT_PHONE_COUNTRY`). Trafia do przypadków użycia jako opcja
   (`createClient`, `updateClient`, `previewClientImport`, `importClients` przyjmują `{ phoneCountry }`), więc domena nie czyta ciasteczek. Import CSV używa
   tego samego kraju do normalizacji i wykrywania duplikatów.
4. **Podpowiedź pod polem telefonu** zależy od regionu („Numer bez prefiksu zapiszemy jako numer z kraju: Wielka Brytania (+44)…”); liczy ją serwer
   (`getPhoneHint`), formularz dostaje gotowy tekst.
5. **Zmiana waluty nowej szkoły i formatów dat** nadal korzysta z regionu (`currencyFor`, `intlLocale`), więc ręczny wybór regionu działa też tam.
6. **Test:** `e2e/region.spec.ts` (domyślnie Polska; wybór Wielkiej Brytanii zapisuje region w profilu, `07911 123456` → `+447911123456`; numer z `+48`
   zachowany; zły numer odrzucony; „Automatycznie” czyści region).

## Skutki

- Nowa zależność: `libphonenumber-js` (po stronie serwera; formularz klienta nie importuje biblioteki).
- Istniejące numery w bazie bez zmian; porównania duplikatów normalizują je tym samym kodem krajowym.
- Zostaje: trzeci język (etap 6), przegląd tłumaczenia przez osobę znającą branżę.
