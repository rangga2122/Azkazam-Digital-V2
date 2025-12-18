-- Add allowed_features column to public.users if it doesn't exist yet
begin;

alter table if exists public.users
  add column if not exists allowed_features text[];

comment on column public.users.allowed_features is 'Daftar menu/fitur yang diizinkan untuk user';

commit;

