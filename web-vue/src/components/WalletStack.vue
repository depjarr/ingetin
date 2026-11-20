<script setup>
// Tumpukan kartu gaya Apple Wallet. Geser kartu depan ke kiri/kanan untuk ganti,
// atau biarkan: kartu berganti otomatis tiap 5 detik mengikuti urutan jatuh tempo.
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { motion, useReducedMotion } from "motion-v";
import { formatDate, formatRupiah, countdown, shortCountdown, urgency } from "../lib/dates";
import { categorize, shade } from "../lib/categories";
import AppIcon from "./AppIcon.vue";

const props = defineProps({
  items: { type: Array, required: true }, // sudah urut, berisi { ...item, days }
});
const emit = defineEmits(["open"]);

const MAX = 8;
const AUTO_MS = 5000;

const cards = computed(() => props.items.slice(0, MAX).map((i) => ({ ...i, cat: categorize(i) })));
const index = ref(0);
const reduced = useReducedMotion();
let timer = null;
let lastTouch = 0;

watch(() => cards.value.length, (n) => { if (index.value >= n) index.value = 0; });

/** Posisi kartu dalam tumpukan: 0 = depan. */
const pos = (i) => (i - index.value + cards.value.length) % cards.value.length;

function pose(i) {
  const p = pos(i);
  if (p === 0) return { y: 0, scale: 1, opacity: 1, rotate: 0, x: 0 };
  if (p <= 2) return { y: -16 * p, scale: 1 - 0.05 * p, opacity: 1, rotate: 0, x: 0 };
  return { y: -36, scale: 0.86, opacity: 0, rotate: 0, x: 0 };
}

function go(step) {
  const n = cards.value.length;
  if (n < 2) return;
  index.value = (index.value + step + n) % n;
}

function touched() {
  lastTouch = Date.now();
}

function onDragEnd(_e, info) {
  touched();
  if (info.offset.x < -70 || info.velocity.x < -450) go(1);
  else if (info.offset.x > 70 || info.velocity.x > 450) go(-1);
}

function onKey(e) {
  if (e.key === "ArrowRight") { touched(); go(1); }
  if (e.key === "ArrowLeft") { touched(); go(-1); }
}

onMounted(() => {
  timer = setInterval(() => {
    // Berhenti otomatis kalau user baru saja menggeser, layar disembunyikan, atau "kurangi gerakan" aktif
    if (reduced.value || document.hidden || Date.now() - lastTouch < 10000) return;
    go(1);
  }, AUTO_MS);
});
onUnmounted(() => clearInterval(timer));

const front = computed(() => cards.value[index.value]);

function bg(c) {
  return `linear-gradient(150deg, ${c.cat.color} 0%, ${shade(c.cat.color, -0.28)} 100%)`;
}
</script>

<template>
  <div
    class="wallet"
    tabindex="0"
    role="region"
    aria-roledescription="carousel"
    :aria-label="`Pengingat terdekat, kartu ${index + 1} dari ${cards.length}`"
    @keydown="onKey"
  >
    <div class="wallet-stage">
      <motion.button
        v-for="(c, i) in cards"
        :key="c.id"
        class="wcard"
        :style="{ background: bg(c), zIndex: 20 - pos(i), pointerEvents: pos(i) === 0 ? 'auto' : 'none' }"
        :aria-hidden="pos(i) !== 0"
        :tabindex="pos(i) === 0 ? 0 : -1"
        :animate="pose(i)"
        :transition="{ type: 'spring', stiffness: 300, damping: 30 }"
        :drag="pos(i) === 0 && cards.length > 1 ? 'x' : false"
        :drag-snap-to-origin="true"
        :drag-elastic="0.6"
        :while-press="pos(i) === 0 ? { scale: 0.985 } : undefined"
        @drag-start="touched"
        @drag-end="onDragEnd"
        @click="emit('open', c)"
      >
        <span class="wcard-top">
          <span class="wcard-cat"><span class="wcard-glyph"><AppIcon :name="c.cat.icon" :size="15" /></span>{{ c.cat.label }}</span>
          <span class="wcard-chip" aria-hidden="true" />
        </span>
        <span class="wcard-name">{{ c.name }}</span>
        <span class="wcard-bottom">
          <span class="wcard-count">
            <span class="wcard-num">{{ countdown(c.days).value }}</span>
            <span v-if="countdown(c.days).unit" class="wcard-unit">{{ countdown(c.days).unit }}</span>
          </span>
          <span class="wcard-meta">
            <span v-if="urgency(c.days) === 'hot'" class="wcard-flag">{{ c.days < 0 ? 'Terlewat' : 'Segera' }}</span>
            <span>{{ c.kind === 'tagihan' ? 'Jatuh tempo' : 'Berlaku s.d.' }} {{ formatDate(c.due_date) }}</span>
            <span v-if="c.amount != null" class="wcard-amount">{{ formatRupiah(c.amount) }}</span>
          </span>
        </span>
      </motion.button>
    </div>

    <div v-if="cards.length > 1" class="wallet-dots" role="tablist" aria-label="Pilih kartu">
      <button
        v-for="(c, i) in cards"
        :key="c.id"
        role="tab"
        class="wdot"
        :class="{ on: i === index }"
        :aria-selected="i === index"
        :aria-label="`${c.name}, ${shortCountdown(c.days)}`"
        @click="touched(); index = i"
      />
    </div>
    <p class="sr-only" aria-live="polite">{{ front ? `${front.name}, ${shortCountdown(front.days)}` : '' }}</p>
  </div>
</template>
