-- Ingetin: penguatan keamanan + fitur tambahan
-- Jalankan SETELAH 20261120000000_init.sql (SQL Editor atau `npx supabase db push`).

-- 1. Validasi remind_days di database (jangan hanya percaya frontend)
--    Nilai positif = H-x sebelum jatuh tempo, 0 = hari H, negatif = H+x (sudah terlewat).
create or replace function public.valid_remind_days(d int[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(d) between 1 and 10
     and array_ndims(d) = 1
     and not exists (select 1 from unnest(d) as x where x is null or x < -30 or x > 365);
$$;

alter table public.items drop constraint if exists items_remind_days_valid;
alter table public.items add constraint items_remind_days_valid check (public.valid_remind_days(remind_days));

-- 2. Kolom updated_at untuk fitur edit
alter table public.items add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists items_touch_updated_at on public.items;
create trigger items_touch_updated_at before update on public.items
  for each row execute function public.touch_updated_at();

-- 3. Batas jumlah data per user (mencegah penyalahgunaan / spam isi database)
create or replace function public.enforce_row_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_rows int := tg_argv[0]::int;
  n int;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into n using new.user_id;
  if n >= max_rows then
    raise exception 'Batas maksimal % data tercapai', max_rows using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists items_row_limit on public.items;
create trigger items_row_limit before insert on public.items
  for each row execute function public.enforce_row_limit('500');

drop trigger if exists push_row_limit on public.push_subscriptions;
create trigger push_row_limit before insert on public.push_subscriptions
  for each row execute function public.enforce_row_limit('20');

-- Validasi isi langganan push (endpoint harus HTTPS, panjang wajar)
alter table public.push_subscriptions drop constraint if exists push_endpoint_https;
alter table public.push_subscriptions
  add constraint push_endpoint_https check (endpoint like 'https://%' and char_length(endpoint) <= 1000);
alter table public.push_subscriptions drop constraint if exists push_keys_len;
alter table public.push_subscriptions
  add constraint push_keys_len check (char_length(p256dh) <= 200 and char_length(auth) <= 100);

-- 4. Simpan langganan push (dipakai frontend).
--    Kalau endpoint perangkat ini masih tercatat atas nama akun lain (ganti akun di HP yang sama),
--    langganan dipindah ke akun yang sedang login. Upsert biasa gagal di sini karena RLS.
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Harus login' using errcode = 'insufficient_privilege';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id    = excluded.user_id,
        p256dh     = excluded.p256dh,
        auth       = excluded.auth,
        user_agent = excluded.user_agent,
        created_at = now();
end;
$$;

revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant  execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- 5. Hapus akun sendiri (data items & push ikut terhapus lewat ON DELETE CASCADE)
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Harus login' using errcode = 'insufficient_privilege';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;

-- 6. due_reminders versi baru: ada jendela "susulan" (p_lookback hari).
--    Kalau cron sempat gagal 1–2 hari, pengingat yang tertinggal tetap dikirim besoknya.
--    notification_log tetap mencegah pengiriman dobel.
drop function if exists public.due_reminders(date);

create or replace function public.due_reminders(p_today date, p_lookback int default 2)
returns table (
  item_id uuid, user_id uuid, name text, kind text, due_date date,
  amount bigint, days_before int, days_left int
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.user_id, i.name, i.kind, i.due_date, i.amount, d.days_before,
         (i.due_date - p_today)::int as days_left
  from public.items i
  cross join lateral unnest(i.remind_days) as d(days_before)
  where i.due_date - d.days_before between p_today - greatest(p_lookback, 0) and p_today
    and not exists (
      select 1 from public.notification_log l
      where l.item_id = i.id and l.days_before = d.days_before and l.due_date = i.due_date
    );
$$;

revoke execute on function public.due_reminders(date, int) from public, anon, authenticated;
grant  execute on function public.due_reminders(date, int) to service_role;
