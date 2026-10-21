# DogTrainer SaaS: instrukcje dla Claude Code

## Zawsze na początku
Przeczytaj `docs/ARCHITEKTURA-I-STAN-PRAC.md`, sekcję 0 („Start nowej sesji”) i tabelę etapów. To jedyne źródło prawdy o tym, co jest zrobione i co zostało. Przeczytaj też `AGENTS.md` (ten Next.js ma zmiany łamiące zgodność; dokumentacja jest w `node_modules/next/dist/docs/`).

## Wymóg właściciela: aktualizuj plan
Po każdej zmianie (etap, migracja, decyzja, błąd, nowe zadanie) zaktualizuj `docs/ARCHITEKTURA-I-STAN-PRAC.md` w tym samym commicie: tabelę etapów w sekcji 0, sekcję 5 (co zrobione), sekcję 6 (wyniki testów), sekcję 8 (lista zadań) oraz sekcję 11 (plan bieżącego etapu). Decyzje projektowe zapisuj jako ADR w `docs/adr/`. Przed zakończeniem pracy sprawdź, że kolejna sesja z samego pliku zrozumie, na czym stoimy.

## Konwencje
- Język interfejsu, komentarzy i dokumentacji: polski. Kod i nazwy techniczne: angielski.
- Architektura: modularny monolit (`src/modules/<moduł>/{domain,application,infrastructure,ui}`, publiczne API w `index.ts`); granice pilnuje `npm run check:boundaries`.
- Dostęp do danych tylko przez `supabase-js` w kontekście użytkownika (RLS zawsze działa). Klucz `service_role` tylko w zadaniach w tle, webhookach i panelu administratora.
- Nowa tabela = RLS + test pgTAP. Zapisy wielotabelowe jako funkcje SQL `security definer` ze sprawdzeniem roli i organizacji.
- Przepływ gałęzi: **wszystkie zmiany trafiają do gałęzi `dev`** (integracyjnej). Etap pracy = nowa gałąź `feat/...` z `dev`, testy (`typecheck`, `lint`, `test`, `db:test`, `test:integration`, `check:boundaries`, `build`), przeklikanie w przeglądarce, ADR, aktualizacja planu, commit, scalenie do `dev`. **`main` zmieniamy dopiero po wyraźnym zatwierdzeniu przez właściciela** (merge `dev` do `main` i push). `git push` tylko na prośbę właściciela; logowanie do GitHuba wymaga przeglądarki, więc push uruchamiaj w terminalu użytkownika (`run_in_terminal`), nie w powłoce Claude.
- Commity bez dopisku o współautorstwie Claude (decyzja właściciela 2026-10-16): w komunikacie zostają tylko opis zmiany i adnotacje właściciela.
- Hasła i klucze nie trafiają do repozytorium ani do rozmowy; konta testowe tylko lokalne.

## Code review (automatyczny, GitHub Actions)
Przegląd robi `.github/workflows/claude-review.yml` (PR i pushe do `dev`/`main`; wymaga sekretu `ANTHROPIC_API_KEY`). Priorytety: bezpieczeństwo i RLS (izolacja organizacji, `security definer` z `search_path = ''`, brak `service_role` poza dozwolonymi miejscami), poprawność i idempotencja (outbox, płatności, pakiety, rejestry tylko do dopisywania), granice modułów, testy dla nowej logiki i migracji. Bez uwag o stylu, które łapią lint i typecheck. Odpowiedzi po polsku.
