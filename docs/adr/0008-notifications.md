# ADR 0008: powiadomienia, prośby klienta i zaproszenia personelu

Status: przyjęta (etap 4 demo), 2026-10-16.

## Kontekst

Wymaganie właściciela: „monity po obu stronach, najlepiej na telefon”. Trener ma wiedzieć, że klientowi kończy się pakiet
albo płatność jest po terminie; klient dostaje „zostały Ci ostatnie zajęcia, co dalej: odnawiasz, płacisz czy kończysz?”
z przyciskami, których odpowiedź wraca do trenera. Zdarzenia domenowe od etapów 1-3 leżały w `outbox_events`, ale nikt
ich nie przetwarzał.

## Decyzje

1. **Procesor outbox w TypeScript, wywoływany z zewnątrz.** `runOutbox()` (moduł `notifications`) działa na kliencie
   `service_role`: (a) reguły dzienne dopisują zdarzenia, (b) partia zdarzeń jest pobierana funkcją
   `claim_outbox_events` (`FOR UPDATE SKIP LOCKED`, blokada 5 minut, licznik prób), (c) zdarzenie zamienia się na
   powiadomienia, (d) wysyłka kanałami zewnętrznymi. Wywołuje go trasa `/api/cron/outbox` (sekret `CRON_SECRET`,
   porównanie stałoczasowe, bez sekretu trasa zwraca 503) oraz lokalnie pętla w `src/instrumentation-node.ts`
   (co 10 s w `next dev`, wyłączana `OUTBOX_DEV_POLL=off`). Po 5 nieudanych próbach zdarzenie zalega, a trasa zwraca 500
   (sygnał dla monitoringu).
   *Odrzucone:* `pg_cron` + `pg_net` (infrastruktura poza kodem aplikacji, trudna lokalnie) i wysyłka w transakcji
   zapisu (wolne zapisy, brak ponowień).
2. **Idempotencja na dwóch poziomach.** Powiadomienie ma unikalny klucz `(recipient_user_id, dedupe_key)`, a klucz to
   identyfikator zdarzenia. Dostarczenie per kanał zapisuje się w `notification_log` (`unique (notification_id, channel)`),
   więc ponowienie po awarii jednego kanału wysyła tylko to, co się nie udało. Reguły dzienne deduplikują zdarzenia
   przez `payload.dedupe_key` (częściowy unikalny indeks): zbliżający się termin raz, zaległość raz na tydzień
   zaległości, przypomnienie o zajęciach raz na zajęcia i klienta.
3. **Powiadomienia i zapisy tylko przez `service_role`.** Użytkownik czyta własną skrzynkę i zmienia wyłącznie
   `read_at` (uprawnienie kolumnowe). `notification_log` nie ma polityk. Prośby klienta powstają wyłącznie funkcją
   `create_client_request` (sprawdza aktywny dostęp klienta, własność pakietu i należności), personel zmienia tylko
   `status/seen_at/seen_by`.
4. **Prośby klienta są tylko informacją** (decyzja właściciela 2026-10-16): „Odnów pakiet”, „Zapłacę”, „Kończę
   współpracę” tworzą wpis i powiadomienie dla trenera, bez akceptacji. Jedna otwarta prośba na (klient, rodzaj,
   pakiet lub należność); powtórne kliknięcie zwraca istniejącą (blokada kartoteki klienta serializuje wyścig).
5. **Odbiorcy.** Klient: wszystkie konta z aktywnym `client_access`. Personel: przypisany trener klienta, a gdy go
   brak (lub nie jest już aktywny), właściciele i administratorzy.
6. **Kanały za interfejsami** (`EmailSender`, `PushSender`, `SmsSender`): e-mail przez Resend (`RESEND_API_KEY`),
   lokalnie przez HTTP API Mailpit; web push przez `web-push` z kluczami VAPID (`public/sw.js` obsługuje push i kliknięcie,
   tylko adresy tej samej domeny); **SMS w trybie podglądu** (log serwera). Brak konfiguracji kanału = wpis `skipped`
   w dzienniku, nie błąd. Domyślne preferencje: push i e-mail włączone, SMS wyłączony. Błąd kanału powoduje ponowienie
   zdarzenia; `sent`, `preview` i `skipped` są końcowe.
7. **Wysyłka zaproszenia klientowi.** Przyciski „Wyślij e-mailem” i „Wyślij SMS (podgląd)” przy zaproszeniu. Serwer
   nie przyjmuje treści od klienta HTTP: dostaje link i kod, sam sprawdza je z HMAC w bazie (ważne, niewykorzystane,
   dla tego klienta, link zaczyna się od `NEXT_PUBLIC_SITE_URL`) i składa wiadomość. Sekret nadal nie jest zapisywany.
8. **Zaproszenia personelu** na tej samej tabeli `invitations` (migracja 0007): funkcje `create_member_invitation`
   (właściciel zaprasza administratora, trenera, asystenta; administrator tylko trenera i asystenta; nowe zaproszenie na
   ten sam adres unieważnia poprzednie), `lookup_member_invitation` (publiczny podgląd, zamaskowany adres, globalny limit
   prób wspólny z zaproszeniami klientów), `accept_member_invitation` (tylko konto z adresem zaproszenia, jednorazowo,
   tworzy `organization_members` w jednej transakcji, błąd `DT006`, gdy osoba już jest członkiem),
   `revoke_member_invitation`. Link `/join/<token>` (43 znaki, w bazie tylko HMAC). E-mail z linkiem wysyłany od razu,
   jego niepowodzenie nie psuje zaproszenia. Strona `/app/team` (lista, oczekujące, zaproszenie, odwołanie).

## Konsekwencje

- Na produkcji potrzebny jest harmonogram wywołujący `/api/cron/outbox` (Vercel Cron: minutowy wymaga planu Pro; na
  hobby co najwyżej dziennie, więc na pilotaż potrzebny płatny plan albo zewnętrzny harmonogram).
- Powiadomienie o niskim stanie pojawia się do kilkunastu sekund (lokalnie) lub do minuty (cron); to nie jest
  transmisja na żywo. Odświeżenie widoku następuje przy nawigacji, bez WebSocketów.
- Prawdziwy SMS (adapter SMSAPI) i faktyczna subskrypcja push na telefonie wymagają konta u dostawcy i kluczy VAPID;
  interfejsy są gotowe, brakuje tylko adaptera SMS.
- `payment.recorded` nie niesie waluty; powiadomienie zakłada PLN (jedna waluta na organizację w MVP).
- Użytkownik w kilku organizacjach po przyjęciu zaproszenia trafia do pierwszej (przełącznik organizacji nadal do zrobienia).
