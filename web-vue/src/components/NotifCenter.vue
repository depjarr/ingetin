<script setup>
// Pusat notifikasi: panel turun dari atas (seperti tarik layar iPhone ke bawah), isinya kartu notifikasi.
import { computed, ref, watch, onUnmounted } from "vue";
import { motion, AnimatePresence } from "motion-v";
import { daysUntil, shortCountdown, formatDate } from "../lib/dates";
import { categorize } from "../lib/categories";
import { getPushState, enablePush, testNotification } from "../lib/push";
import AppIcon from "./AppIcon.vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  items: { type: Array, required: true },
});
const emit = defineEmits(["update:open", "open-item"]);

const pushState = ref("loading");
const busy = ref(false);

// Yang perlu perhatian: sudah lewat + 7 hari ke depan
const notes = computed(() =>
  props.items
    .map((i) => ({ ...i, days: daysUntil(i.due_date), cat: categorize(i) }))
    .filter((i) => i.days <= 7)
    .sort((a, b) => a.days - b.days),
);

const PUSH_TEXT = {
  off: { title: "Pengingat di HP belum aktif", body: "Aktifkan supaya HP-mu berbunyi jam 08.00 sebelum jatuh tempo.", action: "Aktifkan" },
  denied: { title: "Notifikasi diblokir", body: "Buka pengaturan browser/HP, izinkan notifikasi untuk Ingetin, lalu buka ulang aplikasi.", action: null },
  "install-ios": { title: "Pasang dulu di Layar Utama", body: "Di Safari: tekan tombol Bagikan, pilih “Tambahkan ke Layar Utama”, lalu buka Ingetin dari ikonnya.", action: null },
  unsupported: { title: "Browser ini belum mendukung notifikasi", body: "Coba buka Ingetin di Chrome (Android) atau Safari (iPhone).", action: null },
  on: { title: "Pengingat di HP aktif", body: "Kamu akan diingatkan jam 08.00 WIB.", action: "Coba bunyikan" },
};
const push = computed(() => PUSH_TEXT[pushState.value]);

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
  const verb = i.kind === "tagihan" ? "Jatuh tempo" : "Habis masa berlaku";
  if (i.days < 0) return `${shortCountdown(i.days)} sejak ${formatDate(i.due_date)}. Segera diurus, ya.`;
  if (i.days === 0) return `${verb} hari ini.`;
  return `${verb} ${i.days === 1 ? "besok" : `${i.days} hari lagi`}, ${formatDate(i.due_date)}.`;
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

function onPanelDragEnd(_e, info) {
  if (info.offset.y < -60 || info.velocity.y < -400) close();
}
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
        :initial="{ y: '-100%' }"
        :animate="{ y: 0 }"
        :exit="{ y: '-100%' }"
        :transition="{ type: 'spring', stiffness: 320, damping: 34 }"
        drag="y"
        :drag-constraints="{ top: 0, bottom: 0 }"
        :drag-elastic="{ top: 0.5, bottom: 0.05 }"
        @drag-end="onPanelDragEnd"
      >
        <header class="nc-head">
          <h2>Notifikasi</h2>
          <button class="nc-close" @click="close">Tutup</button>
        </header>

        <div class="nc-list">
          <motion.div
            v-if="push"
            class="nc-card"
            :initial="{ y: -16, opacity: 0, scale: 0.96 }"
            :animate="{ y: 0, opacity: 1, scale: 1 }"
            :transition="{ type: 'spring', stiffness: 380, damping: 28, delay: 0.08 }"
          >
            <span class="app-glyph" :style="{ background: pushState === 'on' ? '#34C759' : '#8E8E93' }"><AppIcon name="bell" :size="18" /></span>
            <span class="nc-text">
              <strong>{{ push.title }}</strong>
              <span>{{ push.body }}</span>
              <button v-if="push.action" class="nc-action" :disabled="busy" @click="pushAction">{{ push.action }}</button>
            </span>
          </motion.div>

          <motion.button
            v-for="(n, i) in notes"
            :key="n.id"
            class="nc-card"
            :initial="{ y: -16, opacity: 0, scale: 0.96 }"
            :animate="{ y: 0, opacity: 1, scale: 1 }"
            :transition="{ type: 'spring', stiffness: 380, damping: 28, delay: 0.12 + i * 0.05 }"
            @click="emit('open-item', n); close()"
          >
            <span class="app-glyph" :style="{ background: n.cat.color }"><AppIcon :name="n.cat.icon" :size="18" /></span>
            <span class="nc-text">
              <span class="nc-meta"><span>{{ n.cat.label }}</span><span :class="{ hot: n.days < 0 }">{{ shortCountdown(n.days) }}</span></span>
              <strong>{{ n.name }}</strong>
              <span>{{ body(n) }}</span>
            </span>
          </motion.button>

          <p v-if="!notes.length" class="nc-empty">Tidak ada yang jatuh tempo dalam 7 hari. Santai dulu.</p>
        </div>
        <div class="nc-grabber" aria-hidden="true" />
      </motion.section>
    </AnimatePresence>
  </Teleport>
</template>
