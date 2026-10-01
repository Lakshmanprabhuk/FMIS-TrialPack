-- Run this once in Supabase Dashboard → SQL Editor.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  org_name text not null,
  email text not null,
  purpose text,
  created_at timestamptz not null default now(),
  last_trial_at timestamptz,
  trial_count integer not null default 0
);

alter table public.profiles enable row level security;

-- Each user can read their own profile row.
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Each user can create their own profile row once, right after sign-up.
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Intentionally NO update/delete policy for the "authenticated" role.
-- last_trial_at and trial_count must only ever be changed by the server
-- (via the service-role key, which bypasses RLS) so a user can never
-- edit their own row from the browser to reset their weekly trial.
