-- Ingetin: skema awal
-- Jalankan di Supabase SQL Editor, atau `npx supabase db push` setelah `supabase link`.

-- 1. Item: dokumen atau tagihan milik user
create table if not exists public.items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('dokumen', 'tagihan')),
  name        text not null check (char_length(name) between 1 and 100),
  due_date    date not null,
  repeat      text not null default 'none' check (repeat in ('none', 'monthly', 'yearly', '5yearly')),
  amount      bigint check (amount is null or amount >= 0),
  remind_days int[] not null default '{30,7,1}',   -- H-30, H-7, H-1 (0 = hari H)
  note        text check (note is null or char_length(note) <= 500),
  created_at  timestamptz not null default now()
);

create index if not exists items_user_id_idx  on public.items (user_id);
create index if not exists items_due_date_idx on public.items (due_date);

-- 2. Langganan web push per perangkat
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

-- 3. Catatan notifikasi yang sudah terkirim (agar tidak dobel kalau fungsi jalan 2x)
create table if not exists public.notification_log (
  item_id     uuid not null references public.items (id) on delete cascade,
  days_before int  not null,
  due_date    date not null,
  sent_at     timestamptz not null default now(),
  primary key (item_id, days_before, due_date)
);

-- 4. Row Level Security: user hanya bisa melihat & mengubah datanya sendiri
alter table public.items              enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log   enable row level security;  -- tanpa policy: hanya service role

create policy "items: lihat milik sendiri"   on public.items for select to authenticated using ((select auth.uid()) = user_id);
create policy "items: tambah milik sendiri"  on public.items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "items: ubah milik sendiri"    on public.items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "items: hapus milik sendiri"   on public.items for delete to authenticated using ((select auth.uid()) = user_id);

create policy "push: lihat milik sendiri"    on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "push: tambah milik sendiri"   on public.push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "push: ubah milik sendiri"     on public.push_subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "push: hapus milik sendiri"    on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.items, public.push_subscriptions to authenticated;

-- 5. Daftar pengingat yang harus dikirim pada tanggal tertentu
--    (jatuh_tempo - hari_sebelumnya = hari ini, dan belum pernah dikirim)
create or replace function public.due_reminders(p_today date)
returns table (item_id uuid, user_id uuid, name text, kind text, due_date date, days_before int)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.user_id, i.name, i.kind, i.due_date, d.days_before
  from public.items i
  cross join lateral unnest(i.remind_days) as d(days_before)
  where i.due_date - d.days_before = p_today
    and not exists (
      select 1 from public.notification_log l
      where l.item_id = i.id and l.days_before = d.days_before and l.due_date = i.due_date
    );
$$;

-- Hanya server (service role) yang boleh memanggil fungsi ini
revoke execute on function public.due_reminders(date) from public, anon, authenticated;
grant  execute on function public.due_reminders(date) to service_role;
