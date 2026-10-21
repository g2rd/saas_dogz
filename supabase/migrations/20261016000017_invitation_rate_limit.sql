-- Limit tworzenia zaproszeń: najwyżej 200 na szkołę na dobę (klienci i zespół razem). Chroni przed zalewaniem cudzych skrzynek
-- zaproszeniami e-mail i przed generowaniem tysięcy kodów. Typowa szkoła (kilkadziesiąt klientów) mieści się z zapasem.
-- Wyjątek DT017 aplikacja zamienia na komunikat o limicie ("Zbyt wiele ... w krótkim czasie").
create or replace function app.limit_invitation_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.invitations i
      where i.organization_id = new.organization_id and i.created_at > now() - interval '1 day') >= 200 then
    raise exception 'too many invitations' using errcode = 'DT017';
  end if;
  return new;
end;
$$;

create trigger invitations_limit_rate
  before insert on public.invitations
  for each row execute function app.limit_invitation_rate();
