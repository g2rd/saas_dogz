# ADR 0001: Modularny monolit

**Status:** przyjęta (2026-10-16)

## Kontekst
Projekt prowadzi jedna osoba, a produkt ma obsłużyć setki organizacji bez przepisywania. Mikroserwisy dodałyby koszt operacyjny bez korzyści na tym etapie.

## Decyzja
Jedna aplikacja Next.js i jedna baza PostgreSQL. Kod dzieli się na moduły w `src/modules/<moduł>` z warstwami `domain` (czysta logika), `application` (przypadki użycia), `infrastructure` (repozytoria, adaptery) i `ui`.

- Moduł importuje inny moduł wyłącznie przez jego `index.ts`.
- `domain` nie zależy od Next.js, Reacta ani Supabase.
- `src/shared` nie zależy od modułów.
- Klient `service_role` jest niedostępny z tras UI.

Reguły wymusza `npm run check:boundaries` (dependency-cruiser), uruchamiane w CI.

## Konsekwencje
Granice modułów i zdarzenia domenowe (outbox) pozwalają później wydzielić moduł do osobnej usługi bez przepisywania reszty.
