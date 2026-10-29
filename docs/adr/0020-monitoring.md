# ADR 0020: monitoring: endpoint stanu i raportowanie błędów do Sentry

Status: przyjęta, 2026-10-29. Bez migracji.

## Kontekst

Etap 10 (testy z prawdziwymi trenerami) wymaga, żeby awaria bazy, zatrzymany cron powiadomień albo błąd w kodzie były widoczne, zanim zgłosi je użytkownik.
Kluczowa obietnica produktu (powiadomienia) działa tylko wtedy, gdy harmonogram przetwarza outbox ([Ryzyka](../ARCHITEKTURA-I-STAN-PRAC.md#9-ryzyka-i-uwagi)).

## Decyzje

1. **`GET /api/health`** (publiczny, bez danych, `Cache-Control: no-store`): sprawdza odpowiedź bazy (odczyt jednej szkoły kluczem serwisowym) i zaległości w outboxie
   (zdarzenia bez `processed_at`, starsze niż 15 minut i niewstrzymane oknem „Cofnij”). Odpowiedź `200 {"status":"ok","checks":{"database":true,"outbox":true}}` albo
   `503 {"status":"degraded","checks":{…}}`. Monitor dostępności (UptimeRobot, Better Stack) alarmuje po kodzie innym niż 200.
2. **Sentry bez SDK** (`src/shared/monitoring/sentry.ts`): zwykłe żądanie HTTP z „envelope” na adres z `SENTRY_DSN`, w `onRequestError` (`src/instrumentation.ts`: render,
   akcje serwerowe, trasy API) i w zadaniu `cron/outbox`. Bez `SENTRY_DSN` nic nie jest wysyłane. Powody: brak dużej zależności i zgodności z Cache Components, pełna kontrola
   nad tym, co opuszcza serwer, działanie w środowisku Node i edge. Raportowanie ma limit 3 s i nigdy nie rzuca wyjątku.
3. **Prywatność:** wysyłamy typ i komunikat błędu (do 500 znaków), stos, **wzorzec trasy** (`/invite/[secret]`, nie rzeczywisty adres z tokenem ani zapytaniem), metodę,
   `digest` Next (ten sam kod widzi użytkownik na stronie błędu), środowisko i wydanie. Nie wysyłamy nagłówków, ciasteczek, treści żądań, adresów e-mail ani identyfikatorów
   użytkowników. Sentry jest podprocesorem: trzeba go dopisać do polityki prywatności i umowy powierzenia (region UE).
4. **Bez raportowania błędów przeglądarki** (świadomie): strona błędu pokazuje `digest`, po którym znajdziemy wpis serwerowy; SDK w przeglądarce zbierałoby więcej danych osobowych
   i ważyło. Do rozważenia po okresie testowym.
5. **`env:check`** ostrzega, gdy `SENTRY_DSN` jest pusty lub nie wygląda jak DSN (ciche gubienie błędów); to ostrzeżenie, nie błąd.
6. **Testy:** `e2e/monitoring.spec.ts` (serwer testowy ma `SENTRY_DSN` wskazujący na lokalny odbiornik udawany przez test): zdrowy stan 200; 503 przy zaległym zdarzeniu outboxu;
   błąd renderu strony (`/app/clients/nie-uuid`) dociera do odbiornika z poprawnym nagłówkiem, wzorcem trasy `/app/clients/[id]` i bez adresu, ciasteczek ani e-maila.

## Skutki

- Do uruchomienia po stronie właściciela: konto Sentry (UE), `SENTRY_DSN` w Vercel, monitor na `/api/health` (instrukcja: `WDROZENIE-STAGING.md`, krok 9).
- Interwał monitora 1-5 minut; 503 z `outbox: false` znaczy, że cron nie działa albo zdarzenia wyczerpały próby (zapytanie diagnostyczne w `supabase/cron/outbox-cron.sql`).
