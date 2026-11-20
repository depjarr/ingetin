// Notifikasi yang sudah dihapus user (disimpan di browser ini).
// Kunci memakai id + tanggal jatuh tempo: kalau pengingat diperpanjang ke tanggal baru, notifikasinya muncul lagi.
import { ref } from "vue";

const KEY = "ingetin-dismissed-notifs";
const MAX = 300; // batasi supaya tidak menumpuk selamanya

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export const dismissed = ref(new Set(read()));

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify([...dismissed.value].slice(-MAX)));
  } catch { /* mode privat / penyimpanan penuh: abaikan */ }
}

export const noteKey = (item) => `${item.id}:${item.due_date}`;

export const isDismissed = (key) => dismissed.value.has(key);

export function dismiss(...keys) {
  const next = new Set(dismissed.value);
  for (const k of keys) next.add(k);
  dismissed.value = next;
  write();
}
