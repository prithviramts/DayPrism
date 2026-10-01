-- Lumaday server schema (Supabase / Postgres).
--
-- Security model
--   * Every table has row-level security. A signed-in user can only ever read or write rows
--     whose user_id is their own id; this is enforced by Postgres, not by the app.
--   * Disabled accounts (set by an admin) lose all access through the same policies.
--   * Admins can see account metadata (email, sign-up date, last active) and statistics through
--     the admin_* functions below. There is deliberately NO policy that lets an admin read
--     anyone's entries.
--   * Clients never see the service_role key; everything here works with the publishable key.
--
-- Sync model
--   * Rows are created on the phone with client-generated text ids, so entries can be made
--     offline. One-per-day rows (sleep, reflection) use deterministic ids ("s:2026-10-01"), so two
--     devices logging the same morning merge instead of duplicating.
--   * server_updated_at is set by the database on every write; phones pull "everything changed
--     since my last cursor". Deletes are soft (deleted = true) so they sync too.

-- ============================================================== helpers

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

alter table public.profiles enable row level security;

-- A user can read their own profile (to know whether they are an admin or disabled). No client
-- can insert, update or delete profiles directly; role and disabled change only via admin_*.
create policy "read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.user_settings (user_id, display_name)
  values (new.id, nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', '')), ''));
  return new;
end;
$$;

-- True when the caller is signed in and their account isn't disabled.
create or replace function public.is_active()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and not p.disabled);
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and not p.disabled);
$$;

create or replace function public.set_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;

-- ============================================================== per-user tables

create table public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 40),
  theme text not null default 'System' check (theme in ('System', 'Light', 'Dark')),
  sleep_target_hours real not null default 8 check (sleep_target_hours between 4 and 12),
  water_target_glasses int not null default 8 check (water_target_glasses between 1 and 20),
  meals_target int not null default 3 check (meals_target between 1 and 6),
  caffeine_limit_mg int not null default 400 check (caffeine_limit_mg between 50 and 1000),
  server_updated_at timestamptz not null default clock_timestamp()
);

-- Columns shared by every entry table:
--   id text, user_id uuid, utc_offset_minutes, is_seed, deleted, client_updated_at, server_updated_at

create table public.sleep_logs (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  bed_time timestamp not null,
  wake_time timestamp not null,
  quality int not null check (quality between 1 and 5),
  times_woken int not null default 0 check (times_woken between 0 and 30),
  notes text check (char_length(notes) <= 2000),
  utc_offset_minutes int not null,
  is_seed boolean not null default false,
  deleted boolean not null default false,
  client_updated_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table public.meals (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  time timestamp not null,
  meal_type text not null check (meal_type in ('Breakfast', 'Lunch', 'Dinner', 'Snack')),
  description text check (char_length(description) <= 1000),
  size text check (size in ('Light', 'Normal', 'Heavy')),
  skipped boolean not null default false,
  utc_offset_minutes int not null,
  is_seed boolean not null default false,
  deleted boolean not null default false,
  client_updated_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table public.caffeine_intakes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  time timestamp not null,
  type text not null check (type in ('Espresso', 'DoubleEspresso', 'Coffee', 'Tea', 'EnergyDrink')),
  servings real not null default 1 check (servings > 0 and servings <= 10),
  caffeine_mg int not null check (caffeine_mg between 0 and 2000),
  utc_offset_minutes int not null,
  is_seed boolean not null default false,
  deleted boolean not null default false,
  client_updated_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table public.water_intakes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  time timestamp not null,
  glasses int not null default 1 check (glasses between 1 and 10),
  utc_offset_minutes int not null,
  is_seed boolean not null default false,
  deleted boolean not null default false,
  client_updated_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table public.energy_checkins (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  time timestamp not null,
  energy int not null check (energy between 1 and 5),
  sleepiness int not null check (sleepiness between 1 and 5),
  mood int not null check (mood between 1 and 5),
  note text check (char_length(note) <= 1000),
  utc_offset_minutes int not null,
  is_seed boolean not null default false,
  deleted boolean not null default false,
  client_updated_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table public.activities (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  start_time timestamp not null,
  end_time timestamp,
  category text not null check (category in (
    'Commute', 'Work', 'DeepWork', 'Meetings', 'Study', 'Exercise',
    'Creative', 'Projects', 'Social', 'ScreenTime', 'Rest', 'Other')),
  notes text check (char_length(notes) <= 1000),
  utc_offset_minutes int not null,
  is_seed boolean not null default false,
  deleted boolean not null default false,
  client_updated_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table public.daily_reflections (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) <= 64),
  date date not null,
  went_well text check (char_length(went_well) <= 2000),
  didnt_go_well text check (char_length(didnt_go_well) <= 2000),
  do_differently text check (char_length(do_differently) <= 2000),
  day_rating int not null check (day_rating between 1 and 5),
  is_seed boolean not null default false,
  deleted boolean not null default false,
  client_updated_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

-- Sync pulls "changed since" per user, so index exactly that.
do $$
declare t text;
begin
  foreach t in array array['user_settings', 'sleep_logs', 'meals', 'caffeine_intakes', 'water_intakes',
                           'energy_checkins', 'activities', 'daily_reflections']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create index %I on public.%I (user_id, server_updated_at)', 'ix_' || t || '_sync', t);
    execute format('create trigger set_server_updated_at before insert or update on public.%I
                    for each row execute function public.set_server_updated_at()', t);
    -- Own rows only, and only while the account is active. No delete policy: deletes are soft.
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================== account functions (any user)

-- Records that the user opened the app (feeds "active users" in admin stats). Once per call; the
-- app calls it at most once per launch.
create or replace function public.touch_last_seen()
returns void language sql security definer set search_path = '' as $$
  update public.profiles set last_seen_at = now() where id = auth.uid();
$$;

-- Permanently deletes the caller's account and, through ON DELETE CASCADE, all of their data.
-- Required by Google Play for apps that let users create accounts.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ============================================================== admin functions

create or replace function public.admin_stats()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'disabled_users', (select count(*) from public.profiles where disabled),
    'new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'new_30d', (select count(*) from public.profiles where created_at > now() - interval '30 days'),
    'active_1d', (select count(*) from public.profiles where last_seen_at > now() - interval '1 day'),
    'active_7d', (select count(*) from public.profiles where last_seen_at > now() - interval '7 days'),
    'active_30d', (select count(*) from public.profiles where last_seen_at > now() - interval '30 days'),
    'signups_by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'count', c) order by d), '[]'::jsonb)
      from (
        select g.d, (select count(*) from public.profiles p where p.created_at::date = g.d::date) as c
        from generate_series(current_date - 29, current_date, interval '1 day') as g(d)
      ) s
    )
  ) into result;
  return result;
end;
$$;

-- Account metadata only: never entries.
create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, email text, display_name text, role text, disabled boolean, provider text,
  created_at timestamptz, last_seen_at timestamptz, email_confirmed boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  return query
    select u.id, u.email::text, s.display_name, p.role, p.disabled,
           coalesce(u.raw_app_meta_data ->> 'provider', 'email'),
           p.created_at, p.last_seen_at, u.email_confirmed_at is not null
    from auth.users u
    join public.profiles p on p.id = u.id
    left join public.user_settings s on s.user_id = u.id
    where p_search is null or u.email ilike '%' || p_search || '%' or s.display_name ilike '%' || p_search || '%'
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_set_disabled(p_user uuid, p_disabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'You can''t disable your own account';
  end if;
  update public.profiles set disabled = p_disabled where id = p_user;
end;
$$;

-- ============================================================== grants

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_last_seen() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.admin_stats() from public, anon;
revoke all on function public.admin_list_users(text, int, int) from public, anon;
revoke all on function public.admin_set_disabled(uuid, boolean) from public, anon;
grant execute on function public.touch_last_seen() to authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_list_users(text, int, int) to authenticated;
grant execute on function public.admin_set_disabled(uuid, boolean) to authenticated;
