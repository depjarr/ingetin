# Ingetin — arah desain "iPhone"

Pengguna utama: orang dewasa di Indonesia yang **bukan orang IT**, kebanyakan membuka dari HP.
Tujuan desain: terasa seperti aplikasi bawaan iPhone (Kalender, Wallet, Pengaturan), jadi orang langsung paham cara pakainya.

## Prinsip

1. **Bahasa sehari-hari.** "1 minggu sebelum", bukan "H-7". "Foto dokumen", bukan "upload attachment". Tombol menyebut hasilnya: "Ya, pindahkan", "Hapus".
2. **Warna punya arti.** Setiap kategori punya warna & ikon tetap (lihat tabel). Merah = sudah lewat / ≤7 hari, oranye = ≤30 hari, abu = masih lama.
3. **Pola iPhone yang sudah dikenal:** large title, daftar grouped inset, ikon kotak berwarna, action sheet dari bawah, alert di tengah, banner notifikasi dari atas, tab bar berlabel.
4. **Gerak hanya untuk menjawab aksi:** banner turun & bisa digeser ke atas, kartu bisa digeser, sheet naik, alert membesar. Kartu beranda berganti otomatis tiap 5 detik (berhenti kalau user menyentuh atau mengaktifkan "kurangi gerakan").
5. **Target sentuh ≥ 44 px**, teks dasar 17 px (ukuran iOS), tidak ada informasi yang hanya dibedakan warna (selalu ada teks "Lewat 2 hari").

## Warna (iOS system colors, mode terang)

| Token | Hex | Peran |
|---|---|---|
| bg | `#F2F2F7` | latar grouped |
| cell | `#FFFFFF` | baris & kartu |
| label / label2 | `#000` / `rgba(60,60,67,.6)` | teks utama / sekunder |
| blue | `#007AFF` | aksi utama, tab aktif, tombol + |
| red / orange / green | `#FF3B30` / `#FF9500` / `#34C759` | lewat & mendesak / segera / berhasil |

## Kategori otomatis (`src/lib/categories.js`)

Ditebak dari nama pengingat, tanpa kolom database baru.

| Kategori | Warna | Contoh kata |
|---|---|---|
| Kendaraan | `#007AFF` | STNK, BPKB, pajak motor, samsat |
| Identitas | `#5856D6` | SIM, KTP, paspor, NPWP |
| Kesehatan | `#FF2D55` | BPJS, vaksin, klinik |
| Listrik & air | `#FF9500` | PLN, token, PDAM |
| Internet & pulsa | `#30B0C7` | IndiHome, wifi, pulsa, Netflix |
| Cicilan & kartu | `#AF52DE` | cicilan, kartu kredit, KPR, paylater |
| Asuransi | `#34C759` | asuransi, polis, premi |
| Rumah | `#A2845E` | sewa, kos, IPL, PBB |

## Huruf

Font sistem (SF Pro di iPhone/Mac), Inter sebagai cadangan di Android/Windows.
Skala iOS: large title 34 bold · title 22–28 bold · body 17 · subhead 15 · footnote 13 · caption 11.

## Layar

- **Beranda:** tanggal + sapaan (large title), tumpukan kartu gaya Wallet (geser kiri/kanan, titik penanda di bawah),
  dua tombol cepat (Foto dokumen, Tanya asisten), ringkasan, daftar 30 hari ke depan.
- **Kalender:** grid bulan mulai Senin, hari ini merah, tanggal terpilih lingkaran hitam, titik warna kategori
  (titik berongga = perkiraan dari tagihan berulang). Geser untuk pindah bulan. Di bawahnya jadwal tanggal terpilih.
  Di layar lebar, titik berubah jadi label nama (seperti kalender desktop).
- **Daftar:** large title, pencarian, segmented control, dikelompokkan per bulan. Ketuk baris → 3 tombol besar berlabel.
- **Asisten:** obrolan gaya iMessage.
- **Tombol + (tengah):** action sheet: Foto dokumen / Isi sendiri / Ceritakan ke asisten.
- **Lonceng:** pusat notifikasi turun dari atas, kartu-kartu notifikasi, status notifikasi HP.
- **Saat aplikasi dibuka:** satu banner untuk yang paling mendesak (≤3 hari / sudah lewat), sekali per sesi.

## Catatan

Notifikasi yang dikirim server ke HP (jam 08.00) tetap memakai tampilan bawaan HP — itu diatur sistem operasi,
bukan oleh aplikasi. Banner di dalam aplikasi meniru tampilannya supaya terasa konsisten.
