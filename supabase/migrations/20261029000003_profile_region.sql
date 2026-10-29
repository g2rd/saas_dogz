-- Region (kraj) użytkownika wybrany w ustawieniach (ADR 0018): zapisywany obok języka; null = automatycznie z urządzenia.
-- Interfejs czyta region z ciasteczka; kolumna służy do powiadomień i późniejszych funkcji po stronie serwera.
alter table public.profiles
  add column region text check (region is null or region ~ '^[A-Z]{2}$');
