// Terjemahkan pesan error Supabase yang umum ke bahasa Indonesia.
const AUTH_MESSAGES = [
  [/invalid login credentials/i, "Email atau password salah."],
  [/email not confirmed/i, "Email belum dikonfirmasi. Cek kotak masuk kamu."],
  [/user already registered/i, "Email ini sudah terdaftar. Silakan masuk."],
  [/password should be at least/i, "Password terlalu pendek."],
  [/new password should be different/i, "Password baru harus berbeda dari yang lama."],
  [/rate limit|too many requests|security purposes/i, "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi."],
  [/weak password|pwned|leaked/i, "Password terlalu lemah atau pernah bocor. Pakai password lain."],
  [/network|fetch/i, "Tidak ada koneksi. Periksa internet kamu."],
];

export function authErrorText(err) {
  const raw = err?.message || String(err);
  const hit = AUTH_MESSAGES.find(([re]) => re.test(raw));
  return hit ? hit[1] : raw;
}

export function dbErrorText(err) {
  const raw = err?.message || String(err);
  if (/batas maksimal/i.test(raw)) return raw;
  if (/items_remind_days_valid/i.test(raw)) return "Pilihan waktu pengingat tidak valid.";
  if (/network|fetch/i.test(raw)) return "Tidak ada koneksi. Periksa internet kamu.";
  return raw;
}
