// Validasi input dari browser dan dari tool call model.
// Dipisah dari index.ts supaya bisa dites: `deno test supabase/functions/chat/`

export const KINDS = ["dokumen", "tagihan"] as const;
export const REPEATS = ["none", "monthly", "yearly", "5yearly"] as const;
export const ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"] as const;

export const MAX_HISTORY = 20; // jumlah pesan terakhir yang dikirim ke model
export const MAX_TEXT = 2000; // karakter per pesan
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // setelah di-decode

export type Kind = (typeof KINDS)[number];
export type Repeat = (typeof REPEATS)[number];
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

export type ChatTurn = { role: "user" | "assistant"; text: string };
export type Attachment = { media_type: AttachmentType; data: string; name: string };
export type ChatRequest = { history: ChatTurn[]; message: string; attachment: Attachment | null };

export type ItemDraft = {
  kind: Kind;
  name: string;
  due_date: string;
  repeat: Repeat;
  remind_days: number[];
  amount: number | null;
  note: string | null;
};
export type ItemChanges = Partial<ItemDraft>;

export class ValidationError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function isIsoDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y >= 2000 && y <= 2100;
}

/** Validasi body request dari browser. Melempar ValidationError kalau tidak sah. */
export function parseChatRequest(body: unknown): ChatRequest {
  if (!isObj(body)) throw new ValidationError("Body harus berupa objek JSON");

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length > MAX_TEXT) throw new ValidationError(`Pesan maksimal ${MAX_TEXT} karakter`);

  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history: ChatTurn[] = [];
  for (const t of rawHistory.slice(-MAX_HISTORY)) {
    if (!isObj(t) || (t.role !== "user" && t.role !== "assistant") || typeof t.text !== "string") continue;
    const text = t.text.trim().slice(0, MAX_TEXT);
    if (text) history.push({ role: t.role, text });
  }
  // Riwayat untuk API harus dimulai dari pesan user
  while (history.length && history[0].role !== "user") history.shift();

  let attachment: Attachment | null = null;
  if (body.attachment != null) {
    const a = body.attachment;
    if (!isObj(a)) throw new ValidationError("Lampiran tidak valid");
    if (!ATTACHMENT_TYPES.includes(a.media_type as AttachmentType)) {
      throw new ValidationError("Jenis file harus JPG, PNG, WEBP, HEIC, atau PDF");
    }
    if (typeof a.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(a.data)) {
      throw new ValidationError("Isi lampiran harus base64");
    }
    if (Math.floor((a.data.length * 3) / 4) > MAX_ATTACHMENT_BYTES) {
      throw new ValidationError("Lampiran maksimal 5 MB");
    }
    attachment = {
      media_type: a.media_type as AttachmentType,
      data: a.data,
      name: typeof a.name === "string" ? a.name.slice(0, 100) : "lampiran",
    };
  }

  if (!message && !attachment) throw new ValidationError("Pesan kosong");
  return { history, message, attachment };
}

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function cleanRemindDays(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const days = [...new Set(v.filter((x) => Number.isInteger(x) && x >= -30 && x <= 365) as number[])];
  if (days.length === 0) return null;
  return days.sort((a, b) => b - a).slice(0, 10);
}

function cleanAmount(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return Math.round(v);
}

/** Validasi usulan pengingat baru dari model. Melempar ValidationError dengan pesan yang bisa dibaca model. */
export function validateDraft(input: unknown): ItemDraft {
  if (!isObj(input)) throw new ValidationError("Input harus objek");
  if (!KINDS.includes(input.kind as Kind)) throw new ValidationError("kind harus 'dokumen' atau 'tagihan'");
  const name = cleanText(input.name, 100);
  if (!name) throw new ValidationError("name wajib diisi");
  if (!isIsoDate(input.due_date)) throw new ValidationError("due_date harus tanggal valid format YYYY-MM-DD");
  const repeat = REPEATS.includes(input.repeat as Repeat) ? (input.repeat as Repeat) : "none";
  const remind_days = cleanRemindDays(input.remind_days) ?? [30, 7, 1];
  const kind = input.kind as Kind;

  return {
    kind,
    name,
    due_date: input.due_date,
    repeat,
    remind_days,
    amount: kind === "tagihan" ? cleanAmount(input.amount) : null,
    note: cleanText(input.note, 500),
  };
}

/** Validasi perubahan untuk item yang sudah ada. Field null/absen = tidak diubah. */
export function validateChanges(input: unknown): ItemChanges {
  if (!isObj(input)) throw new ValidationError("changes harus objek");
  const out: ItemChanges = {};
  if (input.kind != null) {
    if (!KINDS.includes(input.kind as Kind)) throw new ValidationError("kind tidak valid");
    out.kind = input.kind as Kind;
  }
  if (input.name != null) {
    const name = cleanText(input.name, 100);
    if (!name) throw new ValidationError("name tidak boleh kosong");
    out.name = name;
  }
  if (input.due_date != null) {
    if (!isIsoDate(input.due_date)) throw new ValidationError("due_date harus format YYYY-MM-DD");
    out.due_date = input.due_date;
  }
  if (input.repeat != null) {
    if (!REPEATS.includes(input.repeat as Repeat)) throw new ValidationError("repeat tidak valid");
    out.repeat = input.repeat as Repeat;
  }
  if (input.remind_days != null) {
    const days = cleanRemindDays(input.remind_days);
    if (!days) throw new ValidationError("remind_days harus berisi angka -30..365");
    out.remind_days = days;
  }
  if (input.amount != null) {
    const amount = cleanAmount(input.amount);
    if (amount == null) throw new ValidationError("amount harus angka >= 0");
    out.amount = amount;
  }
  if (input.note != null) out.note = cleanText(input.note, 500);
  if (Object.keys(out).length === 0) throw new ValidationError("Tidak ada perubahan");
  return out;
}

/** Selisih hari antara dua tanggal ISO (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}
