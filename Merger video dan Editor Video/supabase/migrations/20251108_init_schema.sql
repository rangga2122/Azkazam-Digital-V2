-- Initial schema migration for users, generation_logs, and user_credit_events

-- Create required tables and minimal RLS policies for this app

-- USERS METADATA TABLE
create table if not exists public.users (
  id uuid primary key,
  email text not null unique,
  role text not null default 'user' check (role in ('user','admin')),
  daily_limit integer not null default 5,
  remaining_credits integer not null default 5,
  last_reset_date date not null default current_date,
  expiry_date date null,
  allowed_features text[] null
);

alter table public.users enable row level security;

-- Allow authenticated users to read their own row
drop policy if exists "read own user row" on public.users;
create policy "read own user row"
on public.users for select
to authenticated
using (auth.uid() = id);

-- Admin dapat membaca semua baris users untuk kebutuhan dashboard
drop policy if exists "admin select all users" on public.users;
create policy "admin select all users"
on public.users for select
to authenticated
using (exists(select 1 from public.users me where me.id = auth.uid() and me.role = 'admin'));

-- Optional: allow authenticated users to update their own remaining_credits and last_reset_date
drop policy if exists "update own credits" on public.users;
create policy "update own credits"
on public.users for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- GENERATION LOGS TABLE
create table if not exists public.generation_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  user_email text not null,
  timestamp timestamptz not null default now()
);

alter table public.generation_logs enable row level security;

-- Allow users to read their own logs
drop policy if exists "user select own logs" on public.generation_logs;
create policy "user select own logs"
on public.generation_logs for select
to authenticated
using (auth.uid() = user_id);

-- Optional: allow users to insert their own log entries
drop policy if exists "user insert own log" on public.generation_logs;
create policy "user insert own log"
on public.generation_logs for insert
to authenticated
with check (auth.uid() = user_id);

-- Note: Service Role bypasses RLS automatically and is used by /api/* routes.

-- CREDIT EVENTS TABLE: catat setiap perubahan kredit (audit & laporan)
create table if not exists public.user_credit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  amount integer not null, -- negatif untuk pengurangan, positif untuk penambahan
  reason text not null default 'generation', -- misal: generation, manual_adjustment
  credits_after integer not null, -- sisa kredit setelah perubahan
  created_at timestamptz not null default now()
);

alter table public.user_credit_events enable row level security;

-- Izinkan user melihat riwayat kredit miliknya
drop policy if exists "user select own credit events" on public.user_credit_events;
create policy "user select own credit events"
on public.user_credit_events for select
to authenticated
using (auth.uid() = user_id);

-- Aktifkan Realtime pada tabel terkait
do $$ begin
  begin
    alter publication supabase_realtime add table public.users;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.generation_logs;
  exception when others then null; end;
  begin
    alter publication supabase_realtime add table public.user_credit_events;
  exception when others then null; end;
end $$;
