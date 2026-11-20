<script setup>
// Pusat notifikasi: kartu-kartu kecil mengambang dari atas, seperti notifikasi iPhone.
// Setiap kartu bisa ditutup dengan tombol ✕ atau digeser ke samping. Ada juga "Hapus semua".
import { computed, ref, watch, onUnmounted } from "vue";
import { motion, AnimatePresence } from "motion-v";
import { daysUntil, shortCountdown, formatDate } from "../lib/dates";
import { categorize } from "../lib/categories";
import { getPushState, enablePush, testNotification } from "../lib/push";
import { dismiss, isDismissed, noteKey } from "../lib/dismissed";
import AppIcon from "./AppIcon.vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  items: { type: Array, required: true },
});
const emit = defineEmits(["update:open", "open-item"]);

const pushState = ref("loading");
const busy = ref(false);

// Yang perlu perhatian (sudah lewat + 7 hari ke depan), kecuali yang sudah dihapus user
const notes = computed(() =>
  props.items
    .map((i) => ({ ...i, days: daysUntil(i.due_date), cat: categorize(i), key: noteKey(i) }))
    .filter((i) => i.days <= 7 && !isDismissed(i.key))
    .sort((a, b) => a.days - b.days),
);

const PUSH_TEXT = {
  off: { title: "Pengingat di HP belum aktif", body: "Aktifkan supaya HP-mu berbunyi jam 08.00.", action: "Aktifkan" },
  denied: { title: "Notifikasi diblokir", body: "Izinkan notifikasi Ingetin di pengaturan HP/browser.", action: null },
  "install-ios": { title: "Pasang dulu di Layar Utama", body: "Safari → Bagikan → “Tambahkan ke Layar Utama”.", action: null },
  unsupported: { title: "Browser belum mendukung notifikasi", body: "Coba Chrome (Android) atau Safari (iPhone).", action: null },
  on: { title: "Pengingat di HP aktif", body: "Kamu diingatkan jam 08.00 WIB.", action: "Coba bunyikan" },
};
const pushKey = computed(() => `push:${pushState.value}`);
const push = computed(() => (isDismissed(pushKey.value) ? null : PUSH_TEXT[pushState.value]));
const count = computed(() => notes.value.length + (push.value ? 1 : 0));

async function refresh() {
  pushState.value = await getPushState();
}

async function pushAction() {
  busy.value = true;
  try {
    if (pushState.value === "off") await enablePush();
    else if (pushState.value === "on") await testNotification();
  } finally {
    busy.value = false;
    refresh();
  }
}

function body(i) {
  const verb = i.kind === "tagihan" ? "Jatuh tempo" : "Habis";
  if (i.days < 0) return `${shortCountdown(i.days)} sejak ${formatDate(i.due_date)}.`;
  if (i.days === 0) return `${verb} hari ini.`;
  return `${verb} ${i.days === 1 ? "besok" : `${i.days} hari lagi`}, ${formatDate(i.due_date)}.`;
}

function clearAll() {
  dismiss(...notes.value.map((n) => n.key), ...(push.value ? [pushKey.value] : []));
}

/** Geser kartu ke kiri/kanan cukup jauh = hapus */
function onSwipe(key, _e, info) {
  if (Math.abs(info.offset.x) > 90 || Math.abs(info.velocity.x) > 500) dismiss(key);
}

const close = () => emit("update:open", false);
const onKey = (e) => { if (e.key === "Escape") close(); };

watch(() => props.open, (open) => {
  document.body.style.overflow = open ? "hidden" : "";
  if (open) {
    refresh();
    window.addEventListener("keydown", onKey);
  } else window.removeEventListener("keydown", onKey);
});
onUnmounted(() => {
  document.body.style.overflow = "";
  window.removeEventListener("keydown", onKey);
});

const DROP = { type: "spring", stiffness: 420, damping: 30 };
const EXIT = { opacity: 0, x: 120, height: 0, marginTop: -6, transition: { duration: 0.22 } };
</script>

<template>
  <Teleport to="body">
    <AnimatePresence>
      <motion.div
        v-if="open"
        key="nc-bg"
        class="nc-backdrop"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.25 }"
        @click="close"
      />
      <motion.section
        v-if="open"
        key="nc"
        class="nc"
        role="dialog"
        aria-modal="true"
        aria-label="Notifikasi"
        :initial="{ opacity: 1 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0, y: -30, transition: { duration: 0.2 } }"
      >
        <motion.header class="nc-head" :initial="{ y: -50, opacity: 0 }" :animate="{ y: 0, opacity: 1 }" :transition="DROP">
          <h2>Notifikasi</h2>
          <div class="nc-head-actions">
            <button v-if="count > 1" class="nc-clear" @click="clearAll">Hapus semua</button>
            <button class="nc-close" @click="close">Tutup</button>
          </div>
        </motion.header>

        <div class="nc-list">
          <AnimatePresence>
            <!-- Status notifikasi HP -->
            <motion.div
              v-if="push"
              :key="pushKey"
              class="nc-card"
              :initial="{ y: -60, opacity: 0, scale: 0.94 }"
              :animate="{ y: 0, x: 0, opacity: 1, scale: 1 }"
              :exit="EXIT"
              :transition="{ ...DROP, delay: 0.05 }"
              drag="x"
              :drag-snap-to-origin="true"
              :drag-elastic="0.5"
              @drag-end="(e, info) => onSwipe(pushKey, e, info)"
            >
              <span class="app-glyph" :style="{ background: pushState === 'on' ? '#34C759' : '#8E8E93' }"><AppIcon name="bell" :size="14" /></span>
              <span class="nc-text">
                <strong>{{ push.title }}</strong>
                <span>{{ push.body }}</span>
                <button v-if="push.action" class="nc-action" :disabled="busy" @click="pushAction">{{ push.action }}</button>
              </span>
              <button class="nc-x" aria-label="Hapus notifikasi ini" @click="dismiss(pushKey)"><AppIcon name="x" :size="12" /></button>
            </motion.div>

            <!-- Pengingat -->
            <motion.div
              v-for="(n, i) in notes"
              :key="n.key"
              class="nc-card"
              :initial="{ y: -60, opacity: 0, scale: 0.94 }"
              :animate="{ y: 0, x: 0, opacity: 1, scale: 1 }"
              :exit="EXIT"
              :transition="{ ...DROP, delay: 0.1 + i * 0.05 }"
              drag="x"
              :drag-snap-to-origin="true"
              :drag-elastic="0.5"
              @drag-end="(e, info) => onSwipe(n.key, e, info)"
            >
              <button class="nc-main" @click="emit('open-item', n); close()">
                <span class="app-glyph" :style="{ background: n.cat.color }"><AppIcon :name="n.cat.icon" :size="14" /></span>
                <span class="nc-text">
                  <span class="nc-meta"><span>{{ n.cat.label }}</span><span :class="{ hot: n.days < 0 }">{{ shortCountdown(n.days) }}</span></span>
                  <strong>{{ n.name }}</strong>
                  <span>{{ body(n) }}</span>
                </span>
              </button>
              <button class="nc-x" :aria-label="`Hapus notifikasi ${n.name}`" @click="dismiss(n.key)"><AppIcon name="x" :size="12" /></button>
            </motion.div>

            <!-- Kosong -->
            <motion.div
              v-if="count === 0"
              key="empty"
              class="nc-card nc-empty"
              :initial="{ y: -40, opacity: 0 }"
              :animate="{ y: 0, opacity: 1 }"
              :transition="{ ...DROP, delay: 0.15 }"
            >
              <span class="app-glyph" style="background: #34C759"><AppIcon name="check" :size="14" /></span>
              <span class="nc-text"><strong>Tidak ada notifikasi</strong><span>Semua sudah dibaca. Santai dulu.</span></span>
            </motion.div>
          </AnimatePresence>
        </div>
        <p v-if="count > 0" class="nc-tip">Geser ke samping atau tekan ✕ untuk menghapus.</p>
      </motion.section>
    </AnimatePresence>
  </Teleport>
</template>
