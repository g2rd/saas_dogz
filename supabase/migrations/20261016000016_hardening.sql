-- Utwardzenie uprawnień i limity (jakość minimum przed oddaniem testerom).
-- RLS i tak chroni dane, ale domyślne uprawnienia Supabase dają rolom `anon` i `authenticated` więcej, niż potrzeba (w tym TRUNCATE,
-- którego RLS nie obejmuje). Zostawiamy tylko to, z czego korzysta aplikacja, i dopisujemy limit zgłoszeń opinii.

-- 1. Rola anon nie ma bezpośredniego dostępu do tabel; publiczne strony używają tylko trzech funkcji definer (lookup_*, check_signup_allowed)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 2. Uprawnienia, których PostgREST i tak nie udostępnia, ale nie powinny istnieć: TRUNCATE (omija RLS), REFERENCES, TRIGGER
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- 3. Rejestry tylko do dopisywania i tabele właściciela platformy: użytkownik nie zapisuje do nich bezpośrednio.
--    Pakiet: zapisy tylko przez funkcje security definer (sprzedaż, zajęcia, korekta), użytkownik ma tylko odczyt (RLS zawęża wiersze).
revoke insert, update, delete on public.package_ledger from authenticated;
--    Tabele panelu właściciela czyta i zapisuje wyłącznie service_role (poza RLS).
revoke all on public.beta_codes from authenticated;
revoke all on public.platform_settings from authenticated;
revoke all on public.organization_admin_info from authenticated;

-- 4. Nowe tabele i funkcje nie dziedziczą szerokich uprawnień. Funkcję dla anon trzeba nadać jawnie (i dopisać do testu niezmienników).
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public revoke truncate, references, trigger on tables from authenticated;

-- 5. Limit zgłoszeń opinii: ochrona przed zalaniem skrzynki właściciela (5 na 10 minut i 30 na dobę na osobę).
--    Limit zależy od autora, więc liczymy po user_id; wyjątek DT017 aplikacja zamienia na komunikat o limicie.
create or replace function app.limit_feedback_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.feedback f where f.user_id = new.user_id and f.created_at > now() - interval '10 minutes') >= 5
     or (select count(*) from public.feedback f where f.user_id = new.user_id and f.created_at > now() - interval '1 day') >= 30 then
    raise exception 'too many feedback submissions' using errcode = 'DT017';
  end if;
  return new;
end;
$$;

create trigger feedback_limit_rate
  before insert on public.feedback
  for each row execute function app.limit_feedback_rate();
