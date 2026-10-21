-- Ustawienia szkoły (waluta, strefa czasowa, język): zmiany zapisuje właściciel lub administrator wprost w organization_settings
-- (polityka RLS już to dopuszcza), a pilnują ich wyzwalacze, więc nie da się ich obejść przez API.
--  * waluty nie można zmienić, gdy w szkole są rekordy z kwotami (pakiety klientów, należności, wpłaty): kwoty w groszach
--    straciłyby sens, a rejestry finansowe są tylko do dopisywania (DT018);
--  * strefa czasowa musi istnieć w bazie stref IANA, język i waluta mają poprawny kształt;
--  * zmiana waluty (gdy jest dozwolona) przepisuje walutę w cenniku (rodzaje zajęć, szablony pakietów);
--  * każda zmiana trafia do audit_log.

-- Czy szkoła ma rekordy z kwotami; do blokady zmiany waluty
create or replace function app.org_has_money_records(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.client_packages where organization_id = p_org)
      or exists (select 1 from public.charges where organization_id = p_org)
      or exists (select 1 from public.payments where organization_id = p_org);
$$;

alter table public.organization_settings
  add constraint organization_settings_currency_format check (currency ~ '^[A-Z]{3}$'),
  add constraint organization_settings_locale_format check (locale ~ '^[a-z]{2,3}$'),
  add constraint organization_settings_late_cancel_range check (late_cancel_hours <= 720);

create or replace function app.guard_organization_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.currency is distinct from old.currency and app.org_has_money_records(new.organization_id) then
    raise exception 'currency cannot change once the school has money records' using errcode = 'DT018';
  end if;
  if new.timezone is distinct from old.timezone
     and not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = new.timezone) then
    raise exception 'unknown time zone' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger organization_settings_guard
  before update on public.organization_settings
  for each row execute function app.guard_organization_settings();

-- Po zmianie waluty cennik dostaje nową walutę (kwoty w groszach bez zmian: szkoła bez wpłat ustawia ceny od nowa)
create or replace function app.after_organization_settings_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.currency is distinct from old.currency then
    update public.session_types set currency = new.currency where organization_id = new.organization_id and currency <> new.currency;
    update public.package_templates set currency = new.currency where organization_id = new.organization_id and currency <> new.currency;
  end if;

  if (new.currency, new.timezone, new.locale, new.late_cancel_hours, new.late_cancel_consumes_session)
     is distinct from (old.currency, old.timezone, old.locale, old.late_cancel_hours, old.late_cancel_consumes_session) then
    insert into public.audit_log (organization_id, actor_id, action, entity_type, entity_id, changes)
    values (
      new.organization_id,
      (select auth.uid()),
      'organization.settings_updated',
      'organization_settings',
      new.organization_id,
      jsonb_build_object(
        'from', jsonb_build_object('currency', old.currency, 'timezone', old.timezone, 'locale', old.locale,
          'late_cancel_hours', old.late_cancel_hours, 'late_cancel_consumes_session', old.late_cancel_consumes_session),
        'to', jsonb_build_object('currency', new.currency, 'timezone', new.timezone, 'locale', new.locale,
          'late_cancel_hours', new.late_cancel_hours, 'late_cancel_consumes_session', new.late_cancel_consumes_session)
      )
    );
  end if;
  return new;
end;
$$;

create trigger organization_settings_after_update
  after update on public.organization_settings
  for each row execute function app.after_organization_settings_update();
