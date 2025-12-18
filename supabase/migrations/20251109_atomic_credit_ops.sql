-- Add atomic credit decrement RPC function
create or replace function public.decrement_credit(p_user_id uuid)
returns public.users
language sql
security definer
as $$
  update public.users
  set remaining_credits = remaining_credits - 1
  where id = p_user_id
    and remaining_credits > 0
  returning *;
$$;

