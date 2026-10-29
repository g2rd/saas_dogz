-- Ponowna zgoda po zmianie wersji regulaminu i polityki prywatności (ADR 0015).
-- Zgody zapisuje wyłącznie ta funkcja i wyzwalacz zakładania konta; użytkownik nadal nie ma uprawnień zapisu do tabeli consents.
-- Funkcja dopisuje zgodę zalogowanego użytkownika na oba dokumenty w podanej wersji (powtórzenie nic nie zmienia).
create or replace function public.accept_legal(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_locale text;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_version is null or p_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid legal version' using errcode = '22023';
  end if;

  select p.locale into v_locale from public.profiles p where p.id = v_user;

  insert into public.consents (user_id, document, version, locale)
  select v_user, d.document, p_version, case when v_locale ~ '^[a-z]{2,3}$' then v_locale else null end
  from (values ('terms'), ('privacy')) as d (document)
  on conflict (user_id, document, version) do nothing;
end;
$$;

revoke all on function public.accept_legal(text) from public, anon;
grant execute on function public.accept_legal(text) to authenticated;
