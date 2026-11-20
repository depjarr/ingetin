import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY, VAPID_PUBLIC_KEY } from "./config.js";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (sel) => document.querySelector(sel);

// Service worker didaftarkan sedini mungkin
const swReady = "serviceWorker" in navigator
  ? navigator.serviceWorker.register("./sw.js").then(() => navigator.serviceWorker.ready)
  : Promise.resolve(null);

let currentUser = null;

/* ---------------- Util ---------------- */

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function setMsg(el, text, isError = false) {
  el.textContent = text;
  el.classList.toggle("error", isError);
}

function pad(n) { return String(n).padStart(2, "0"); }
function toISO(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function todayISO() { return toISO(new Date()); }
function daysUntil(iso) { return Math.round((parseISO(iso) - parseISO(todayISO())) / 86400000); }
function formatDate(iso) { const d = parseISO(iso); return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`; }
function formatRupiah(n) { return "Rp " + Number(n).toLocaleString("id-ID"); }

// Tambah bulan tanpa "loncat" (31 Jan + 1 bulan = 28/29 Feb)
function addMonths(iso, months) {
  const [y, m, d] = iso.split("-").map(Number);
  const lastDay = new Date(y, m - 1 + months + 1, 0).getDate();
  return toISO(new Date(y, m - 1 + months, Math.min(d, lastDay)));
}

const REPEAT_MONTHS = { monthly: 1, yearly: 12, "5yearly": 60 };
const REPEAT_LABEL = { none: "Sekali", monthly: "Bulanan", yearly: "Tahunan", "5yearly": "5 tahunan" };

function nextDueDate(item) {
  const step = REPEAT_MONTHS[item.repeat];
  let next = addMonths(item.due_date, step);
  while (daysUntil(next) < 0) next = addMonths(next, step); // kalau sudah lama terlewat
  return next;
}

function badgeFor(days) {
  if (days < 0) return { text: `Terlewat ${-days} hari`, cls: "red" };
  if (days === 0) return { text: "Hari ini", cls: "red" };
  if (days <= 7) return { text: `${days} hari lagi`, cls: "red" };
  if (days <= 30) return { text: `${days} hari lagi`, cls: "orange" };
  return { text: `${days} hari lagi`, cls: "green" };
}

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

/* ---------------- Auth ---------------- */

sb.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user ?? null;
  $("#auth-view").hidden = !!currentUser;
  $("#app-view").hidden = !currentUser;
  if (currentUser) {
    loadItems();
    updateNotifUI();
  }
});

$("#auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#auth-msg");
  const email = $("#email").value.trim();
  const password = $("#password").value;
  const mode = e.submitter?.value === "signup" ? "signup" : "login";

  setMsg(msg, "Memproses…");
  const { data, error } = mode === "signup"
    ? await sb.auth.signUp({ email, password })
    : await sb.auth.signInWithPassword({ email, password });

  if (error) return setMsg(msg, error.message, true);
  if (mode === "signup" && !data.session) {
    setMsg(msg, "Akun dibuat. Cek email kamu untuk konfirmasi, lalu masuk.");
  } else {
    setMsg(msg, "");
  }
});

$("#btn-logout").addEventListener("click", () => sb.auth.signOut());

/* ---------------- Daftar item ---------------- */

async function loadItems() {
  const msg = $("#list-msg");
  setMsg(msg, "Memuat…");
  const { data, error } = await sb.from("items").select("*").order("due_date");
  if (error) return setMsg(msg, "Gagal memuat: " + error.message, true);

  const list = $("#items");
  list.replaceChildren();
  setMsg(msg, data.length ? "" : "Belum ada pengingat. Tekan “+ Tambah” untuk mulai.");

  for (const item of data) list.append(renderItem(item));
}

function renderItem(item) {
  const days = daysUntil(item.due_date);
  const badge = badgeFor(days);

  const subParts = [
    item.kind === "tagihan" ? "Tagihan" : "Dokumen",
    formatDate(item.due_date),
    REPEAT_LABEL[item.repeat],
  ];
  if (item.amount != null) subParts.push(formatRupiah(item.amount));

  const doneLabel = item.repeat === "none" ? "Selesai" : "Sudah diperpanjang";
  const btnDone = el("button", { className: "btn small", textContent: doneLabel });
  const btnDel = el("button", { className: "btn small danger", textContent: "Hapus" });

  btnDone.addEventListener("click", () => markDone(item, btnDone));
  btnDel.addEventListener("click", () => deleteItem(item, btnDel));

  // textContent (bukan innerHTML) supaya input user tidak bisa menyisipkan HTML
  return el("li", { className: "item" }, [
    el("div", { className: "item-top" }, [
      el("div", {}, [
        el("div", { className: "item-name", textContent: item.name }),
        el("div", { className: "item-sub", textContent: subParts.join(" · ") }),
      ]),
      el("span", { className: `badge ${badge.cls}`, textContent: badge.text }),
    ]),
    item.note ? el("p", { className: "item-note", textContent: item.note }) : null,
    el("div", { className: "row" }, [btnDone, btnDel]),
  ]);
}

async function markDone(item, btn) {
  if (item.repeat === "none") return deleteItem(item, btn);
  const next = nextDueDate(item);
  if (!confirm(`Geser jatuh tempo “${item.name}” ke ${formatDate(next)}?`)) return;
  btn.disabled = true;
  const { error } = await sb.from("items").update({ due_date: next }).eq("id", item.id);
  if (error) { btn.disabled = false; return alert("Gagal menyimpan: " + error.message); }
  loadItems();
}

async function deleteItem(item, btn) {
  if (!confirm(`Hapus “${item.name}”? Tindakan ini tidak bisa dibatalkan.`)) return;
  btn.disabled = true;
  const { error } = await sb.from("items").delete().eq("id", item.id);
  if (error) { btn.disabled = false; return alert("Gagal menghapus: " + error.message); }
  loadItems();
}

/* ---------------- Form tambah ---------------- */

const dialog = $("#add-dialog");
const form = $("#add-form");

$("#btn-add").addEventListener("click", () => {
  form.reset();
  setMsg($("#add-msg"), "");
  syncKind();
  dialog.showModal();
});
$("#btn-cancel").addEventListener("click", () => dialog.close());

function syncKind() {
  const isBill = form.kind.value === "tagihan";
  $("#amount-wrap").hidden = !isBill;
  $("#f-date-label").textContent = isBill ? "Tanggal jatuh tempo" : "Berlaku sampai";
  $("#f-name").placeholder = isBill ? "Contoh: Listrik PLN" : "Contoh: STNK Motor";
  form.repeat.value = isBill ? "monthly" : "yearly";
}
form.querySelectorAll('input[name="kind"]').forEach((r) => r.addEventListener("change", syncKind));

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("#add-msg");
  const fd = new FormData(form);
  const kind = fd.get("kind");
  const amountRaw = fd.get("amount");

  const row = {
    kind,
    name: String(fd.get("name")).trim(),
    due_date: fd.get("due_date"),
    repeat: fd.get("repeat"),
    remind_days: fd.getAll("remind").map(Number),
    note: String(fd.get("note") || "").trim() || null,
    amount: kind === "tagihan" && amountRaw !== "" ? Number(amountRaw) : null,
  };

  if (!row.name || !row.due_date) return setMsg(msg, "Nama dan tanggal wajib diisi.", true);
  if (row.remind_days.length === 0) return setMsg(msg, "Pilih minimal satu waktu pengingat.", true);

  const submitBtn = e.submitter;
  if (submitBtn) submitBtn.disabled = true;
  setMsg(msg, "Menyimpan…");
  const { error } = await sb.from("items").insert(row);
  if (submitBtn) submitBtn.disabled = false;

  if (error) return setMsg(msg, "Gagal menyimpan: " + error.message, true);
  dialog.close();
  loadItems();
});

/* ---------------- Notifikasi push ---------------- */

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function showNotifState({ text, enable = false, test = false, disable = false }) {
  $("#notif-text").textContent = text;
  $("#btn-enable").hidden = !enable;
  $("#btn-test").hidden = !test;
  $("#btn-disable").hidden = !disable;
}

async function updateNotifUI() {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

  if (!supported) {
    if (isIOS() && !isStandalone()) {
      return showNotifState({
        text: "Di iPhone: tekan tombol Bagikan di Safari → “Tambahkan ke Layar Utama”, lalu buka Ingetin dari ikon di layar utama untuk mengaktifkan notifikasi.",
      });
    }
    return showNotifState({ text: "Browser ini belum mendukung notifikasi push." });
  }

  if (Notification.permission === "denied") {
    return showNotifState({ text: "Notifikasi diblokir. Izinkan lewat pengaturan browser/HP, lalu muat ulang halaman ini." });
  }

  const reg = await swReady;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    showNotifState({ text: "Notifikasi aktif di perangkat ini. Pengingat dikirim jam 08.00 WIB.", test: true, disable: true });
  } else {
    showNotifState({ text: "Aktifkan notifikasi supaya kamu diingatkan sebelum jatuh tempo.", enable: true });
  }
}

$("#btn-enable").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    // Harus dipicu oleh tombol (syarat iOS)
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return updateNotifUI();

    const reg = await swReady;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    const { endpoint, keys } = sub.toJSON();

    const { error } = await sb.from("push_subscriptions").upsert({
      user_id: currentUser.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: navigator.userAgent.slice(0, 300),
    }, { onConflict: "endpoint" });
    if (error) throw error;
  } catch (err) {
    alert("Gagal mengaktifkan notifikasi: " + (err.message || err));
  } finally {
    btn.disabled = false;
    updateNotifUI();
  }
});

$("#btn-test").addEventListener("click", async () => {
  // Tes lokal: memastikan izin & tampilan notifikasi beres (tidak lewat server)
  const reg = await swReady;
  reg.showNotification("Ingetin", { body: "Notifikasi berhasil! Begini tampilannya nanti.", icon: "./icons/icon-192.png" });
});

$("#btn-disable").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const reg = await swReady;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
      await sub.unsubscribe();
    }
  } finally {
    btn.disabled = false;
    updateNotifUI();
  }
});
