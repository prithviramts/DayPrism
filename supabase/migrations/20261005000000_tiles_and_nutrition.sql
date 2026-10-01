-- Lumaday 1.6:
--   user_settings.home_tiles  which tiles Today shows, in order (JSON array of tile ids)
--   food_logs                 foods you ate, with the nutrients computed on the phone at the time
--                             (Lumaday Beta for now; the table is harmless for the public app)
-- Same security and sync model as every other table: own rows only, soft deletes, server timestamps.
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table public.user_settings add column if not exists home_tiles text check (char_length(home_tiles) <= 2000);

create table if not exists public.food_logs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  time timestamp not null,
  food_id text check (char_length(food_id) <= 64),
  name text not null check (char_length(name) between 1 and 80),
  grams real not null check (grams > 0 and grams <= 10000),
  nutrients text not null check (char_length(nutrients) <= 2000),
  utc_offset_minutes int not null,
  is_seed boolean not null default false,
  deleted boolean not null default false,
  client_updated_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

do $$
declare t text := 'food_logs';
begin
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
end;
$$;
