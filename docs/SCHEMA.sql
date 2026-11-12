-- ============================================================
-- Tempo — схема Supabase (PostgreSQL) для серверной синхронизации
-- РОАДМАП: сейчас приложение работает без бэкенда (localStorage
-- + Telegram CloudStorage). Эта схема — путь миграции.
-- ============================================================

-- Пользователи (аутентификация через Telegram Login / Supabase Auth)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  telegram_id bigint unique,
  name text,
  locale text not null default 'ru',
  currency text not null default 'EUR',
  kcal_target int not null default 2200,
  widgets jsonb not null default '{}',
  settings jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('expense','income')),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'EUR',
  category text not null,
  note text,
  date date not null,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  priority int not null default 2 check (priority between 1 and 3),
  done boolean not null default false,
  due date,
  recurrence text check (recurrence in ('daily','weekdays','weekly','monthly')),
  created_at timestamptz not null default now()
);

create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  date date not null,
  time text,
  duration_min int,
  remind_min int,
  recurrence text check (recurrence in ('daily','weekdays','weekly','monthly')),
  location text,
  created_at timestamptz not null default now()
);

create table meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  date date not null,
  source text not null default 'manual' check (source in ('manual','ai')),
  created_at timestamptz not null default now()
);

create table meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references meals(id) on delete cascade,
  name text not null,
  kcal numeric(8,2) not null check (kcal >= 0),
  p numeric(8,2) not null default 0,
  c numeric(8,2) not null default 0,
  f numeric(8,2) not null default 0
);

create table budgets (
  user_id uuid not null references profiles(id) on delete cascade,
  category text not null,
  amount numeric(12,2) not null check (amount > 0),
  primary key (user_id, category)
);

create table custom_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  kcal numeric(8,2) not null,
  p numeric(8,2) not null default 0,
  c numeric(8,2) not null default 0,
  f numeric(8,2) not null default 0
);

-- ============================================================
-- Row Level Security: каждый пользователь видит только свои данные
-- ============================================================

alter table profiles enable row level security;
alter table transactions enable row level security;
alter table tasks enable row level security;
alter table events enable row level security;
alter table meals enable row level security;
alter table meal_items enable row level security;
alter table budgets enable row level security;
alter table custom_foods enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = id);

create policy "own transactions" on transactions
  for all using (auth.uid() = user_id);

create policy "own tasks" on tasks
  for all using (auth.uid() = user_id);

create policy "own events" on events
  for all using (auth.uid() = user_id);

create policy "own meals" on meals
  for all using (auth.uid() = user_id);

create policy "own meal items" on meal_items
  for all using (
    exists (select 1 from meals m
            where m.id = meal_id and m.user_id = auth.uid())
  );

create policy "own budgets" on budgets
  for all using (auth.uid() = user_id);

create policy "own foods" on custom_foods
  for all using (auth.uid() = user_id);

-- Индексы для типовых запросов
create index on transactions (user_id, date desc);
create index on tasks (user_id, done, due);
create index on events (user_id, date);
create index on meals (user_id, date);
