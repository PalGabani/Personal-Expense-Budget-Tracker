create extension if not exists pgcrypto;

create table public.categories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    name text not null check (char_length(trim(name)) between 1 and 60),
    type text not null check (type in ('income', 'expense')),
    is_default boolean not null default false,
    created_at timestamptz not null default now(),
    constraint categories_id_user_type_unique unique (id, user_id, type)
);
create unique index categories_name_type_unique
    on public.categories (user_id, type, lower(name));

create table public.transactions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    category_id uuid not null,
    type text not null check (type in ('income', 'expense')),
    amount_minor bigint not null check (amount_minor > 0),
    currency char(3) not null default 'INR' check (currency = 'INR'),
    transaction_date date not null,
    note text check (note is null or char_length(note) <= 300),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint transactions_category_owner_type_fk
        foreign key (category_id, user_id, type)
        references public.categories (id, user_id, type)
        on delete restrict
);

create table public.budgets (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    category_id uuid not null,
    category_type text not null default 'expense' check (category_type = 'expense'),
    month date not null check (extract(day from month) = 1),
    amount_minor bigint not null check (amount_minor > 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint budgets_category_owner_type_fk
        foreign key (category_id, user_id, category_type)
        references public.categories (id, user_id, type)
        on delete restrict,
    constraint budgets_month_category_unique unique (user_id, category_id, month)
);

create index transactions_user_date_idx
    on public.transactions (user_id, transaction_date desc);
create index transactions_user_category_idx
    on public.transactions (user_id, category_id);
create index budgets_user_month_idx
    on public.budgets (user_id, month);

alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;

revoke all on public.categories, public.transactions, public.budgets from anon;
grant select, insert, update, delete
    on public.categories, public.transactions, public.budgets to authenticated;

create policy "Users manage their own categories"
    on public.categories for all to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create policy "Users manage their own transactions"
    on public.transactions for all to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create policy "Users manage their own budgets"
    on public.budgets for all to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

create function public.create_default_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.categories (user_id, name, type, is_default)
    values
        (new.id, 'Food & Dining', 'expense', true),
        (new.id, 'Transport', 'expense', true),
        (new.id, 'Housing', 'expense', true),
        (new.id, 'Utilities', 'expense', true),
        (new.id, 'Shopping', 'expense', true),
        (new.id, 'Health', 'expense', true),
        (new.id, 'Salary', 'income', true),
        (new.id, 'Other Income', 'income', true);
    return new;
end;
$$;

create trigger on_auth_user_created_add_categories
    after insert on auth.users
    for each row execute procedure public.create_default_categories();

revoke execute on function public.create_default_categories() from public, anon, authenticated;
