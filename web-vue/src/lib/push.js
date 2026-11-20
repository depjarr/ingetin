import { supabase } from "./supabase";

const SW_URL = `${import.meta.env.BASE_URL}sw.js`;

export const swReady = "serviceWorker" in navigator
  ? navigator.serviceWorker.register(SW_URL).then(() => navigator.serviceWorker.ready)
  : Promise.resolve(null);

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

export const pushSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** "unsupported" | "install-ios" | "denied" | "on" | "off" */
export async function getPushState() {
  if (!pushSupported()) return isIOS() && !isStandalone() ? "install-ios" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await swReady;
  return (await reg.pushManager.getSubscription()) ? "on" : "off";
}

// Harus dipanggil dari klik tombol (syarat iOS)
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return;

  const reg = await swReady;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
  });
  const { endpoint, keys } = sub.toJSON();

  // Lewat RPC (bukan upsert biasa) supaya tetap jalan kalau perangkat ini dulu dipakai akun lain
  const { error } = await supabase.rpc("save_push_subscription", {
    p_endpoint: endpoint,
    p_p256dh: keys.p256dh,
    p_auth: keys.auth,
    p_user_agent: navigator.userAgent.slice(0, 300),
  });
  if (error) throw error;
}

export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await swReady;
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
  if (error) throw error;
}

/** Keluar: matikan push di perangkat ini dulu, supaya notifikasi akun ini tidak muncul ke orang lain. */
export async function signOutSafely() {
  try {
    await disablePush();
  } catch (err) {
    console.warn("Gagal mematikan push saat keluar:", err);
  }
  await supabase.auth.signOut();
}

export async function testNotification() {
  const reg = await swReady;
  await reg.showNotification("Ingetin", {
    body: "Notifikasi berhasil! Begini tampilannya nanti.",
    icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
  });
}
