const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

const pad = (n) => String(n).padStart(2, "0");
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const todayISO = () => toISO(new Date());
export const daysUntil = (iso) => Math.round((parseISO(iso) - parseISO(todayISO())) / 86400000);
export const formatDate = (iso) => { const d = parseISO(iso); return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`; };
export const formatRupiah = (n) => "Rp " + Number(n).toLocaleString("id-ID");

// Tambah bulan tanpa "loncat" (31 Jan + 1 bulan = 28/29 Feb)
export function addMonths(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const lastDay = new Date(y, m - 1 + months + 1, 0).getDate();
  return toISO(new Date(y, m - 1 + months, Math.min(d, lastDay)));
}

export const REPEAT_MONTHS = { monthly: 1, yearly: 12, "5yearly": 60 };
export const REPEAT_LABEL = { none: "Sekali", monthly: "Bulanan", yearly: "Tahunan", "5yearly": "5 tahunan" };

export function nextDueDate(item) {
  const step = REPEAT_MONTHS[item.repeat];
  let next = addMonths(item.due_date, step);
  while (daysUntil(next) < 0) next = addMonths(next, step);
  return next;
}

export function badgeFor(days) {
  if (days < 0) return { text: `Terlewat ${-days} hari`, cls: "red" };
  if (days === 0) return { text: "Hari ini", cls: "red" };
  if (days <= 7) return { text: `${days} hari lagi`, cls: "red" };
  if (days <= 30) return { text: `${days} hari lagi`, cls: "orange" };
  return { text: `${days} hari lagi`, cls: "green" };
}

// Pilihan waktu pengingat. Negatif = sesudah jatuh tempo (diingatkan lagi kalau belum diurus).
export const REMIND_OPTIONS = [
  { value: 30, label: "H-30" },
  { value: 14, label: "H-14" },
  { value: 7, label: "H-7" },
  { value: 3, label: "H-3" },
  { value: 1, label: "H-1" },
  { value: 0, label: "Hari H" },
  { value: -1, label: "H+1" },
  { value: -3, label: "H+3" },
];

export const remindLabel = (days) =>
  days === 0 ? "Hari H" : days > 0 ? `H-${days}` : `H+${-days}`;

/** Filter daftar item. status: "all" | "soon" (≤30 hari) | "overdue" */
export function filterItems(items, { query = "", kind = "all", status = "all" } = {}) {
  const q = query.trim().toLowerCase();
  return items.filter((i) => {
    if (kind !== "all" && i.kind !== kind) return false;
    if (q && !`${i.name} ${i.note ?? ""}`.toLowerCase().includes(q)) return false;
    const d = daysUntil(i.due_date);
    if (status === "overdue" && d >= 0) return false;
    if (status === "soon" && (d < 0 || d > 30)) return false;
    return true;
  });
}

const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** "Kamis, 20 November" */
export function longToday(now = new Date()) {
  return `${HARI[now.getDay()]}, ${now.getDate()} ${BULAN_PANJANG[now.getMonth()]}`;
}

export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 19) return "Selamat sore";
  return "Selamat malam";
}

/** Kelompokkan item (sudah urut tanggal) per bulan: [{ key, label, items }]. Yang sudah lewat jadi grup sendiri di atas. */
export function groupByMonth(items) {
  const groups = [];
  const overdue = items.filter((i) => daysUntil(i.due_date) < 0);
  if (overdue.length) groups.push({ key: "overdue", label: "Sudah lewat", items: overdue });
  for (const i of items) {
    if (daysUntil(i.due_date) < 0) continue;
    const key = i.due_date.slice(0, 7);
    let g = groups.find((x) => x.key === key);
    if (!g) {
      const d = parseISO(i.due_date);
      g = { key, label: `${BULAN_PANJANG[d.getMonth()]} ${d.getFullYear()}`, items: [] };
      groups.push(g);
    }
    g.items.push(i);
  }
  return groups;
}

/** Ringkasan untuk beranda. */
export function summarize(items, days = 30) {
  const upcoming = items
    .map((i) => ({ ...i, days: daysUntil(i.due_date) }))
    .filter((i) => i.days >= 0)
    .sort((a, b) => a.days - b.days);

  // dots[d] = jumlah item yang jatuh tempo d hari lagi (0 = hari ini)
  const dots = Array.from({ length: days }, () => 0);
  for (const i of upcoming) if (i.days < days) dots[i.days]++;

  const ym = todayISO().slice(0, 7);
  const bills = items.filter((i) => i.kind === "tagihan" && i.due_date.slice(0, 7) === ym);

  return {
    next: upcoming.slice(0, 3),
    soonCount: dots.reduce((a, b) => a + b, 0),
    weekCount: upcoming.filter((i) => i.days <= 7).length,
    dots,
    billsCount: bills.length,
    billsTotal: bills.reduce((a, b) => a + (b.amount ?? 0), 0),
    overdueCount: items.filter((i) => daysUntil(i.due_date) < 0).length,
  };
}

/** Teks hitung mundur: { value, unit } untuk angka besar. */
export function countdown(days) {
  if (days < 0) return { value: String(-days), unit: "hari terlewat" };
  if (days === 0) return { value: "Hari ini", unit: "" };
  if (days === 1) return { value: "Besok", unit: "" };
  return { value: String(days), unit: "hari lagi" };
}

export const urgency = (days) => (days < 0 || days <= 7 ? "hot" : days <= 30 ? "warm" : "calm");

/** Teks pendek untuk pill: "Hari ini", "Besok", "12 hari", "Lewat 3 hari". */
export function shortCountdown(days) {
  if (days < 0) return `Lewat ${-days} hari`;
  if (days === 0) return "Hari ini";
  if (days === 1) return "Besok";
  return `${days} hari`;
}

/** Rupiah ringkas untuk angka besar di kartu: "Rp 697 rb", "Rp 1,2 jt". */
export function formatRupiahShort(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jt`;
  if (v >= 1_000) return `Rp ${Math.round(v / 1_000).toLocaleString("id-ID")} rb`;
  return `Rp ${v}`;
}

// ---------- Kalender ----------

export const HARI_PENDEK = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]; // minggu mulai Senin

/** Grid bulan (6 baris × 7 hari, mulai Senin). Setiap sel: { iso, day, inMonth, isToday }. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Senin = 0
  const start = new Date(year, month, 1 - offset);
  const today = todayISO();
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = toISO(d);
    return { iso, day: d.getDate(), inMonth: d.getMonth() === month, isToday: iso === today };
  });
}

export const monthTitle = (year, month) => `${BULAN_PANJANG[month]} ${year}`;

/**
 * Semua tanggal jatuh tempo item di rentang [from, to] (ISO, inklusif).
 * Item berulang diproyeksikan ke depan dari due_date-nya: { iso, projected }.
 * projected = true untuk tanggal perkiraan (belum jadi due_date sebenarnya).
 */
export function occurrences(item, from, to) {
  const out = [];
  if (item.due_date >= from && item.due_date <= to) out.push({ iso: item.due_date, projected: false });
  const step = REPEAT_MONTHS[item.repeat];
  if (!step) return out;
  let n = 1;
  let next = addMonths(item.due_date, step);
  while (next <= to && n < 400) {
    if (next >= from) out.push({ iso: next, projected: true });
    n++;
    next = addMonths(item.due_date, step * n);
  }
  return out;
}

/** Peta iso → daftar { item, projected } untuk rentang tanggal. */
export function eventsByDay(items, from, to) {
  const map = {};
  for (const item of items) {
    for (const o of occurrences(item, from, to)) (map[o.iso] ??= []).push({ item, projected: o.projected });
  }
  return map;
}

/** "Rabu, 25 November 2026" */
export function longDate(iso) {
  const d = parseISO(iso);
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN_PANJANG[d.getMonth()]} ${d.getFullYear()}`;
}

/** Kalimat pengingat untuk orang awam: 30 → "1 bulan sebelum", 0 → "di hari H", -1 → "1 hari sesudah". */
export function friendlyRemind(days) {
  if (days === 0) return "di hari H";
  const n = Math.abs(days);
  const when = days > 0 ? "sebelum" : "sesudah";
  if (n === 30) return `1 bulan ${when}`;
  if (n % 7 === 0) return `${n / 7} minggu ${when}`;
  return `${n} hari ${when}`;
}
