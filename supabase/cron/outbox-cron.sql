-- Cron powiadomień w samej bazie (pg_cron + pg_net + Vault): co minutę wywołuje trasę /api/cron/outbox aplikacji.
-- Działa na KAŻDYM planie Supabase (także Free) i na każdym hostingu, więc nie wymaga Vercel Pro. Wersja z Vercel Cron: patrz docs/WDROZENIE-STAGING.md.
--
-- To NIE jest migracja (adres i sekret zależą od środowiska): uruchom raz w SQL Editorze projektu Supabase danego środowiska,
-- po podmianie dwóch wartości oznaczonych <...>. Sekret zapisujemy w Vault (szyfrowany), a nie w treści zadania.
-- Sprawdzone lokalnie (Supabase CLI 2.121): zadanie wykonuje się co minutę i dostaje odpowiedź 200 z raportem procesora.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. Sekret crona (ta sama wartość co CRON_SECRET we wdrożeniu aplikacji). Uruchom raz; powtórne wywołanie zgłosi, że sekret już istnieje.
select vault.create_secret('<WARTOŚĆ CRON_SECRET>', 'dogtrainer_cron_secret');

-- 2. Zadanie co minutę (timeout 30 s: procesor przetwarza do 25 zdarzeń na przebieg)
select cron.schedule(
  'dogtrainer-outbox',
  '* * * * *',
  $$
  select net.http_get(
    url := '<ADRES APLIKACJI, np. https://staging.twojadomena.pl>/api/cron/outbox',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'dogtrainer_cron_secret')
    ),
    timeout_milliseconds := 30000
  );
  $$
);

-- Kontrola po minucie: ostatnie wykonania zadania i odpowiedzi aplikacji (kod 200 = powiadomienia są przetwarzane;
-- 401 = zły sekret, 503 = CRON_SECRET nie jest ustawiony we wdrożeniu aplikacji, 500 = są zdarzenia, które wyczerpały 5 prób).
-- select jobid, status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
-- select id, status_code, timed_out, left(content, 160) as odpowiedz from net._http_response order by id desc limit 5;

-- Zmiana adresu albo wyłączenie:
-- select cron.unschedule('dogtrainer-outbox');
