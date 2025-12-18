-- Add columns for single-device session tracking
alter table public.users
  add column if not exists current_session_id text;

alter table public.users
  add column if not exists session_updated_at timestamptz;

-- Optional: convenience index if your table is large
-- create index if not exists idx_users_current_session_id on public.users(current_session_id);

-- Allow admin to set maximum concurrent sessions per user
alter table public.users
  add column if not exists max_sessions integer not null default 1;
