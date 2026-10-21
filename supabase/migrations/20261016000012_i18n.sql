-- Wielojęzyczność: profil dostaje język wykryty przy rejestracji (z przeglądarki lub telefonu). Aplikacja przekazuje go w
-- metadanych `locale`; służy do powiadomień (e-mail, push), które nie mają ciasteczka przeglądarki. Błędny zapis daje język domyślny.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locale text := lower(coalesce(new.raw_user_meta_data ->> 'locale', ''));
begin
  insert into public.profiles (id, full_name, locale)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    case when v_locale ~ '^[a-z]{2,3}$' then v_locale else 'pl' end
  );
  return new;
end;
$$;

-- Waluta szkoły: szkoła ma jedną walutę (organization_settings.currency, dobieraną przy zakładaniu z języka i regionu urządzenia).
-- Nowe rekordy z kwotami dostają ją automatycznie, zamiast stałej 'PLN' ze starych wartości domyślnych kolumn.
create or replace function app.apply_school_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_currency text;
begin
  select s.currency into v_currency from public.organization_settings s where s.organization_id = new.organization_id;
  if v_currency is not null then
    new.currency := v_currency;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['session_types', 'package_templates', 'client_packages', 'charges', 'payments'] loop
    execute format(
      'create trigger %I before insert on public.%I for each row execute function app.apply_school_currency()',
      t || '_apply_currency', t);
  end loop;
end;
$$;
