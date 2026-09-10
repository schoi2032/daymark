-- Run this migration in Supabase Dashboard → SQL Editor.
-- It is safe for the existing tasks table and adds private/viewable sharing.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  task_date date not null,
  task_time time,
  category text not null default '' check (category in ('', 'work', 'personal', 'study', 'health')),
  completed boolean not null default false,
  is_viewable boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Adds the sharing field when the original version of the table already exists.
alter table public.tasks add column if not exists is_viewable boolean not null default false;
create index if not exists tasks_user_date_idx on public.tasks (user_id, task_date);
create index if not exists tasks_viewable_user_date_idx on public.tasks (user_id, task_date) where is_viewable;

alter table public.tasks enable row level security;

-- Recreate policies so this migration can be safely applied after the earlier schema.
drop policy if exists "Users can read their own tasks" on public.tasks;
drop policy if exists "Users can read their own or viewable tasks" on public.tasks;
drop policy if exists "Users can create their own tasks" on public.tasks;
drop policy if exists "Users can update their own tasks" on public.tasks;
drop policy if exists "Users can delete their own tasks" on public.tasks;

create policy "Users can read their own or viewable tasks"
  on public.tasks for select to authenticated
  using ((select auth.uid()) = user_id or is_viewable = true);

create policy "Users can create their own tasks"
  on public.tasks for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own tasks"
  on public.tasks for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own tasks"
  on public.tasks for delete to authenticated
  using ((select auth.uid()) = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
