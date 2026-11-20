-- Ingetin: kuota harian asisten AI (supaya biaya API tidak jebol kalau ada yang spam)
-- Jalankan SETELAH 20261120010000_hardening.sql.

create table if not exists public.chat_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null,
  count   int  not null default 0,
  primary key (user_id, day)
);

alter table public.chat_usage enable row level security;

-- User boleh MELIHAT pemakaiannya sendiri (untuk menampilkan sisa kuota), tapi tidak boleh mengubah.
drop policy if exists "chat_usage: lihat milik sendiri" on public.chat_usage;
create policy "chat_usage: lihat milik sendiri" on public.chat_usage
  for select to authenticated using ((select auth.uid()) = user_id);
grant select on public.chat_usage to authenticated;

-- Tambah 1 pemakaian kalau masih di bawah batas. Mengembalikan jumlah setelah ditambah,
-- atau NULL kalau kuota hari ini sudah habis. Atomic, aman kalau dipanggil bersamaan.
create or replace function public.bump_chat_usage(p_user uuid, p_day date, p_limit int)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  insert into public.chat_usage (user_id, day, count)
  values (p_user, p_day, 1)
  on conflict (user_id, day) do update
    set count = public.chat_usage.count + 1
    where public.chat_usage.count < p_limit
  returning count into n;
  return n; -- NULL = tidak ada baris yang di-update = kuota habis
end;
$$;

revoke execute on function public.bump_chat_usage(uuid, date, int) from public, anon, authenticated;
grant  execute on function public.bump_chat_usage(uuid, date, int) to service_role;

-- Bersihkan data kuota lama (opsional, jalankan sesekali):
-- delete from public.chat_usage where day < current_date - 30;
