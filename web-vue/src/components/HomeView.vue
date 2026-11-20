<script setup>
// Kerangka aplikasi setelah login: layar (Beranda / Kalender / Daftar / Asisten), tab bar, panel & sheet.
import { ref, computed, onMounted, watch } from "vue";
import { supabase } from "../lib/supabase";
import { dbErrorText } from "../lib/errors";
import { nextDueDate, formatDate, summarize, daysUntil, shortCountdown } from "../lib/dates";
import { categorize } from "../lib/categories";
import { signOutSafely } from "../lib/push";
import { clearHistory } from "../lib/chat";
import { showBanner, confirmDialog, alertDialog, actionSheet } from "../lib/ui";
import { isDismissed, noteKey } from "../lib/dismissed";
import AppIcon from "./AppIcon.vue";
import TabBar from "./TabBar.vue";
import DashboardScreen from "./DashboardScreen.vue";
import CalendarScreen from "./CalendarScreen.vue";
import ListScreen from "./ListScreen.vue";
import ChatView from "./ChatView.vue";
import ScanSheet from "./ScanSheet.vue";
import NotifCenter from "./NotifCenter.vue";
import ItemDialog from "./ItemDialog.vue";
import SettingsDialog from "./SettingsDialog.vue";

const props = defineProps({ user: { type: Object, required: true } });

const items = ref([]);
const loading = ref(true);
const error = ref("");
const busyId = ref(null);
const focusId = ref(null);
const itemDialog = ref(null);
const settingsDialog = ref(null);
const notifOpen = ref(false);
const scanOpen = ref(false);

/** "home" | "calendar" | "list" | "chat" */
const screen = ref("home");
watch(screen, () => window.scrollTo({ top: 0 }));

const TITLES = { chat: "Asisten" };
const summary = computed(() => summarize(items.value));
// Jumlah di lonceng: yang perlu perhatian dan belum dihapus dari pusat notifikasi
const alertCount = computed(() => items.value.filter((i) => daysUntil(i.due_date) <= 7 && !isDismissed(noteKey(i))).length);

async function loadItems() {
  loading.value = true;
  error.value = "";
  const { data, error: err } = await supabase.from("items").select("*").order("due_date");
  loading.value = false;
  if (err) error.value = "Data belum bisa dimuat. Periksa koneksi internet, lalu tarik ke bawah atau buka ulang aplikasi.";
  else items.value = data;
}

async function markDone(item) {
  if (item.repeat === "none") return removeItem(item, "Sudah selesai?");
  const next = nextDueDate(item);
  const ok = await confirmDialog({
    title: "Sudah diperpanjang?",
    message: `Pengingat “${item.name}” akan dipindah ke ${formatDate(next)}.`,
    confirmText: "Ya, pindahkan",
  });
  if (!ok) return;

  busyId.value = item.id;
  const { error: err } = await supabase.from("items").update({ due_date: next }).eq("id", item.id);
  busyId.value = null;
  if (err) return alertDialog({ title: "Belum tersimpan", message: dbErrorText(err) });
  showBanner({ title: "Mantap, sudah diperpanjang", body: `${item.name} sekarang jatuh tempo ${formatDate(next)}.`, icon: "check", color: "#34C759", duration: 3500 });
  loadItems();
}

async function removeItem(item, title = "Hapus pengingat?") {
  const ok = await confirmDialog({
    title,
    message: `“${item.name}” akan dihapus dari daftar dan tidak bisa dikembalikan.`,
    confirmText: "Hapus",
    destructive: true,
  });
  if (!ok) return;

  busyId.value = item.id;
  const { error: err } = await supabase.from("items").delete().eq("id", item.id);
  busyId.value = null;
  if (err) return alertDialog({ title: "Belum terhapus", message: dbErrorText(err) });
  showBanner({ title: "Pengingat dihapus", body: item.name, icon: "trash", color: "#8E8E93", duration: 2500 });
  loadItems();
}

function openItem(item) {
  focusId.value = item.id;
  screen.value = "list";
}

// Tombol + di tengah tab bar
async function addMenu() {
  const choice = await actionSheet({
    title: "Tambah pengingat",
    message: "Pilih cara yang paling mudah buatmu",
    actions: [
      { value: "scan", label: "Foto atau upload dokumen", hint: "Tanggalnya dibaca otomatis", icon: "camera", color: "#34C759" },
      { value: "manual", label: "Isi sendiri", hint: "Ketik nama & tanggalnya", icon: "pencil", color: "#007AFF" },
      { value: "chat", label: "Ceritakan ke asisten", hint: "Mis. “pajak motor tgl 12 Maret”", icon: "spark", color: "#AF52DE" },
    ],
  });
  if (choice === "scan") scanOpen.value = true;
  else if (choice === "manual") itemDialog.value.open();
  else if (choice === "chat") screen.value = "chat";
}

async function signOut() {
  const ok = await confirmDialog({ title: "Keluar dari akun?", message: "Notifikasi di HP ini juga akan dimatikan.", confirmText: "Keluar", destructive: true });
  if (!ok) return;
  clearHistory(props.user.id);
  await signOutSafely();
}

// Saat aplikasi dibuka: tampilkan 1 banner untuk yang paling mendesak (sekali per sesi)
function greetWithBanner() {
  const KEY = "ingetin-banner-shown";
  try { if (sessionStorage.getItem(KEY)) return; sessionStorage.setItem(KEY, "1"); } catch { /* abaikan */ }
  const urgent = items.value
    .map((i) => ({ ...i, days: daysUntil(i.due_date) }))
    .filter((i) => i.days <= 3 && !isDismissed(noteKey(i))) // yang sudah dihapus user tidak muncul lagi
    .sort((a, b) => a.days - b.days)[0];
  if (!urgent) return;
  const cat = categorize(urgent);
  setTimeout(() => showBanner({
    title: urgent.name,
    body: urgent.days < 0 ? `${shortCountdown(urgent.days)}. Ketuk untuk mengurus.` : `${urgent.kind === "tagihan" ? "Jatuh tempo" : "Habis"} ${shortCountdown(urgent.days).toLowerCase()}, ${formatDate(urgent.due_date)}.`,
    icon: cat.icon,
    color: cat.color,
    duration: 6000,
    onTap: () => openItem(urgent),
  }), 700);
}

// Dibuka dari notifikasi (?item=<id>) → buka Daftar dan sorot item itu
function focusItemFromUrl() {
  const id = new URLSearchParams(window.location.search).get("item");
  if (!id) return false;
  history.replaceState(null, "", window.location.pathname);
  if (items.value.some((i) => i.id === id)) openItem({ id });
  return true;
}

onMounted(async () => {
  await loadItems();
  if (!focusItemFromUrl()) greetWithBanner();
});
</script>

<template>
  <div class="app">
    <header class="topbar">
      <button class="round-btn" aria-label="Pengaturan" @click="settingsDialog.open()">
        <AppIcon name="gear" :size="20" />
      </button>
      <h1 v-if="TITLES[screen]" class="topbar-title">{{ TITLES[screen] }}</h1>
      <button class="round-btn" :aria-label="`Notifikasi${alertCount ? `, ${alertCount} perlu perhatian` : ''}`" @click="notifOpen = true">
        <AppIcon name="bell" :size="20" />
        <span v-if="alertCount" class="badge-dot">{{ alertCount }}</span>
      </button>
    </header>

    <p v-if="error" class="inline-error" role="alert">{{ error }}</p>

    <DashboardScreen
      v-if="screen === 'home'"
      :items="items"
      :summary="summary"
      :loading="loading"
      @open="openItem"
      @ask="screen = 'chat'"
      @add="addMenu"
      @scan="scanOpen = true"
      @see-all="screen = 'list'"
      @calendar="screen = 'calendar'"
    />

    <CalendarScreen
      v-else-if="screen === 'calendar'"
      :items="items"
      @open="openItem"
      @add-on="(iso) => itemDialog.open(null, { due_date: iso })"
    />

    <ListScreen
      v-else-if="screen === 'list'"
      v-model:focus-id="focusId"
      :items="items"
      :loading="loading"
      :busy-id="busyId"
      @add="addMenu"
      @edit="(i) => itemDialog.open(i)"
      @done="markDone"
      @remove="removeItem"
    />

    <ChatView v-else :user-id="user.id" @changed="loadItems" @scan="scanOpen = true" />

    <TabBar v-model="screen" @add="addMenu" />

    <ScanSheet v-model:open="scanOpen" @saved="loadItems" />
    <NotifCenter v-model:open="notifOpen" :items="items" @open-item="openItem" />
    <ItemDialog ref="itemDialog" @saved="loadItems" />
    <SettingsDialog ref="settingsDialog" :user="user" @sign-out="signOut" />
  </div>
</template>
