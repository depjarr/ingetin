<script setup>
// Perkenalan sebelum masuk/daftar: 3 layar yang menunjukkan cara kerja Ingetin dengan animasi kecil.
import { ref, computed, onMounted, onUnmounted } from "vue";
import { motion, AnimatePresence } from "motion-v";
import AppIcon from "./AppIcon.vue";
import BrandMark from "./BrandMark.vue";

const emit = defineEmits(["done"]);

const SLIDES = [
  {
    title: "Semua yang punya tanggal habis, di satu tempat",
    body: "STNK, SIM, paspor, BPJS, sampai tagihan listrik. Ingetin menghitung mundur untukmu.",
  },
  {
    title: "Cukup foto, tanggalnya kami baca",
    body: "Foto dokumen atau tagihan. Ingetin membaca tanggal berlakunya dan menyiapkan pengingat. Kamu tinggal cek lalu simpan.",
  },
  {
    title: "Diingatkan sebelum terlambat",
    body: "Notifikasi masuk ke HP-mu jam 8 pagi. Mau seminggu sebelum, sehari sebelum, atau di hari H, kamu yang pilih.",
  },
];

const step = ref(0);
const dir = ref(1);
const last = computed(() => step.value === SLIDES.length - 1);

function go(n) {
  if (n < 0 || n >= SLIDES.length) return;
  dir.value = n > step.value ? 1 : -1;
  step.value = n;
}
const next = () => (last.value ? emit("done", "signup") : go(step.value + 1));

function onDragEnd(_e, info) {
  if (info.offset.x < -60 || info.velocity.x < -400) go(step.value + 1);
  else if (info.offset.x > 60 || info.velocity.x > 400) go(step.value - 1);
}

function onKey(e) {
  if (e.key === "ArrowRight") go(step.value + 1);
  if (e.key === "ArrowLeft") go(step.value - 1);
}
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));

// Data contoh untuk animasi (bukan data user)
const CARDS = [
  { name: "STNK Vario", label: "Kendaraan", icon: "car", color: "#007AFF", days: 12 },
  { name: "SIM A", label: "Identitas", icon: "id", color: "#5856D6", days: 45 },
  { name: "Listrik PLN", label: "Listrik & air", icon: "bolt", color: "#FF9500", days: 3 },
];
const NOTES = [
  { title: "Listrik PLN", body: "Jatuh tempo besok, Rp 312.000", icon: "bolt", color: "#FF9500", when: "08.00" },
  { title: "SIM A", body: "Habis 7 hari lagi. Siapkan KTP & pas foto.", icon: "id", color: "#5856D6", when: "kemarin" },
  { title: "BPJS Kesehatan", body: "Jatuh tempo hari ini", icon: "heart", color: "#FF2D55", when: "Senin" },
];

// Hitung mundur kecil di layar 1 supaya terasa "hidup"
const tick = ref(12);
let tickTimer = null;
onMounted(() => {
  tickTimer = setInterval(() => { tick.value = tick.value <= 1 ? 12 : tick.value - 1; }, 900);
});
onUnmounted(() => clearInterval(tickTimer));

const SPRING = { type: "spring", stiffness: 260, damping: 24 };
</script>

<template>
  <section class="intro" aria-roledescription="perkenalan">
    <div class="intro-glow" aria-hidden="true" />

    <header class="intro-top">
      <span class="intro-brand"><BrandMark :size="32" /> Ingetin</span>
      <button v-if="!last" class="intro-skip" @click="emit('done', 'signup')">Lewati</button>
    </header>

    <!-- Ilustrasi hidup per langkah -->
    <motion.div
      class="intro-stage"
      drag="x"
      :drag-snap-to-origin="true"
      :drag-elastic="0.2"
      @drag-end="onDragEnd"
    >
      <AnimatePresence mode="wait" :initial="false">
        <!-- 1: tumpukan kartu -->
        <motion.div
          v-if="step === 0"
          key="s0"
          class="scene"
          :initial="{ opacity: 0, x: dir * 60 }"
          :animate="{ opacity: 1, x: 0 }"
          :exit="{ opacity: 0, x: dir * -60 }"
          :transition="{ duration: 0.28 }"
        >
          <motion.div
            v-for="(c, i) in CARDS"
            :key="c.name"
            class="demo-card"
            :style="{ background: `linear-gradient(150deg, ${c.color}, color-mix(in srgb, ${c.color} 70%, black))`, zIndex: 3 - i }"
            :initial="{ y: 80, rotate: 0, opacity: 0 }"
            :animate="{ y: -i * 26, rotate: [0, -6, 5][i], scale: 1 - i * 0.06, opacity: 1 }"
            :transition="{ ...SPRING, delay: 0.1 + (2 - i) * 0.12 }"
          >
            <span class="demo-cat"><span class="demo-glyph"><AppIcon :name="c.icon" :size="14" /></span>{{ c.label }}</span>
            <span class="demo-name">{{ c.name }}</span>
            <span class="demo-count">
              <motion.span
                v-if="i === 0"
                :key="tick"
                class="demo-num"
                :initial="{ y: -14, opacity: 0 }"
                :animate="{ y: 0, opacity: 1 }"
                :transition="{ duration: 0.25 }"
              >{{ tick }}</motion.span>
              <span v-else class="demo-num">{{ c.days }}</span>
              <span class="demo-unit">hari lagi</span>
            </span>
            <span class="demo-chip" />
          </motion.div>
        </motion.div>

        <!-- 2: foto masuk saku lalu jadi pengingat -->
        <motion.div
          v-else-if="step === 1"
          key="s1"
          class="scene"
          :initial="{ opacity: 0, x: dir * 60 }"
          :animate="{ opacity: 1, x: 0 }"
          :exit="{ opacity: 0, x: dir * -60 }"
          :transition="{ duration: 0.28 }"
        >
          <div class="demo-pocket-back" />
          <motion.div
            class="demo-doc"
            :initial="{ y: -150, rotate: -14, opacity: 0 }"
            :animate="{ y: [-150, -60, 6, 6], rotate: [-14, -6, 0, 0], opacity: [0, 1, 1, 0] }"
            :transition="{ duration: 3.2, times: [0, 0.3, 0.55, 1], repeat: Infinity, repeatDelay: 0.4 }"
          >
            <AppIcon name="camera" :size="20" />
            <span>Foto STNK</span>
          </motion.div>
          <motion.div
            class="demo-beam"
            :animate="{ y: [-30, 30, -30], opacity: [0, 1, 0] }"
            :transition="{ duration: 1.6, repeat: Infinity, delay: 1.2 }"
          />
          <div class="demo-pocket-front"><span class="demo-stitch" /></div>
          <motion.div
            class="demo-result"
            :animate="{ y: [20, 20, 0, 0], opacity: [0, 0, 1, 1], scale: [0.9, 0.9, 1, 1] }"
            :transition="{ duration: 3.6, times: [0, 0.5, 0.65, 1], repeat: Infinity }"
          >
            <span class="app-glyph small" style="background: #007AFF"><AppIcon name="car" :size="15" /></span>
            <span class="demo-result-text"><strong>STNK Vario</strong><span>Berlaku s.d. 14 Mar 2027</span></span>
            <span class="demo-check"><AppIcon name="check" :size="14" /></span>
          </motion.div>
        </motion.div>

        <!-- 3: notifikasi turun dari atas -->
        <motion.div
          v-else
          key="s2"
          class="scene scene-notes"
          :initial="{ opacity: 0, x: dir * 60 }"
          :animate="{ opacity: 1, x: 0 }"
          :exit="{ opacity: 0, x: dir * -60 }"
          :transition="{ duration: 0.28 }"
        >
          <div class="demo-phone">
            <span class="demo-island" />
            <span class="demo-time">08.00</span>
            <motion.div
              v-for="(n, i) in NOTES"
              :key="n.title"
              class="demo-note"
              :initial="{ y: -90, opacity: 0, scale: 0.9 }"
              :animate="{ y: 0, opacity: 1 - i * 0.18, scale: 1 - i * 0.03 }"
              :transition="{ type: 'spring', stiffness: 380, damping: 26, delay: 0.25 + (2 - i) * 0.35 }"
            >
              <span class="app-glyph" :style="{ background: n.color }"><AppIcon :name="n.icon" :size="15" /></span>
              <span class="demo-note-text">
                <span class="demo-note-top"><b>Ingetin</b><span>{{ n.when }}</span></span>
                <strong>{{ n.title }}</strong>
                <span>{{ n.body }}</span>
              </span>
            </motion.div>
          </div>
        </motion.div>
      </AnimatePresence>
    </motion.div>

    <!-- Teks & tombol -->
    <div class="intro-copy" aria-live="polite">
      <AnimatePresence mode="wait" :initial="false">
        <motion.div
          :key="step"
          :initial="{ opacity: 0, y: 10 }"
          :animate="{ opacity: 1, y: 0 }"
          :exit="{ opacity: 0, y: -6 }"
          :transition="{ duration: 0.22 }"
        >
          <h1>{{ SLIDES[step].title }}</h1>
          <p>{{ SLIDES[step].body }}</p>
        </motion.div>
      </AnimatePresence>
    </div>

    <div class="intro-steps" role="tablist" aria-label="Langkah perkenalan">
      <button
        v-for="(s, i) in SLIDES"
        :key="i"
        role="tab"
        class="intro-step"
        :class="{ on: i === step }"
        :aria-selected="i === step"
        :aria-label="`Langkah ${i + 1} dari ${SLIDES.length}`"
        @click="go(i)"
      />
    </div>

    <div class="intro-actions">
      <motion.button class="btn primary wide" :while-press="{ scale: 0.97 }" @click="next">
        {{ last ? "Buat akun gratis" : "Lanjut" }}
      </motion.button>
      <button class="intro-login" @click="emit('done', 'login')">Sudah punya akun? <b>Masuk</b></button>
    </div>
  </section>
</template>
