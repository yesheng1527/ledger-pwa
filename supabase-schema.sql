create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '小明',
  bio text not null default '记录每一笔，掌控每一天',
  avatar text not null default '人',
  theme text not null default 'teal',
  current_month text not null default to_char(current_date, 'YYYY-MM'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accounts (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  balance numeric(14, 2) not null default 0,
  color text not null default '#009b8f',
  icon text not null default '账',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.categories (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  name text not null,
  color text not null,
  icon text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.transactions (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount numeric(14, 2) not null check (amount >= 0),
  title text not null,
  category_id text not null,
  account_id text not null,
  tx_date date not null,
  tx_time time not null default '09:41',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, category_id) references public.categories(user_id, id) on delete restrict,
  foreign key (user_id, account_id) references public.accounts(user_id, id) on delete restrict
);

create table if not exists public.budgets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  total numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.category_budgets (
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id text not null,
  amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, category_id),
  foreign key (user_id, category_id) references public.categories(user_id, id) on delete cascade
);

create table if not exists public.saving_plans (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default '标',
  target numeric(14, 2) not null default 0,
  saved numeric(14, 2) not null default 0,
  due_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists idx_transactions_user_date on public.transactions(user_id, tx_date desc, tx_time desc);
create index if not exists idx_categories_user_type on public.categories(user_id, type);

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.category_budgets enable row level security;
alter table public.saving_plans enable row level security;

drop policy if exists profiles_owner_all on public.profiles;
drop policy if exists accounts_owner_all on public.accounts;
drop policy if exists categories_owner_all on public.categories;
drop policy if exists transactions_owner_all on public.transactions;
drop policy if exists budgets_owner_all on public.budgets;
drop policy if exists category_budgets_owner_all on public.category_budgets;
drop policy if exists saving_plans_owner_all on public.saving_plans;

create policy profiles_owner_all on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy accounts_owner_all on public.accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy categories_owner_all on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy transactions_owner_all on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy budgets_owner_all on public.budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy category_budgets_owner_all on public.category_budgets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy saving_plans_owner_all on public.saving_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.seed_ledger_defaults(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() <> target_user then
    raise exception 'cannot seed ledger data for another user';
  end if;

  insert into public.profiles(user_id)
  values (target_user)
  on conflict (user_id) do nothing;

  insert into public.accounts(id, user_id, name, balance, color, icon, is_default)
  values
    ('wechat', target_user, '微信钱包', 0.00, '#11c95f', '微', true),
    ('alipay', target_user, '支付宝账户', 0.00, '#3487ff', '支', false),
    ('cmb', target_user, '招商银行储蓄卡', 0.00, '#e51b2a', '招', false),
    ('cash', target_user, '现金', 0.00, '#ff9d00', '现', false)
  on conflict (user_id, id) do nothing;

  insert into public.categories(id, user_id, type, name, color, icon)
  values
    ('food', target_user, 'expense', '餐饮美食', '#ff9d1b', '食'),
    ('transport', target_user, 'expense', '交通出行', '#4d86f7', '车'),
    ('shopping', target_user, 'expense', '购物消费', '#27be72', '购'),
    ('home', target_user, 'expense', '居家生活', '#8b5be8', '家'),
    ('fun', target_user, 'expense', '休闲娱乐', '#ff5c72', '乐'),
    ('network', target_user, 'expense', '通讯网络', '#ff7a1a', '网'),
    ('salary', target_user, 'income', '工资收入', '#009b8f', '工'),
    ('bonus', target_user, 'income', '奖金红包', '#34c759', '奖')
  on conflict (user_id, id) do nothing;

  insert into public.budgets(user_id, total)
  values (target_user, 0.00)
  on conflict (user_id) do nothing;



end;
$$;

revoke execute on function public.seed_ledger_defaults(uuid) from anon;
grant execute on function public.seed_ledger_defaults(uuid) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_ledger_defaults(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_seed_ledger on auth.users;
create trigger on_auth_user_created_seed_ledger
  after insert on auth.users
  for each row execute function public.handle_new_user();
