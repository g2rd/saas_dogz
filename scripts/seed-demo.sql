-- Dane demonstracyjne dla panelu właściciela /admin (tylko lokalnie!): kilkanaście szkół o różnym statusie i aktywności,
-- z trenerami, klientami, zajęciami i klientami w panelu. Skrypt jest idempotentny: najpierw usuwa poprzednie dane demo
-- (szkoły o slugu `demo-*` i konta `*@demo.example.test`), potem tworzy je od nowa.
-- Hasło wszystkich kont demo: Demo-Haslo-2026 (np. wlasciciel.burek@demo.example.test, trener1.burek@demo.example.test).
-- Uruchomienie: `npm run seed:demo` (wymaga lokalnego Supabase w Dockerze).

begin;

-- 1. Sprzątanie poprzednich danych demo ------------------------------------------------------------------------------
delete from public.organizations where slug like 'demo-%';
delete from auth.users where email like '%@demo.example.test';

create temporary table demo_schools (
  slug text primary key,
  name text,
  status text,
  access_offset_days integer,   -- termin dostępu względem dziś (null = bez terminu)
  reason text,
  staff_n integer,
  clients_n integer,
  portal_n integer,
  sessions_n integer,
  login_days_ago integer,       -- ostatnie logowanie właściciela (null = nigdy)
  created_days_ago integer,
  push_n integer,
  notes text
) on commit drop;

insert into demo_schools values
  ('demo-burek',     'Szkoła Psa Burka',        'active',    60,   null,                              4, 28, 12, 120, 0,    75, 3, 'Klient założycielski. Cena 49 zł.'),
  ('demo-akademia',  'Psia Akademia',           'trial',     5,    null,                              2, 14,  6,  60, 1,    14, 2, 'Test do końca tygodnia, zapytać o opinię.'),
  ('demo-lapa',      'Łapa i Ogon',             'trial',     12,   null,                              1,  7,  2,  18, 9,    10, 1, null),
  ('demo-klasa',     'Pies z Klasą',            'trial',     20,   null,                              1,  3,  0,   6, 18,   21, 0, 'Przestał się logować, napisać.'),
  ('demo-weszenie',  'Warsztat Węszenia',       'active',    null, null,                              4, 42, 20, 150, 0,    120, 4, null),
  ('demo-nowicjusz', 'Szkoła Nowicjusza',       'trial',     14,   null,                              1,  0,  0,   0, null, 2,  0, 'Konto założone, nie logował się.'),
  ('demo-dogo',      'Dogo Team',               'read_only', -3,   'Koniec okresu próbnego',          2, 10,  3,  40, 6,    40, 1, 'Czeka na decyzję o płatnym planie.'),
  ('demo-premium',   'Czworonogi Premium',      'suspended', -20,  'Brak płatności za październik',   2, 15,  5,  55, 25,   90, 0, 'Zawieszone do czasu opłaty.'),
  ('demo-przygoda',  'Przygoda z Psem',         'trial',     3,    null,                              3, 20,  8,  70, 0,    13, 2, 'Dobrze używają, przedłużyć.'),
  ('demo-sfora',     'Sfora',                   'active',    90,   null,                              2, 12,  4,  45, 3,    55, 1, null);

do $$
declare
  s record;
  v_instance uuid := '00000000-0000-0000-0000-000000000000';
  v_password text := extensions.crypt('Demo-Haslo-2026', extensions.gen_salt('bf'));
  v_org uuid;
  v_type uuid;
  v_user uuid;
  v_owner uuid;
  v_login timestamptz;
  v_roles text[] := array['owner', 'trainer', 'trainer', 'assistant'];
  v_role text;
  v_email text;
  v_staff uuid[];
  v_trainers uuid[];
  v_clients uuid[];
  v_client uuid;
  v_first text[] := array['Anna','Piotr','Marta','Tomasz','Ewa','Krzysztof','Magda','Jan','Kasia','Michał','Ola','Paweł','Zofia','Adam','Natalia','Łukasz','Julia','Marek','Karolina','Bartek'];
  v_last text[] := array['Kowalska','Nowak','Wiśniewska','Wójcik','Kamińska','Lewandowski','Zielińska','Szymański','Woźniak','Dąbrowska','Kozłowski','Jankowska','Mazur','Krawczyk','Piotrowska'];
  i integer;
  n_trainers integer;
  d integer;
  h integer;
  v_start timestamptz;
  v_session uuid;
  v_status text;
begin
  for s in select * from demo_schools order by slug loop
    v_staff := '{}';
    v_trainers := '{}';
    v_clients := '{}';

    -- Personel
    for i in 1..s.staff_n loop
      v_role := v_roles[i];
      v_user := gen_random_uuid();
      v_email := case v_role
        when 'owner' then 'wlasciciel.' || substr(s.slug, 6) || '@demo.example.test'
        else v_role || (case when v_role = 'trainer' then (i - 1)::text else '' end) || '.' || substr(s.slug, 6) || '@demo.example.test'
      end;
      v_login := case
        when s.login_days_ago is null then null
        else now() - make_interval(days => s.login_days_ago + (i - 1) * 3, hours => (i * 5) % 12)
      end;
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at,
                              confirmation_token, recovery_token, email_change, email_change_token_new)
      values (v_instance, v_user, 'authenticated', 'authenticated', v_email, v_password, now(),
              '{"provider":"email","providers":["email"]}',
              jsonb_build_object('full_name', case v_role when 'owner' then v_first[(i * 3) % 20 + 1] || ' ' || v_last[(length(s.slug)) % 15 + 1] else v_first[(i * 7 + length(s.slug)) % 20 + 1] || ' ' || v_last[(i * 5) % 15 + 1] end),
              now() - make_interval(days => s.created_days_ago), now(), v_login, '', '', '', '');
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_user, v_user::text, jsonb_build_object('sub', v_user::text, 'email', v_email), 'email', v_login, now(), now());
      v_staff := v_staff || v_user;
      if v_role <> 'assistant' then v_trainers := v_trainers || v_user; end if;
      if i = 1 then v_owner := v_user; end if;
    end loop;

    -- Szkoła, ustawienia, członkostwa
    insert into public.organizations (name, slug, public_name, status, access_until, status_reason, status_changed_at, created_at, created_by)
    values (s.name, s.slug, s.name, s.status,
            case when s.access_offset_days is null then null else now() + make_interval(days => s.access_offset_days) end,
            s.reason,
            case when s.status in ('read_only', 'suspended') then now() - interval '2 days' else null end,
            now() - make_interval(days => s.created_days_ago), v_owner)
    returning id into v_org;
    insert into public.organization_settings (organization_id, created_by) values (v_org, v_owner);
    for i in 1..s.staff_n loop
      insert into public.organization_members (organization_id, user_id, role, created_by)
      values (v_org, v_staff[i], v_roles[i], v_owner);
    end loop;
    if s.notes is not null then
      insert into public.organization_admin_info (organization_id, notes) values (v_org, s.notes);
    end if;

    -- Rodzaj zajęć
    insert into public.session_types (organization_id, name, duration_minutes, default_price_minor, created_by)
    values (v_org, 'Trening indywidualny', 60, 10000, v_owner) returning id into v_type;

    -- Klienci (część dodana w ostatnich 7 dniach, część z dostępem do panelu klienta)
    for i in 1..s.clients_n loop
      insert into public.clients (organization_id, first_name, last_name, status, created_at, created_by)
      values (v_org, v_first[(i * 3 + length(s.slug)) % 20 + 1], v_last[(i * 7) % 15 + 1], 'active',
              now() - make_interval(days => case when i % 4 = 0 then (i % 7) else greatest(s.created_days_ago - (i % 10), 1) end),
              v_owner)
      returning id into v_client;
      v_clients := v_clients || v_client;

      if i <= s.portal_n then
        v_user := gen_random_uuid();
        v_email := 'klient' || i || '.' || substr(s.slug, 6) || '@demo.example.test';
        insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                                raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at,
                                confirmation_token, recovery_token, email_change, email_change_token_new)
        values (v_instance, v_user, 'authenticated', 'authenticated', v_email, v_password, now(),
                '{"provider":"email","providers":["email"]}', '{}', now() - interval '5 days', now(), now() - interval '1 day', '', '', '', '');
        insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (gen_random_uuid(), v_user, v_user::text, jsonb_build_object('sub', v_user::text, 'email', v_email), 'email', now(), now(), now());
        insert into public.client_access (organization_id, client_id, user_id, relation, created_by)
        values (v_org, v_client, v_user, 'owner', v_owner);
      end if;
    end loop;

    -- Zajęcia: po jednym na (trener, dzień, godzina), od 14 dni wstecz do 13 dni w przód
    n_trainers := array_length(v_trainers, 1);
    if s.clients_n > 0 and n_trainers > 0 then
      for i in 0..s.sessions_n - 1 loop
        d := (i / n_trainers) % 28 - 14;
        h := 8 + (i / (n_trainers * 28)) % 10;
        v_start := date_trunc('day', now()) + make_interval(days => d, hours => h);
        v_status := case
          when v_start > now() then 'scheduled'
          when i % 9 = 0 then 'canceled'
          else 'completed'
        end;
        insert into public.training_sessions (organization_id, session_type_id, trainer_id, starts_at, ends_at, status,
                                              completed_at, canceled_at, created_by, created_at)
        values (v_org, v_type, v_trainers[i % n_trainers + 1], v_start, v_start + interval '1 hour', v_status,
                case when v_status = 'completed' then v_start + interval '1 hour' end,
                case when v_status = 'canceled' then v_start - interval '1 day' end,
                v_owner, least(v_start - interval '2 days', now()))
        returning id into v_session;
        insert into public.session_attendees (organization_id, session_id, client_id, attendance, created_by)
        values (v_org, v_session, v_clients[i % s.clients_n + 1],
                case v_status when 'completed' then 'attended' when 'canceled' then 'canceled' else 'planned' end, v_owner);
      end loop;
    end if;

    -- Urządzenia z push i kilka powiadomień dla właściciela
    for i in 1..s.push_n loop
      insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
      values (v_staff[((i - 1) % s.staff_n) + 1], 'https://push.example.test/demo/' || gen_random_uuid(), 'demo-p256dh', 'demo-auth', 'demo');
    end loop;
    for i in 1..least(s.sessions_n / 6, 40) loop
      insert into public.notifications (organization_id, recipient_user_id, audience, type, title, body, link, dedupe_key, created_at)
      values (v_org, v_owner, 'staff', 'demo.notice', 'Powiadomienie demo ' || i, '', '/app', 'demo-' || v_org || '-' || i,
              now() - make_interval(days => i % 25));
    end loop;
  end loop;
end;
$$;

commit;
