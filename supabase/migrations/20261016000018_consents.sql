-- Zgody na regulamin i politykę prywatności: kto, który dokument, w której wersji, kiedy.
-- Zgodę zapisuje wyzwalacz przy zakładaniu konta (wersja z metadanych rejestracji, które ustawia formularz po zaznaczeniu pola);
-- użytkownik czyta swoje zgody, nie zapisuje ich ani nie zmienia (ślad zgody ma być niezmienny). Przy nowej wersji dokumentów
-- aplikacja zapisze kolejny wiersz (nowa wersja = nowa zgoda), stare zostają.
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  document text not null check (document in ('terms', 'privacy')),
  -- Wersja dokumentu w postaci daty (RRRR-MM-DD), taka sama jak w kodzie (src/shared/legal.ts)
  version text not null check (version ~ '^\d{4}-\d{2}-\d{2}$'),
  locale text check (locale is null or locale ~ '^[a-z]{2,3}$'),
  accepted_at timestamptz not null default now(),
  unique (user_id, document, version)
);

create index consents_user_idx on public.consents (user_id);

alter table public.consents enable row level security;

create policy consents_select_own on public.consents
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Zapisy tylko przez wyzwalacz (security definer) i service_role; użytkownik ma wyłącznie odczyt
revoke insert, update, delete on public.consents from authenticated;

-- Wyzwalacz zakładania konta: profil (jak dotąd) i zgody z metadanych rejestracji
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locale text := lower(coalesce(new.raw_user_meta_data ->> 'locale', ''));
  v_consent text := coalesce(new.raw_user_meta_data ->> 'consent_version', '');
begin
  insert into public.profiles (id, full_name, locale)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    case when v_locale ~ '^[a-z]{2,3}$' then v_locale else 'pl' end
  );

  -- Poprawny format wersji = formularz potwierdził zgodę na oba dokumenty; błędna wartość jest ignorowana (brak zgody)
  if v_consent ~ '^\d{4}-\d{2}-\d{2}$' then
    insert into public.consents (user_id, document, version, locale)
    select new.id, d.document, v_consent, case when v_locale ~ '^[a-z]{2,3}$' then v_locale else null end
    from (values ('terms'), ('privacy')) as d (document);
  end if;
  return new;
end;
$$;
