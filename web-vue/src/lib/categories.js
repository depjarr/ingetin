// Kategori otomatis dari nama pengingat → warna & ikon (gaya ikon Pengaturan iPhone).
// Tidak perlu kolom baru di database: cukup dibaca dari nama/catatan.

export const CATEGORIES = [
  { id: "kendaraan", label: "Kendaraan", color: "#007AFF", icon: "car", re: /stnk|bpkb|pajak (motor|mobil|kendaraan)|plat|kir\b|samsat|motor|mobil/i },
  { id: "identitas", label: "Identitas", color: "#5856D6", icon: "id", re: /\bsim\b|sim [abc]|ktp|paspor|passport|kk\b|kartu keluarga|visa|npwp|kitas/i },
  { id: "kesehatan", label: "Kesehatan", color: "#FF2D55", icon: "heart", re: /bpjs|kesehatan|asuransi kesehatan|dokter|obat|vaksin|klinik|rumah sakit/i },
  { id: "listrik", label: "Listrik & air", color: "#FF9500", icon: "bolt", re: /pln|listrik|token|pdam|air\b|gas\b/i },
  { id: "internet", label: "Internet & pulsa", color: "#30B0C7", icon: "wifi", re: /internet|wifi|indihome|biznet|first ?media|pulsa|kuota|telkomsel|xl\b|myrepublic|netflix|spotify|langganan/i },
  { id: "cicilan", label: "Cicilan & kartu", color: "#AF52DE", icon: "card", re: /cicilan|kredit|kartu kredit|paylater|kpr|angsuran|pinjaman|leasing/i },
  { id: "asuransi", label: "Asuransi", color: "#34C759", icon: "shield", re: /asuransi|polis|premi/i },
  { id: "rumah", label: "Rumah", color: "#A2845E", icon: "house", re: /sewa|kos|kontrakan|ipl|pbb|iuran|rt\b|rw\b|sampah/i },
];

const DEFAULT_DOKUMEN = { id: "dokumen", label: "Dokumen", color: "#007AFF", icon: "doc" };
const DEFAULT_TAGIHAN = { id: "tagihan", label: "Tagihan", color: "#FF9500", icon: "receipt" };

/** Kategori untuk satu item: cocokkan nama dulu, lalu catatan, lalu default per jenis. */
export function categorize(item) {
  const name = item?.name ?? "";
  const note = item?.note ?? "";
  const hit = CATEGORIES.find((c) => c.re.test(name)) ?? CATEGORIES.find((c) => c.re.test(note));
  if (hit) return { id: hit.id, label: hit.label, color: hit.color, icon: hit.icon };
  return item?.kind === "tagihan" ? DEFAULT_TAGIHAN : DEFAULT_DOKUMEN;
}

/** Warna lebih gelap untuk ujung gradien kartu. */
export function shade(hex, amount = -0.18) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + c * amount)));
  const r = f(n >> 16), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
