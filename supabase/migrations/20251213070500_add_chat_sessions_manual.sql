-- Chat sessions for Tanya Bang Vidgo
create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chat_sessions enable row level security;

drop policy if exists "chat sessions own rows" on public.chat_sessions;
create policy "chat sessions own rows"
on public.chat_sessions for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

do $$ begin
  begin
    alter publication supabase_realtime add table public.chat_sessions;
  exception when others then null; end;
end $$;
