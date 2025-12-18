-- Global settings table for centralized configuration
create table if not exists public.global_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

-- Optional: index on updated_at for audit queries
create index if not exists idx_global_settings_updated_at on public.global_settings(updated_at);

