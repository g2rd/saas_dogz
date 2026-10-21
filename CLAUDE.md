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
- Przepływ gałęzi (pull requesty, decyzja właściciela 2026-10-21): **Claude nigdy nie pushuje do `dev` ani `main`, nie scala PR-ów i ich nie zatwierdza; robi to wyłącznie właściciel.** Etap pracy = nowa gałąź `feat/...` (albo `fix/...`) z aktualnego `origin/dev`, testy (`typecheck`, `lint`, `test`, `db:test`, `test:integration`, `check:boundaries`, `build`), przeklikanie w przeglądarce, ADR, aktualizacja planu, commit, **wypchnięcie tej gałęzi (Claude może to robić bez pytania) i otwarcie PR-a do `dev`** (`gh pr create`, a gdy brak `gh`, link z komunikatu `git push`). Review kodu robi właściciel (automatycznego review przez AI w GitHub Actions nie używamy); Claude reaguje na jego uwagi dodatkowymi commitami w tej samej gałęzi. Właściciel zatwierdza i scala PR do `dev`; do `main` trafia wyłącznie PR `dev` -> `main` zatwierdzony przez właściciela. `git push` wykonuj w terminalu użytkownika (`run_in_terminal`), bo logowanie do GitHuba wymaga przeglądarki. Po scaleniu PR-a przez właściciela zsynchronizuj lokalny `dev` z `origin/dev`.
- Commity bez dopisku o współautorstwie Claude (decyzja właściciela 2026-10-16): w komunikacie zostają tylko opis zmiany i adnotacje właściciela.
- Hasła i klucze nie trafiają do repozytorium ani do rozmowy; konta testowe tylko lokalne.
