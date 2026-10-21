-- Opinie testerów: „Zgłoś problem lub pomysł” w menu „Więcej” obu paneli.
-- Zgłoszenie dodaje zalogowana osoba (personel albo klient) we własnym imieniu i widzi tylko swoje; przegląd i oznaczanie
-- jako obejrzane robi właściciel platformy z panelu /admin (service_role, poza RLS).
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  audience text not null check (audience in ('staff', 'client')),
  kind text not null check (kind in ('problem', 'idea', 'other')),
  message text not null check (length(btrim(message)) between 1 and 2000),
  -- Ekran, z którego wysłano zgłoszenie (ścieżka bez danych osobowych), i język interfejsu
  page text check (page is null or length(page) <= 200),
  locale text check (locale is null or locale ~ '^[a-z]{2,3}$'),
  status text not null default 'new' check (status in ('new', 'seen')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);

create index feedback_created_idx on public.feedback (created_at desc);
create index feedback_org_idx on public.feedback (organization_id, created_at desc);
create index feedback_user_idx on public.feedback (user_id);

alter table public.feedback enable row level security;

-- Dodać można tylko własne zgłoszenie, w roli zgodnej z dostępem do szkoły; status i obsługę ustawia wyłącznie właściciel platformy
create policy feedback_insert_own on public.feedback
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'new'
    and handled_at is null
    and (
      (audience = 'staff' and app.is_org_member(organization_id))
      or (audience = 'client' and app.is_client_of_org(organization_id))
    )
  );

create policy feedback_select_own on public.feedback
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Zgłoszeń nie edytuje ani nie usuwa nikt z aplikacji użytkownika
revoke update, delete on public.feedback from authenticated, anon;
