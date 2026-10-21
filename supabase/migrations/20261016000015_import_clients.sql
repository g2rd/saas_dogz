-- Import klientów (i opcjonalnie ich psów) z pliku CSV: jeden zapis atomowy (wszystko albo nic).
-- Wiersze waliduje i oczyszcza aplikacja; funkcja jeszcze raz pilnuje roli, limitu i duplikatów e-mail w szkole.
-- Działa w kontekście użytkownika (RLS i blokada zapisów szkoły „tylko do odczytu” obowiązują jak przy ręcznym dodawaniu).
create or replace function public.import_clients(p_org uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_clients integer := 0;
  v_dogs integer := 0;
  v_skipped integer := 0;
  v_client uuid;
  v_email text;
  r record;
begin
  if v_user is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not app.has_org_role(p_org, array['owner', 'admin', 'trainer']) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then
    raise exception 'invalid rows' using errcode = '22023';
  end if;

  for r in
    select * from jsonb_to_recordset(p_rows)
      as x(first_name text, last_name text, email text, phone text, dog_name text, breed text)
  loop
    v_email := nullif(lower(btrim(coalesce(r.email, ''))), '');

    if length(btrim(coalesce(r.first_name, ''))) = 0 then
      raise exception 'first name required' using errcode = '23514';
    end if;

    -- Klient z takim e-mailem już jest w szkole: pomijamy (nie dublujemy kartoteki)
    if v_email is not null and exists (
      select 1 from public.clients c where c.organization_id = p_org and c.email = v_email
    ) then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.clients (organization_id, first_name, last_name, email, phone, status, created_by)
    values (
      p_org,
      btrim(r.first_name),
      btrim(coalesce(r.last_name, '')),
      v_email,
      nullif(btrim(coalesce(r.phone, '')), ''),
      'active',
      v_user
    )
    returning id into v_client;
    v_clients := v_clients + 1;

    if length(btrim(coalesce(r.dog_name, ''))) > 0 then
      insert into public.dogs (organization_id, client_id, name, breed, created_by)
      values (p_org, v_client, btrim(r.dog_name), nullif(btrim(coalesce(r.breed, '')), ''), v_user);
      v_dogs := v_dogs + 1;
    end if;
  end loop;

  return jsonb_build_object('clients', v_clients, 'dogs', v_dogs, 'skipped', v_skipped);
end;
$$;

revoke execute on function public.import_clients(uuid, jsonb) from public, anon;
grant execute on function public.import_clients(uuid, jsonb) to authenticated;
