create extension if not exists pgcrypto;

create table public.v2_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '海风',
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.v2_ledgers (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 50),
  currency text not null default 'CNY' check (currency = 'CNY'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.v2_ledger_members (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.v2_ledgers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ledger_id, user_id)
);

create table public.v2_accounts (
  id uuid primary key,
  ledger_id uuid not null references public.v2_ledgers(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 50),
  kind text not null check (kind in ('cash', 'wechat', 'alipay', 'debit_card', 'credit_card', 'custom')),
  account_class text not null check (account_class in ('asset', 'liability')),
  currency text not null default 'CNY' check (currency = 'CNY'),
  opening_balance_cents bigint not null default 0,
  sort_order integer not null default 0 check (sort_order >= 0),
  version integer not null default 1 check (version > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.v2_categories (
  id uuid primary key,
  ledger_id uuid not null references public.v2_ledgers(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 30),
  kind text not null check (kind in ('expense', 'income')),
  icon_key text not null check (length(btrim(icon_key)) between 1 and 50),
  sort_order integer not null default 0 check (sort_order >= 0),
  version integer not null default 1 check (version > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.v2_transactions (
  id uuid primary key,
  operation_id uuid not null unique,
  ledger_id uuid not null references public.v2_ledgers(id) on delete cascade,
  type text not null check (type in ('expense', 'income', 'transfer', 'refund', 'adjustment')),
  amount_cents bigint not null check (amount_cents > 0),
  category_id uuid references public.v2_categories(id) on delete restrict,
  occurred_at timestamptz not null,
  note text not null default '' check (length(note) <= 500),
  original_transaction_id uuid references public.v2_transactions(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.v2_transaction_entries (
  id uuid primary key default gen_random_uuid(),
  ledger_id uuid not null references public.v2_ledgers(id) on delete cascade,
  transaction_id uuid not null references public.v2_transactions(id) on delete cascade,
  account_id uuid not null references public.v2_accounts(id) on delete restrict,
  delta_cents bigint not null check (delta_cents <> 0),
  position smallint not null check (position between 0 and 1),
  created_at timestamptz not null default now(),
  unique (transaction_id, position)
);

create table public.v2_budgets (
  id uuid primary key,
  ledger_id uuid not null references public.v2_ledgers(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount_cents bigint not null check (amount_cents > 0),
  version integer not null default 1 check (version > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ledger_id, month)
);

create table public.v2_category_budgets (
  id uuid primary key,
  ledger_id uuid not null references public.v2_ledgers(id) on delete cascade,
  category_id uuid not null references public.v2_categories(id) on delete restrict,
  month date not null check (extract(day from month) = 1),
  amount_cents bigint not null check (amount_cents > 0),
  version integer not null default 1 check (version > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ledger_id, month, category_id)
);

create table public.v2_reminders (
  id uuid primary key,
  ledger_id uuid not null references public.v2_ledgers(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 50),
  amount_cents bigint check (amount_cents > 0),
  category_id uuid references public.v2_categories(id) on delete restrict,
  account_id uuid references public.v2_accounts(id) on delete restrict,
  recurrence text not null check (length(btrim(recurrence)) between 1 and 100),
  next_due_at timestamptz not null,
  version integer not null default 1 check (version > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.v2_sync_operations (
  operation_id uuid primary key,
  ledger_id uuid not null references public.v2_ledgers(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_kind text not null,
  result jsonb not null check (jsonb_typeof(result) = 'object'),
  created_at timestamptz not null default now()
);

create table public.v2_change_log (
  change_seq bigint generated always as identity primary key,
  ledger_id uuid not null references public.v2_ledgers(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  entity_version integer not null check (entity_version > 0),
  tombstone boolean not null default false,
  record jsonb not null check (jsonb_typeof(record) = 'object'),
  changed_at timestamptz not null default now()
);

create index v2_members_user_ledger_idx on public.v2_ledger_members(user_id, ledger_id);
create index v2_accounts_ledger_idx on public.v2_accounts(ledger_id, sort_order);
create index v2_categories_ledger_idx on public.v2_categories(ledger_id, kind, sort_order);
create index v2_transactions_ledger_time_idx on public.v2_transactions(ledger_id, occurred_at desc);
create index v2_entries_transaction_idx on public.v2_transaction_entries(transaction_id, position);
create index v2_change_log_pull_idx on public.v2_change_log(ledger_id, change_seq);
create index v2_sync_operations_user_idx on public.v2_sync_operations(user_id, created_at);

alter table public.v2_profiles enable row level security;
alter table public.v2_ledgers enable row level security;
alter table public.v2_ledger_members enable row level security;
alter table public.v2_accounts enable row level security;
alter table public.v2_categories enable row level security;
alter table public.v2_transactions enable row level security;
alter table public.v2_transaction_entries enable row level security;
alter table public.v2_budgets enable row level security;
alter table public.v2_category_budgets enable row level security;
alter table public.v2_reminders enable row level security;
alter table public.v2_sync_operations enable row level security;
alter table public.v2_change_log enable row level security;

create or replace function public.v2_is_ledger_member(target_ledger uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.v2_ledger_members member
    where member.ledger_id = target_ledger
      and member.user_id = auth.uid()
  );
$$;

revoke all on function public.v2_is_ledger_member(uuid) from public, anon, authenticated;
grant execute on function public.v2_is_ledger_member(uuid) to authenticated;

create policy v2_profiles_self_select on public.v2_profiles
  for select to authenticated using (id = auth.uid());
create policy v2_ledgers_member_select on public.v2_ledgers
  for select to authenticated using (public.v2_is_ledger_member(id));
create policy v2_members_member_select on public.v2_ledger_members
  for select to authenticated using (public.v2_is_ledger_member(ledger_id));
create policy v2_accounts_member_select on public.v2_accounts
  for select to authenticated using (public.v2_is_ledger_member(ledger_id));
create policy v2_categories_member_select on public.v2_categories
  for select to authenticated using (public.v2_is_ledger_member(ledger_id));
create policy v2_transactions_member_select on public.v2_transactions
  for select to authenticated using (public.v2_is_ledger_member(ledger_id));
create policy v2_entries_member_select on public.v2_transaction_entries
  for select to authenticated using (public.v2_is_ledger_member(ledger_id));
create policy v2_budgets_member_select on public.v2_budgets
  for select to authenticated using (public.v2_is_ledger_member(ledger_id));
create policy v2_category_budgets_member_select on public.v2_category_budgets
  for select to authenticated using (public.v2_is_ledger_member(ledger_id));
create policy v2_reminders_member_select on public.v2_reminders
  for select to authenticated using (public.v2_is_ledger_member(ledger_id));
create policy v2_sync_operations_owner_select on public.v2_sync_operations
  for select to authenticated using (user_id = auth.uid() and public.v2_is_ledger_member(ledger_id));
create policy v2_change_log_member_select on public.v2_change_log
  for select to authenticated using (public.v2_is_ledger_member(ledger_id));

revoke all on table public.v2_profiles, public.v2_ledgers, public.v2_ledger_members,
  public.v2_accounts, public.v2_categories, public.v2_transactions,
  public.v2_transaction_entries, public.v2_budgets, public.v2_category_budgets,
  public.v2_reminders, public.v2_sync_operations, public.v2_change_log
from anon, authenticated;

grant select on table public.v2_profiles, public.v2_ledgers, public.v2_ledger_members,
  public.v2_accounts, public.v2_categories, public.v2_transactions,
  public.v2_transaction_entries, public.v2_budgets, public.v2_category_budgets,
  public.v2_reminders, public.v2_sync_operations, public.v2_change_log
to authenticated;

create or replace function public.v2_bootstrap_personal_ledger()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  target_ledger_id uuid;
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  select member.ledger_id into target_ledger_id
  from public.v2_ledger_members member
  join public.v2_ledgers ledger on ledger.id = member.ledger_id
  where member.user_id = current_user_id
    and member.role = 'owner'
    and ledger.owner_user_id = current_user_id
  order by ledger.created_at
  limit 1;

  if target_ledger_id is not null then
    return jsonb_build_object('ledgerId', target_ledger_id);
  end if;

  insert into public.v2_profiles(id)
  values (current_user_id)
  on conflict (id) do nothing;

  insert into public.v2_ledgers(owner_user_id, name)
  values (current_user_id, '海风的小账本')
  returning id into target_ledger_id;

  insert into public.v2_ledger_members(ledger_id, user_id, role)
  values (target_ledger_id, current_user_id, 'owner');

  insert into public.v2_accounts(
    id, ledger_id, name, kind, account_class, opening_balance_cents, sort_order
  ) values
    (gen_random_uuid(), target_ledger_id, '现金', 'cash', 'asset', 0, 0),
    (gen_random_uuid(), target_ledger_id, '微信', 'wechat', 'asset', 0, 1),
    (gen_random_uuid(), target_ledger_id, '支付宝', 'alipay', 'asset', 0, 2),
    (gen_random_uuid(), target_ledger_id, '储蓄卡', 'debit_card', 'asset', 0, 3),
    (gen_random_uuid(), target_ledger_id, '信用卡', 'credit_card', 'liability', 0, 4);

  insert into public.v2_categories(id, ledger_id, name, kind, icon_key, sort_order) values
    (gen_random_uuid(), target_ledger_id, '餐饮', 'expense', 'food', 0),
    (gen_random_uuid(), target_ledger_id, '交通', 'expense', 'transport', 1),
    (gen_random_uuid(), target_ledger_id, '购物', 'expense', 'shopping', 2),
    (gen_random_uuid(), target_ledger_id, '住房', 'expense', 'home', 3),
    (gen_random_uuid(), target_ledger_id, '娱乐', 'expense', 'fun', 4),
    (gen_random_uuid(), target_ledger_id, '日用', 'expense', 'daily', 5),
    (gen_random_uuid(), target_ledger_id, '学习', 'expense', 'study', 6),
    (gen_random_uuid(), target_ledger_id, '医疗', 'expense', 'medical', 7),
    (gen_random_uuid(), target_ledger_id, '旅行', 'expense', 'travel', 8),
    (gen_random_uuid(), target_ledger_id, '其他', 'expense', 'other', 9),
    (gen_random_uuid(), target_ledger_id, '工资', 'income', 'salary', 0),
    (gen_random_uuid(), target_ledger_id, '其他收入', 'income', 'income-other', 1);

  insert into public.v2_change_log(ledger_id, entity_type, entity_id, entity_version, record)
  select target_ledger_id, 'ledger', ledger.id, ledger.version, to_jsonb(ledger)
  from public.v2_ledgers ledger where ledger.id = target_ledger_id;

  insert into public.v2_change_log(ledger_id, entity_type, entity_id, entity_version, record)
  select target_ledger_id, 'member', member.id, member.version, to_jsonb(member)
  from public.v2_ledger_members member where member.ledger_id = target_ledger_id;

  insert into public.v2_change_log(ledger_id, entity_type, entity_id, entity_version, record)
  select target_ledger_id, 'account', account.id, account.version, to_jsonb(account)
  from public.v2_accounts account where account.ledger_id = target_ledger_id;

  insert into public.v2_change_log(ledger_id, entity_type, entity_id, entity_version, record)
  select target_ledger_id, 'category', category.id, category.version, to_jsonb(category)
  from public.v2_categories category where category.ledger_id = target_ledger_id;

  return jsonb_build_object('ledgerId', target_ledger_id);
end;
$$;

revoke all on function public.v2_bootstrap_personal_ledger() from public, anon, authenticated;
grant execute on function public.v2_bootstrap_personal_ledger() to authenticated;
