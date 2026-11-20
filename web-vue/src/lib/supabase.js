import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diisi. Salin .env.example jadi .env.");
}

// Dibaca SEBELUM client dibuat, karena client menghapus token dari URL setelah membacanya.
// true kalau halaman dibuka dari link "reset password" di email.
export const openedFromRecoveryLink = /type=recovery/.test(window.location.hash);

export const supabase = createClient(url, key);

/** Alamat aplikasi (tanpa query/hash), dipakai untuk link di email Supabase. */
export const appUrl = () => window.location.origin + window.location.pathname;

export const MIN_PASSWORD = 8;
