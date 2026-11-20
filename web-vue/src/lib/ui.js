// Komponen UI global gaya iPhone: banner notifikasi dari atas, alert di tengah, action sheet dari bawah.
// Dipanggil dari mana saja: showBanner({...}), await confirmDialog({...}), await actionSheet({...}).
import { reactive } from "vue";

export const ui = reactive({
  banners: [], // { id, title, body, icon, color, onTap }
  alert: null, // { title, message, confirmText, cancelText, destructive, resolve }
  sheet: null, // { title, message, actions: [{ label, icon, value, destructive }], resolve }
});

let seq = 0;
const timers = new Map();

/** Banner notifikasi gaya iPhone yang turun dari atas. Mengembalikan id. */
export function showBanner({ title, body = "", icon = "bell", color = "#007AFF", onTap = null, duration = 5000 }) {
  const id = ++seq;
  ui.banners.unshift({ id, title, body, icon, color, onTap });
  if (ui.banners.length > 3) dismissBanner(ui.banners[ui.banners.length - 1].id);
  if (duration) timers.set(id, setTimeout(() => dismissBanner(id), duration));
  return id;
}

export function dismissBanner(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  const i = ui.banners.findIndex((b) => b.id === id);
  if (i !== -1) ui.banners.splice(i, 1);
}

/** Tahan banner selama disentuh/digeser, supaya tidak hilang di tengah jalan. */
export function holdBanner(id) {
  clearTimeout(timers.get(id));
  timers.delete(id);
}

/** Alert konfirmasi di tengah layar. Resolve true kalau user menekan tombol konfirmasi. */
export function confirmDialog({ title, message = "", confirmText = "OK", cancelText = "Batal", destructive = false }) {
  ui.alert?.resolve(false);
  return new Promise((resolve) => {
    ui.alert = { title, message, confirmText, cancelText, destructive, resolve };
  });
}

/** Alert informasi dengan satu tombol. */
export function alertDialog({ title, message = "", confirmText = "OK" }) {
  return confirmDialog({ title, message, confirmText, cancelText: null });
}

export function closeAlert(result) {
  const a = ui.alert;
  ui.alert = null;
  a?.resolve(result);
}

/** Action sheet dari bawah. Resolve dengan value aksi yang dipilih, atau null kalau batal. */
export function actionSheet({ title = "", message = "", actions }) {
  ui.sheet?.resolve(null);
  return new Promise((resolve) => {
    ui.sheet = { title, message, actions, resolve };
  });
}

export function closeSheet(value) {
  const s = ui.sheet;
  ui.sheet = null;
  s?.resolve(value);
}
