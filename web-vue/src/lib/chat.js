import { supabase } from "./supabase";
import { dbErrorText } from "./errors";

export const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1600; // foto HP diperkecil dulu: lebih cepat & lebih murah, tanggal tetap terbaca
const HISTORY_LIMIT = 20;

/** Ubah riwayat chat di layar jadi format yang dikirim ke server (teks saja). */
export function historyForApi(messages) {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      let text = m.text || "";
      if (m.attachmentName) text = `${text}\n[lampiran: ${m.attachmentName}]`.trim();
      if (m.proposals?.length) {
        const names = m.proposals.map((p) => (p.type === "create" ? p.item.name : p.item_name));
        const status = m.proposals.map((p) => `${p.status ?? "menunggu"}`);
        text = `${text}\n[usulan: ${names.map((n, i) => `${n} (${status[i]})`).join(", ")}]`.trim();
      }
      return { role: m.role, text };
    })
    .filter((m) => m.text)
    .slice(-HISTORY_LIMIT);
}

/** Baris yang disimpan ke tabel items dari sebuah usulan. */
export function proposalToRow(p) {
  if (p.type === "create") {
    const { kind, name, due_date, repeat, remind_days, amount, note } = p.item;
    return { kind, name, due_date, repeat, remind_days, amount: kind === "tagihan" ? amount : null, note };
  }
  return { ...p.changes };
}

export async function saveProposal(p) {
  const row = proposalToRow(p);
  const { error } = p.type === "create"
    ? await supabase.from("items").insert(row)
    : await supabase.from("items").update(row).eq("id", p.item_id);
  if (error) throw new Error(dbErrorText(error));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function shrinkImage(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

/** Siapkan file pilihan user untuk dikirim. Melempar Error dengan pesan yang bisa ditampilkan. */
export async function prepareAttachment(file) {
  if (!ACCEPT.split(",").includes(file.type)) {
    throw new Error("File harus berupa foto (JPG/PNG/WEBP/HEIC) atau PDF.");
  }
  let blob = file;
  let mediaType = file.type;
  if (file.type.startsWith("image/") && !file.type.includes("hei")) {
    blob = (await shrinkImage(file).catch(() => null)) ?? file;
    if (blob !== file) mediaType = "image/jpeg";
  }
  if (blob.size > MAX_FILE_BYTES) throw new Error("File terlalu besar (maks 5 MB).");
  return { media_type: mediaType, data: await blobToBase64(blob), name: file.name.slice(0, 100) };
}

/** Kirim pesan ke asisten. Mengembalikan { reply, proposals, remaining }. */
export async function sendChat({ history, message, attachment }) {
  const { data, error } = await supabase.functions.invoke("chat", {
    body: { history, message, attachment },
  });
  if (error) {
    // FunctionsHttpError membawa Response asli; ambil pesan error dari server kalau ada
    let msg = "Asisten tidak bisa dihubungi. Periksa koneksi lalu coba lagi.";
    try {
      const body = await error.context?.json?.();
      if (body?.error) msg = body.error;
    } catch { /* pakai pesan default */ }
    throw new Error(msg);
  }
  return data;
}

// --- Simpan riwayat di sessionStorage (hilang saat tab ditutup; tidak dikirim ke mana-mana) ---
const storageKey = (userId) => `ingetin-chat-${userId}`;

export function loadHistory(userId) {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(userId)) || "[]");
  } catch {
    return [];
  }
}

export function storeHistory(userId, messages) {
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify(messages.slice(-40)));
  } catch { /* storage penuh / diblokir: abaikan */ }
}

export function clearHistory(userId) {
  try {
    sessionStorage.removeItem(storageKey(userId));
  } catch { /* abaikan */ }
}
