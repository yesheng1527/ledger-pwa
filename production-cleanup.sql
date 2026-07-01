-- Run this in Supabase SQL Editor after logging in users are ready for production.
-- It removes demo bills and resets seeded account balances for the current authenticated user.

delete from public.transactions
where user_id = auth.uid();

update public.accounts
set balance = 0
where user_id = auth.uid();

update public.budgets
set total = 0
where user_id = auth.uid();

delete from public.category_budgets
where user_id = auth.uid();

delete from public.saving_plans
where user_id = auth.uid();
