-- Jadwal harian: panggil Edge Function `send-reminders` setiap 08.00 WIB (= 01.00 UTC).
-- Jalankan SEKALI di Supabase SQL Editor SETELAH function di-deploy.
-- Ganti dua nilai <...> di bawah dulu.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Simpan URL project dan secret di Vault (terenkripsi), bukan ditulis langsung di jadwal
select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'ingetin_project_url');
select vault.create_secret('<CRON_SECRET_YANG_SAMA_DENGAN_DI_FUNCTION>', 'ingetin_cron_secret');

select cron.schedule(
  'ingetin-send-reminders',
  '0 1 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'ingetin_project_url') || '/functions/v1/send-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'ingetin_cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Cek jadwal:          select * from cron.job;
-- Cek riwayat jalan:   select * from cron.job_run_details order by start_time desc limit 10;
-- Hapus jadwal:        select cron.unschedule('ingetin-send-reminders');
