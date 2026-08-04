alter table public.v2_accounts
  add constraint v2_accounts_id_ledger_key unique (id, ledger_id);

alter table public.v2_categories
  add constraint v2_categories_id_ledger_key unique (id, ledger_id);

alter table public.v2_transactions
  add constraint v2_transactions_id_ledger_key unique (id, ledger_id);

alter table public.v2_transactions
  drop constraint v2_transactions_category_id_fkey,
  add constraint v2_transactions_category_ledger_fkey
    foreign key (category_id, ledger_id)
    references public.v2_categories(id, ledger_id)
    on delete restrict,
  drop constraint v2_transactions_original_transaction_id_fkey,
  add constraint v2_transactions_original_ledger_fkey
    foreign key (original_transaction_id, ledger_id)
    references public.v2_transactions(id, ledger_id)
    on delete restrict;

alter table public.v2_transaction_entries
  drop constraint v2_transaction_entries_transaction_id_fkey,
  add constraint v2_entries_transaction_ledger_fkey
    foreign key (transaction_id, ledger_id)
    references public.v2_transactions(id, ledger_id)
    on delete cascade,
  drop constraint v2_transaction_entries_account_id_fkey,
  add constraint v2_entries_account_ledger_fkey
    foreign key (account_id, ledger_id)
    references public.v2_accounts(id, ledger_id)
    on delete restrict;

alter table public.v2_category_budgets
  drop constraint v2_category_budgets_category_id_fkey,
  add constraint v2_category_budgets_category_ledger_fkey
    foreign key (category_id, ledger_id)
    references public.v2_categories(id, ledger_id)
    on delete restrict;

alter table public.v2_reminders
  drop constraint v2_reminders_category_id_fkey,
  add constraint v2_reminders_category_ledger_fkey
    foreign key (category_id, ledger_id)
    references public.v2_categories(id, ledger_id)
    on delete restrict,
  drop constraint v2_reminders_account_id_fkey,
  add constraint v2_reminders_account_ledger_fkey
    foreign key (account_id, ledger_id)
    references public.v2_accounts(id, ledger_id)
    on delete restrict;
