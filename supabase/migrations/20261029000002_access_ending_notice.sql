-- E-mail i powiadomienie „dostęp kończy się za 7 dni / 1 dzień” (ADR 0016): rozszerzenie reguł dziennych o zdarzenie organization.access_ending.
-- Reszta funkcji bez zmian względem migracji 0006.
create or replace function public.enqueue_daily_notification_events(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rows integer;
  v_total integer := 0;
begin
  -- Zbliżający się termin płatności (do 3 dni, w strefie organizacji)
  insert into public.outbox_events (organization_id, type, payload)
  select b.organization_id, 'charge.due',
         jsonb_build_object('charge_id', b.id, 'client_id', b.client_id, 'dedupe_key', 'charge.due:' || b.id)
    from public.v_charge_balance b
    join public.organization_settings s on s.organization_id = b.organization_id
    where b.voided_at is null
      and b.amount_minor > b.allocated_minor
      and b.due_date >= (p_now at time zone s.timezone)::date
      and b.due_date <= (p_now at time zone s.timezone)::date + 3
  on conflict ((payload ->> 'dedupe_key')) where payload ? 'dedupe_key' do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  -- Płatność po terminie: pierwszy raz i potem co 7 dni
  insert into public.outbox_events (organization_id, type, payload)
  select b.organization_id, 'charge.overdue',
         jsonb_build_object(
           'charge_id', b.id, 'client_id', b.client_id,
           'dedupe_key', 'charge.overdue:' || b.id || ':' || (((p_now at time zone s.timezone)::date - b.due_date) / 7))
    from public.v_charge_balance b
    join public.organization_settings s on s.organization_id = b.organization_id
    where b.voided_at is null
      and b.amount_minor > b.allocated_minor
      and b.due_date < (p_now at time zone s.timezone)::date
  on conflict ((payload ->> 'dedupe_key')) where payload ? 'dedupe_key' do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  -- Przypomnienie o zajęciach (reminder_hours_before godzin przed startem)
  insert into public.outbox_events (organization_id, type, payload)
  select t.organization_id, 'training_session.reminder',
         jsonb_build_object(
           'session_id', t.id, 'client_id', a.client_id, 'starts_at', t.starts_at,
           'dedupe_key', 'session.reminder:' || t.id || ':' || a.client_id)
    from public.training_sessions t
    join public.session_attendees a on a.organization_id = t.organization_id and a.session_id = t.id
    join public.organization_settings s on s.organization_id = t.organization_id
    where t.status = 'scheduled'
      and a.attendance = 'planned'
      and t.starts_at > p_now
      and t.starts_at <= p_now + make_interval(hours => s.reminder_hours_before)
  on conflict ((payload ->> 'dedupe_key')) where payload ? 'dedupe_key' do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  -- Koniec dostępu szkoły za 7 dni i za 1 dzień (właściciele i administratorzy dostają zapowiedź przed przejściem w tryb „tylko do odczytu”).
  -- Klucz zawiera termin dostępu, więc po jego przedłużeniu zapowiedzi pojawią się znowu; dla terminu bliższego niż doba nie wysyłamy zapowiedzi „7 dni”.
  insert into public.outbox_events (organization_id, type, payload)
  select o.id, 'organization.access_ending',
         jsonb_build_object(
           'organization_id', o.id, 'access_until', o.access_until,
           'days', case when o.access_until <= p_now + interval '1 day' then 1 else 7 end,
           'dedupe_key', 'org.access_ending:' || o.id || ':' || to_char(o.access_until at time zone 'utc', 'YYYYMMDD"T"HH24MISS')
                         || ':' || (case when o.access_until <= p_now + interval '1 day' then 1 else 7 end))
    from public.organizations o
    where o.status in ('trial', 'active')
      and o.access_until is not null
      and o.access_until > p_now
      and o.access_until <= p_now + interval '7 days'
  on conflict ((payload ->> 'dedupe_key')) where payload ? 'dedupe_key' do nothing;
  get diagnostics v_rows = row_count;
  v_total := v_total + v_rows;

  return v_total;
end;
$$;

revoke execute on function public.enqueue_daily_notification_events(timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_daily_notification_events(timestamptz) to service_role;
