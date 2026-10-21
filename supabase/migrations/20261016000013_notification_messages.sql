-- Powiadomienia wielojęzyczne (etap 4): oprócz gotowego tekstu zapisujemy klucz komunikatu i jego parametry.
-- Tytuł i treść zostają jako zapas (starsze wpisy, klucz nieznany nowszej wersji); dzwonek składa tekst z klucza w języku widza,
-- a e-mail i push w języku odbiorcy z profilu (profiles.locale).
alter table public.notifications
  add column message_key text check (message_key is null or message_key ~ '^[a-z][a-z0-9_]*$'),
  add column message_params jsonb not null default '{}'::jsonb check (jsonb_typeof(message_params) = 'object');

comment on column public.notifications.message_key is 'Klucz komunikatu w katalogu notify.<klucz>.title|body; null dla wpisów sprzed etapu 4.';
comment on column public.notifications.message_params is 'Parametry komunikatu (kwota w groszach, moment UTC, strefa szkoły, nazwy); surowe wartości, formatowane przy wyświetlaniu.';
