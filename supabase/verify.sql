-- Verify core tables exist
select
  to_regclass('public.users') as users,
  to_regclass('public.generation_logs') as generation_logs,
  to_regclass('public.user_credit_events') as user_credit_events,
  to_regclass('public.global_settings') as global_settings;

-- Verify allowed_features column exists on public.users
select exists(
  select 1
  from information_schema.columns
  where table_schema='public' and table_name='users' and column_name='allowed_features'
) as has_allowed_features;

-- Verify RPC function decrement_credit exists in public schema
select exists(
  select 1
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname='public' and p.proname='decrement_credit'
) as has_decrement_credit;

-- Show migration history
select version, name from supabase_migrations.schema_migrations order by version;
