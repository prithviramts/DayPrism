-- Phase 1, Health Connect import.
--   * source: where a row came from. null = typed in Lumaday, 'health_connect' = imported.
--   * daily_metrics: one value per day per kind (steps now; more kinds later), synced like entries.
--   * steps_target: the daily step goal drawn as a ring on Today.
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table public.sleep_logs add column if not exists source text check (source in ('health_connect'));
alter table public.activities add column if not exists source text check (source in ('health_connect'));
alter table public.user_settings add column if not exists steps_target int not null default 8000
  check (steps_target between 1000 and 50000);

create table if not exists public.daily_metrics (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  date date not null,
  kind text not null check (kind in ('steps')),
  value real not null check (value >= 0),
  source text check (source in ('health_connect')),
  is_seed boolean not null default false,
  deleted boolean not null default false,
  client_updated_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

alter table public.daily_metrics enable row level security;
create index if not exists ix_daily_metrics_sync on public.daily_metrics (user_id, server_updated_at);

drop trigger if exists set_server_updated_at on public.daily_metrics;
create trigger set_server_updated_at before insert or update on public.daily_metrics
  for each row execute function public.set_server_updated_at();

drop policy if exists "own rows: read" on public.daily_metrics;
drop policy if exists "own rows: insert" on public.daily_metrics;
drop policy if exists "own rows: update" on public.daily_metrics;
create policy "own rows: read" on public.daily_metrics for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active()));
create policy "own rows: insert" on public.daily_metrics for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active()));
create policy "own rows: update" on public.daily_metrics for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active()))
  with check (user_id = (select auth.uid()));
