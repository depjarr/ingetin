// Isi dengan nilai dari project kamu.
// Supabase Dashboard → Project Settings → API (URL + anon/publishable key).
// Kunci anon/publishable AMAN dipasang di frontend karena dilindungi RLS.
// JANGAN pernah taruh service_role key atau VAPID private key di sini.

export const SUPABASE_URL = "https://<PROJECT_REF>.supabase.co";
export const SUPABASE_ANON_KEY = "<ANON_ATAU_PUBLISHABLE_KEY>";

// Hasil `npx web-push generate-vapid-keys` → bagian "Public Key"
export const VAPID_PUBLIC_KEY = "<VAPID_PUBLIC_KEY>";
