# ADR 0004: Klienci, psy i dostęp do panelu klienta

**Status:** przyjęta (2026-10-16)

## Decyzje
- **Klient (kartoteka) jest oddzielony od konta logowania.** `clients` to osoba lub rodzina w organizacji. Dostęp do panelu mają konta z `client_access`: jedna osoba może być klientem wielu organizacji, a do jednego klienta może mieć dostęp kilka osób.
- **Widoczność dla personelu (odstępstwo od planu v2.0).** Na MVP każdy aktywny członek organizacji widzi wszystkich klientów i psy organizacji. Plan zakłada, że trener widzi tylko własnych lub udostępnionych klientów. Takie ograniczenie ma sens razem ze współdzieleniem klientów w planie Szkoła (faza 3), więc wtedy zmieni się polityka RLS `clients_select_staff` bez zmiany schematu (kolumna `assigned_trainer_id` już istnieje).
- **Notatki o psach.** `dog_notes` są prywatne domyślnie. Klient widzi tylko notatki z `visible_to_client = true` do swoich psów (polityka `dog_notes_select_client` + `app.client_can_see_dog`). Rola `assistant` nie czyta notatek wcale.
- **Brak twardego usuwania.** Klientów i psy archiwizujemy (`archived_at`). Trwałe usuwanie zostaje procedurom RODO działającym jako `service_role`.
- **Złożone klucze obce** `(organization_id, client_id)` i `(organization_id, dog_id)` uniemożliwiają powiązanie danych z różnych organizacji.
- **Wyszukiwanie** używa `ilike` przez PostgREST `or(...)`. Fraza jest oczyszczana (`sanitizeSearch`), żeby znaki sterujące filtru nie zmieniały zapytania.

## Konsekwencje
Wszystkie polityki mają testy pgTAP w `supabase/tests/database/clients_dogs_isolation.test.sql`. Uruchomienie wymaga Dockera (`npm run db:test`).
