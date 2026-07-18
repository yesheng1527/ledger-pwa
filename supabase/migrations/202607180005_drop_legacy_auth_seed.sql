drop trigger if exists on_auth_user_created_seed_ledger on auth.users;
drop function if exists public.handle_new_user();
drop function if exists public.seed_ledger_defaults(uuid);
