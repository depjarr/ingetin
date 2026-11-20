# Ingetin – Starter (Supabase + PWA + Web Push)

Pengingat masa berlaku dokumen & tagihan. Notifikasi dikirim server setiap pagi jam 08.00 WIB lewat **web push**, sehingga jalan di Android (Chrome) dan iPhone (iOS 16.4+, setelah PWA dipasang di Layar Utama).

```
ingetin-starter/
├── supabase/
│   ├── migrations/20261120000000_init.sql   ← tabel, RLS, fungsi due_reminders
│   ├── migrations/20261120010000_hardening.sql ← validasi, batas data, hapus akun, susulan
│   ├── migrations/20261120020000_chat.sql   ← kuota harian asisten AI
│   ├── functions/chat/                      ← Edge Function asisten AI (Gemini)
│   ├── functions/send-reminders/index.ts    ← Edge Function pengirim push
│   └── setup_cron.sql                       ← jadwal harian (pg_cron)
├── web-vue/                                  ← PWA versi Vue 3 + Vite  ← VERSI UTAMA (fitur terbaru)
├── web/                                      ← PWA HTML biasa (versi lama, belum dapat fitur baru)
└── .github/workflows/ci.yml                  ← lint + test + build otomatis di GitHub
    ├── index.html, style.css, app.js
    ├── config.js                             ← isi URL & key di sini
    ├── sw.js                                 ← service worker (terima push)
    ├── manifest.json
    └── icons/
```

## Fitur

- **Akun:** daftar, masuk, **lupa password** (link reset lewat email), ganti password, **hapus akun** (semua data ikut terhapus).
- **Pengingat:** tambah, **ubah**, hapus, tandai selesai / diperpanjang (otomatis maju ke periode berikutnya).
- Pilihan waktu: H-30, H-14, H-7, H-3, H-1, Hari H, dan **H+1 / H+3** (diingatkan lagi kalau sudah lewat dan belum diurus).
- **Cari & filter** (jenis, 30 hari ke depan, sudah lewat).
- **Web push** tiap 08.00 WIB; klik notifikasi langsung membuka & menyorot item terkait.
- **Cadangan email** (Resend, opsional) kalau push tidak aktif. Bisa dimatikan user di Pengaturan.
- **Tampilan gaya iPhone:** tab bar berlabel (Beranda, Kalender, +, Daftar, Asisten), warna & ikon per kategori otomatis (kendaraan, identitas, kesehatan, listrik, internet, cicilan, …), bahasa sehari-hari ("1 minggu sebelum", bukan "H-7").
- **Kartu gaya Wallet di beranda:** geser kiri/kanan, atau biarkan berganti otomatis mengikuti urutan jatuh tempo.
- **Kalender:** tampilan bulan dengan titik berwarna; tagihan bulanan/tahunan otomatis muncul di bulan-bulan berikutnya sebagai perkiraan. Ketuk tanggal untuk lihat jadwal atau menambah pengingat di tanggal itu.
- **Notifikasi gaya iPhone:** banner turun dari atas (bisa digeser ke atas untuk menutup), pusat notifikasi dari tombol lonceng, alert & action sheet ala iOS.
- **Scan dokumen:** tombol + di tengah → "Foto atau upload dokumen". Taruh/ambil foto atau PDF (maks 3), file "masuk ke saku dompet", dibaca AI, lalu keluar sebagai kartu usulan pengingat. Bisa juga cukup tulis keterangan.
- **Asisten AI (Gemini):** tanya "apa yang paling dekat jatuh tempo?", "berapa total tagihan bulan ini?", atau kirim **foto/PDF dokumen** (STNK, SIM, tagihan) dan asisten membaca tanggalnya lalu **mengusulkan** pengingat. Usulan tampil sebagai kartu; data baru tersimpan setelah user menekan **Simpan**. Bisa juga mengusulkan perubahan ("geser tagihan internet ke tanggal 5").
- **Susulan otomatis:** kalau cron gagal 1–2 hari, pengingat yang tertinggal tetap dikirim (tanpa dobel).

## Alur kerja

1. User login → tambah item (mis. STNK, 14 Des 2026, ingatkan H-30/H-7/H-1).
2. User tekan **Aktifkan notifikasi** → browser memberi *subscription* → disimpan di tabel `push_subscriptions`.
3. Setiap 01.00 UTC (= 08.00 WIB) **pg_cron** memanggil Edge Function `send-reminders`.
4. Function memanggil `due_reminders(hari_ini)` → mengirim push ke semua perangkat user → mencatat di `notification_log` agar tidak dobel. Subscription yang sudah mati (404/410) otomatis dihapus.

---

## Setup

Prasyarat: akun [Supabase](https://supabase.com) (gratis) dan Node.js 18+.

### 1. Buat project Supabase
Catat **Project URL** dan **anon / publishable key** di *Project Settings → API*. `<PROJECT_REF>` adalah bagian `xxxx` dari `https://xxxx.supabase.co`.

### 2. Buat tabel
Buka **SQL Editor**, jalankan berurutan:
1. `supabase/migrations/20261120000000_init.sql`
2. `supabase/migrations/20261120010000_hardening.sql`
3. `supabase/migrations/20261120020000_chat.sql`

Atau lewat CLI:
```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
```

### 3. Buat kunci VAPID
```bash
npx web-push generate-vapid-keys
```
Simpan **Public Key** dan **Private Key**. Private key jangan pernah masuk ke folder `web/` atau ke Git.

Buat juga satu secret acak untuk cron:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Deploy Edge Function
```bash
npx supabase secrets set \
  VAPID_PUBLIC_KEY="<public key>" \
  VAPID_PRIVATE_KEY="<private key>" \
  VAPID_SUBJECT="mailto:emailkamu@contoh.com" \
  CRON_SECRET="<secret acak tadi>"

npx supabase functions deploy send-reminders --no-verify-jwt
```
`--no-verify-jwt` dipakai karena function ini diamankan dengan `CRON_SECRET` sendiri, bukan login user.

**(Opsional) cadangan email lewat [Resend](https://resend.com):** verifikasi domain di Resend, lalu:
```bash
npx supabase secrets set   RESEND_API_KEY="re_..."   EMAIL_FROM="Ingetin <pengingat@domainkamu.com>"   APP_URL="https://alamat-pwa-kamu.vercel.app/"
```
Tanpa secret ini, function tetap jalan dan hanya mengirim push.

### 4b. Asisten AI (Edge Function `chat`)
Asisten memakai **Google Gemini** lewat API key dari [Google AI Studio](https://aistudio.google.com/apikey). Ada kuota gratis (dengan batas per menit/hari); cek detailnya di halaman pricing AI Studio.
```bash
npx supabase secrets set GEMINI_API_KEY="AIza..."
# opsional:
npx supabase secrets set GEMINI_MODEL="gemini-3.5-flash-lite"   # default; model lain: gemini-3.6-flash (lebih pintar, lebih mahal)
npx supabase secrets set CHAT_DAILY_LIMIT=30                     # pesan per user per hari (default 30)
npx supabase secrets set ALLOWED_ORIGIN="https://alamat-pwa-kamu.vercel.app"   # default: semua origin

npx supabase functions deploy chat      # TANPA --no-verify-jwt: hanya user yang login boleh memanggil
```

Cara kerjanya:
- Model default **`gemini-3.5-flash-lite`** (stabil, cepat, murah; bisa baca foto & PDF) dengan `thinkingLevel: "low"`. Ganti lewat secret `GEMINI_MODEL`. Kalau memakai model Gemini 2.5, hapus `thinkingConfig` di `callGemini()` karena 2.5 memakai `thinkingBudget`.
- Fungsi yang bisa dipanggil model: `list_reminders` (baca data user lewat RLS), `propose_reminder`, `propose_update`. **Model tidak bisa menulis atau menghapus data**; dua fungsi terakhir hanya membuat kartu usulan.
- Foto diperkecil di browser (sisi terpanjang 1600 px) sebelum dikirim. Foto/PDF **tidak disimpan** di Supabase; hanya dikirim ke Gemini untuk dibaca. Catatan: di paket gratis AI Studio, Google boleh memakai data untuk meningkatkan produknya. Untuk dokumen pribadi (KTP, SIM), pertimbangkan mengaktifkan billing (paket berbayar tidak dipakai untuk training).
- Riwayat obrolan disimpan di `sessionStorage` browser (hilang saat tab ditutup atau user keluar), dan hanya 20 pesan terakhir yang dikirim ulang (teks saja).
- Kuota harian per user (`chat_usage`) mencegah kuota/tagihan Gemini habis karena satu user.
- Mau pakai **Groq** (Llama) sebagai gantinya? Bisa untuk chat teks, tapi Groq belum bisa membaca PDF dan dukungan gambarnya terbatas, jadi fitur scan dokumen kurang andal. Itu alasan default-nya Gemini.

Uji langsung:
```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/chat"   -H "Authorization: Bearer <ACCESS_TOKEN_USER>" -H "Content-Type: application/json"   -d '{"history":[],"message":"apa yang paling dekat jatuh tempo?"}'
```
(`<ACCESS_TOKEN_USER>` bisa diambil dari `supabase.auth.getSession()` di console browser setelah login.)

### 5. Pasang jadwal harian
Buka `supabase/setup_cron.sql`, ganti `<PROJECT_REF>` dan `<CRON_SECRET_...>`, lalu jalankan di **SQL Editor** (cukup sekali).

### 5b. Pengaturan Auth di Supabase
Di *Authentication*:
- **URL Configuration → Site URL & Redirect URLs:** isi alamat PWA (dan `http://localhost:5173` untuk dev). Wajib supaya link konfirmasi & **reset password** kembali ke aplikasi.
- **Sign In / Providers → Email:** aktifkan *Confirm email*.
- **Password:** minimal 8 karakter (samakan dengan aplikasi), aktifkan *leaked password protection* kalau tersedia di paket kamu.
- Untuk produksi, pasang **SMTP sendiri** (mis. Resend) — SMTP bawaan Supabase dibatasi beberapa email per jam.

### 6. Isi config frontend
Edit `web/config.js`: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `VAPID_PUBLIC_KEY`.

### 7a. (Pilihan) Frontend versi Vue 3 + Vite — folder `web-vue/`
Pakai ini kalau mau versi Vue. Fiturnya sama dengan `web/`, backend tidak berubah.
```bash
cd web-vue
cp .env.example .env      # isi VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_VAPID_PUBLIC_KEY
npm install
npm run dev               # buka http://localhost:5173
npm run build             # hasil siap deploy di folder dist/
```
Deploy ke Vercel/Netlify: framework **Vite**, build command `npm run build`, output `dist`, lalu isi tiga variabel `VITE_...` di pengaturan Environment Variables. Langkah 6–7b di bawah khusus untuk versi `web/` (HTML biasa).

Struktur `web-vue/src/`:
- `App.vue`: cek login, pilih tampilan login atau beranda
- `components/HomeView.vue` (kerangka + navigasi), `DashboardScreen.vue` + `WalletStack.vue` (beranda & kartu geser), `CalendarScreen.vue` (kalender), `ListScreen.vue` (daftar per bulan), `ChatView.vue` (asisten), `ScanSheet.vue` (scan dokumen beranimasi), `TabBar.vue`, `NotifCenter.vue` (pusat notifikasi), `UiLayer.vue` (banner, alert, action sheet global), `ItemDialog.vue`, `SettingsDialog.vue`, `BottomSheet.vue`, `ProposalCard.vue`, `AppIcon.vue`, `AuthView.vue`
- `lib/categories.js` (kategori, warna & ikon otomatis dari nama), `lib/ui.js` (`showBanner`, `confirmDialog`, `actionSheet`)
- Animasi memakai [Motion for Vue](https://motion.dev/docs/vue) (`motion-v`); otomatis dikurangi kalau HP diset "kurangi gerakan". Arah desain dijelaskan di [DESIGN.md](DESIGN.md).
- `components/ItemDialog.vue` (tambah & ubah), `SettingsDialog.vue` (email, password, hapus akun), `UpdatePasswordView.vue` (reset password)
- `lib/supabase.js` (client), `lib/push.js` (logika web push), `lib/dates.js` (hitung tanggal & filter), `lib/errors.js` (pesan error bahasa Indonesia)

Perintah pengembangan:
```bash
npm test          # unit test (Vitest) untuk logika tanggal, filter, pesan error
npm run lint      # ESLint (+ aturan Vue)
npm run lint:fix  # rapikan otomatis
npm run check     # lint + test + build sekaligus (sama dengan CI)
```
Edge Function:
```bash
deno check supabase/functions/send-reminders/index.ts supabase/functions/chat/index.ts
deno test supabase/functions/chat/      # unit test validasi input & usulan
```

### 7b. Jalankan versi HTML biasa (`web/`)
Lokal (Android/desktop Chrome bisa tes di sini karena `localhost` dianggap aman):
```bash
npx serve web
```
Buka `http://localhost:3000`, daftar akun, tambah item, tekan **Aktifkan notifikasi**, lalu **Tes notifikasi**.

Untuk iPhone dan HP lain wajib **HTTPS**. Deploy folder `web/` ke Vercel, Netlify, atau GitHub Pages (semuanya gratis). Lalu di Supabase *Authentication → URL Configuration*, isi **Site URL** dengan alamat situsmu (supaya link konfirmasi email mengarah ke sana).

### 8. Pasang di iPhone
1. Buka situsnya di **Safari**.
2. Tekan **Bagikan → Tambahkan ke Layar Utama**.
3. Buka **Ingetin dari ikon di Layar Utama** (bukan dari Safari), login, tekan **Aktifkan notifikasi**.

---

## Menguji pengiriman tanpa menunggu besok

Buat item dengan jatuh tempo misalnya **14 Des 2026** dan pengingat H-7, lalu "pura-pura" hari ini 7 Des 2026:

```bash
curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders" \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Type: application/json" \
  -d '{"today":"2026-12-07"}'
```
Respons contoh: `{"today":"2026-12-07","due":1,"sent":1,"failed":0,"emailed":0,"removed":0}`. Notifikasi harusnya muncul di HP.

Karena sudah tercatat di `notification_log`, panggilan kedua dengan tanggal yang sama tidak mengirim ulang. Untuk mengulang tes:
```sql
delete from notification_log;
```

## Kalau notifikasi tidak muncul

| Gejala | Cek |
|---|---|
| `sent: 0`, `due: 0` | Tanggal `today` + H-x harus pas dengan jatuh tempo. Cek `select * from items;` |
| `due: 1`, `sent: 0` | Perangkat belum berlangganan. Cek `select * from push_subscriptions;` |
| `failed` > 0 | Lihat log di Dashboard → Edge Functions → send-reminders → Logs. Biasanya VAPID key frontend & server tidak sama. |
| Tombol aktifkan tidak muncul di iPhone | Harus dibuka dari ikon Layar Utama, iOS 16.4+. |
| Cron tidak jalan | `select * from cron.job_run_details order by start_time desc limit 10;` |
| Asisten: "belum dikonfigurasi (API key Gemini)" | `GEMINI_API_KEY` belum di-set atau salah; deploy ulang `chat` setelah set secret. |
| Asisten: "sedang sibuk" | Batas per menit kuota gratis Gemini tercapai (HTTP 429). Tunggu sebentar, atau aktifkan billing di AI Studio. |
| Asisten: "Kuota … habis" | Batas `CHAT_DAILY_LIMIT` per hari tercapai. Reset: `delete from chat_usage where day = current_date;` |
| Asisten: tidak bisa dihubungi | Function `chat` belum di-deploy, atau `ALLOWED_ORIGIN` tidak sama dengan alamat PWA. |
| Error di function soal library `web-push` | Ganti import ke versi lain atau library khusus Deno (mis. `jsr:@negrel/webpush`). |

## Ide lanjutan
- Pilihan jam notifikasi & zona waktu (WITA/WIT) per user.
- Upload foto dokumen (Supabase Storage + RLS per user).
- Kategori/ikon (STNK, SIM, Paspor, BPJS, PLN), tampilan kalender.
- Login Google (Supabase Auth → Providers).
- Bungkus `web-vue/` dengan **Capacitor** untuk APK Android.

## Catatan keamanan
- Semua tabel memakai **Row Level Security**: user hanya bisa membaca/mengubah datanya sendiri.
- `due_reminders` hanya bisa dipanggil `service_role` (server).
- Data user ditampilkan dengan `textContent`, bukan `innerHTML`, agar aman dari XSS.
- Yang boleh ada di frontend hanya anon/publishable key dan VAPID **public** key.
- `remind_days`, endpoint push, dan panjang kunci divalidasi di **database** (bukan cuma di form).
- Batas 500 item & 20 perangkat per user (trigger), mencegah database diisi spam lewat API.
- **Keluar** juga mematikan push di perangkat itu, jadi notifikasi akun lama tidak muncul ke orang lain yang memakai HP yang sama.
- Langganan push disimpan lewat RPC `save_push_subscription`, sehingga ganti akun di perangkat yang sama tetap jalan.
- `CRON_SECRET` dibandingkan secara constant-time; function hanya menerima `POST`.
- Asisten AI hanya membaca data lewat JWT user (RLS berlaku) dan tidak pernah menyimpan/mengubah data sendiri; semua perubahan butuh klik **Simpan** dari user. Input dari browser & dari model divalidasi ulang di server (`functions/chat/validate.ts`).
- `GEMINI_API_KEY` hanya ada di secret Edge Function, tidak pernah dikirim ke browser.
- Pesan "lupa password" sama untuk email terdaftar/tidak, supaya tidak bisa dipakai menebak email.

## Mengaktifkan tes otomatis di GitHub (opsional)
File CI disimpan di `ci/github-actions.yml` (belum aktif). Untuk mengaktifkan, pindahkan ke `.github/workflows/ci.yml` lalu push.
Token GitHub yang dipakai untuk push harus punya izin **`workflow`**, kalau tidak GitHub akan menolak push-nya.
