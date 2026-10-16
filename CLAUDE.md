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
- Etap pracy = nowa gałąź, testy (`typecheck`, `lint`, `test`, `db:test`, `test:integration`, `check:boundaries`, `build`), przeklikanie w przeglądarce, ADR, aktualizacja planu, commit. Scalanie do `main` i `git push` tylko na prośbę właściciela.
- Commity kończ linią `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Hasła i klucze nie trafiają do repozytorium ani do rozmowy; konta testowe tylko lokalne.
