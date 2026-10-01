-- Phase 1, custom trackers.
--   trackers         what the user tracks (name, kind, unit, goal, look), one row per tracker
--   tracker_entries  each logged value
-- Same security and sync model as every other table: own rows only, soft deletes, server timestamps.
-- Run once in the Supabase SQL editor. Safe to re-run.

create table if not exists public.trackers (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  name text not null check (char_length(name) between 1 and 40),
  kind text not null check (kind in ('check', 'count', 'scale', 'measure')),
  unit text check (char_length(unit) <= 16),
  icon text not null check (char_length(icon) <= 48),
  color text not null check (char_length(color) <= 16),
  goal real,
  goal_direction text check (goal_direction in ('at_least', 'at_most')),
  sort_order int not null default 0,
  archived boolean not null default false,
  is_seed boolean not null default false,
  deleted boolean not null default false,
  client_updated_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.tracker_entries (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  tracker_id text not null check (char_length(tracker_id) <= 64),
  time timestamp not null,
  value real not null,
  note text check (char_length(note) <= 500),
  utc_offset_minutes int not null,
  is_seed boolean not null default false,
  deleted boolean not null default false,
  client_updated_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

do $$
declare t text;
begin
  foreach t in array array['trackers', 'tracker_entries']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create index if not exists %I on public.%I (user_id, server_updated_at)', 'ix_' || t || '_sync', t);
    execute format('drop trigger if exists set_server_updated_at on public.%I', t);
    execute format('create trigger set_server_updated_at before insert or update on public.%I
                    for each row execute function public.set_server_updated_at()', t);
    execute format('drop policy if exists "own rows: read" on public.%I', t);
    execute format('drop policy if exists "own rows: insert" on public.%I', t);
    execute format('drop policy if exists "own rows: update" on public.%I', t);
    execute format('create policy "own rows: read" on public.%I for select to authenticated
                    using (user_id = (select auth.uid()) and (select public.is_active()))', t);
    execute format('create policy "own rows: insert" on public.%I for insert to authenticated
                    with check (user_id = (select auth.uid()) and (select public.is_active()))', t);
    execute format('create policy "own rows: update" on public.%I for update to authenticated
                    using (user_id = (select auth.uid()) and (select public.is_active()))
                    with check (user_id = (select auth.uid()))', t);
  end loop;
end;
$$;
