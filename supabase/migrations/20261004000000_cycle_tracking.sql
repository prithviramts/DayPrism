-- Cycle tracking (opt-in).
--   cycle_days       one row per day with flow and/or symptoms (id "c:2026-10-04")
--   cycle_tracking   the user's on/off switch, so it follows them to a new phone
-- Same protections as every other table. Run once in the Supabase SQL editor. Safe to re-run.

alter table public.user_settings add column if not exists cycle_tracking boolean not null default false;

create table if not exists public.cycle_days (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  date date not null,
  flow text check (flow in ('spotting', 'light', 'medium', 'heavy')),
  symptoms text check (char_length(symptoms) <= 300),
  note text check (char_length(note) <= 500),
  is_seed boolean not null default false,
  deleted boolean not null default false,
  client_updated_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

alter table public.cycle_days enable row level security;
create index if not exists ix_cycle_days_sync on public.cycle_days (user_id, server_updated_at);

drop trigger if exists set_server_updated_at on public.cycle_days;
create trigger set_server_updated_at before insert or update on public.cycle_days
  for each row execute function public.set_server_updated_at();

drop policy if exists "own rows: read" on public.cycle_days;
drop policy if exists "own rows: insert" on public.cycle_days;
drop policy if exists "own rows: update" on public.cycle_days;
create policy "own rows: read" on public.cycle_days for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active()));
create policy "own rows: insert" on public.cycle_days for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active()));
create policy "own rows: update" on public.cycle_days for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active()))
  with check (user_id = (select auth.uid()));
