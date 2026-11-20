<script setup>
// Masuk / daftar / lupa password. Kiri (atau atas di HP): etalase kartu Ingetin. Kanan: form.
import { ref, computed, onMounted, onUnmounted } from "vue";
import { motion, AnimatePresence } from "motion-v";
import { supabase, appUrl, MIN_PASSWORD } from "../lib/supabase";
import { authErrorText } from "../lib/errors";
import AppIcon from "./AppIcon.vue";
import BrandMark from "./BrandMark.vue";

const props = defineProps({ initialMode: { type: String, default: "login" } });
const emit = defineEmits(["intro"]);

/** "login" | "signup" | "forgot" */
const mode = ref(props.initialMode);
const email = ref("");
const password = ref("");
const showPw = ref(false);
const msg = ref("");
const isError = ref(false);
const sent = ref(false); // email konfirmasi / reset sudah terkirim
const loading = ref(false);

const COPY = {
  login: { title: "Selamat datang kembali", sub: "Masuk untuk melihat pengingatmu.", submit: "Masuk" },
  signup: { title: "Buat akun gratis", sub: "Cukup email dan password. Datamu hanya bisa dilihat olehmu.", submit: "Buat akun" },
  forgot: { title: "Lupa password", sub: "Masukkan email akunmu. Kami kirim link untuk membuat password baru.", submit: "Kirim link" },
};
const copy = computed(() => COPY[mode.value]);
const pwTooShort = computed(() => mode.value === "signup" && password.value.length > 0 && password.value.length < MIN_PASSWORD);

function switchTo(next) {
  mode.value = next;
  msg.value = "";
  isError.value = false;
  sent.value = false;
  password.value = "";
}

function show(text, error = false) {
  msg.value = text;
  isError.value = error;
}

async function submit() {
  loading.value = true;
  show("");
  const addr = email.value.trim();

  try {
    if (mode.value === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(addr, { redirectTo: appUrl() });
      if (error) throw error;
      // Pesan sama walau email tidak terdaftar, supaya orang lain tidak bisa menebak email siapa yang terdaftar
      sent.value = true;
      return show("Kalau email itu terdaftar, link reset sudah dikirim. Cek kotak masuk atau folder spam.");
    }

    const creds = { email: addr, password: password.value };
    if (mode.value === "signup") {
      const { data, error } = await supabase.auth.signUp({ ...creds, options: { emailRedirectTo: appUrl() } });
      if (error) throw error;
      if (!data.session) {
        sent.value = true;
        show(`Akun dibuat. Kami kirim email konfirmasi ke ${addr}. Klik link di email itu, lalu masuk di sini.`);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword(creds);
      if (error) throw error;
    }
  } catch (err) {
    show(authErrorText(err), true);
  } finally {
    loading.value = false;
  }
}

// Etalase: kartu contoh yang berganti otomatis
const SHOWCASE = [
  { name: "STNK Vario", label: "Kendaraan", icon: "car", color: "#007AFF", days: 12, date: "2 Des 2026" },
  { name: "Listrik PLN", label: "Listrik & air", icon: "bolt", color: "#FF9500", days: 3, date: "23 Nov 2026" },
  { name: "Paspor", label: "Identitas", icon: "id", color: "#5856D6", days: 90, date: "18 Feb 2027" },
  { name: "BPJS Kesehatan", label: "Kesehatan", icon: "heart", color: "#FF2D55", days: 7, date: "27 Nov 2026" },
];
const front = ref(0);
let timer = null;
onMounted(() => { timer = setInterval(() => { front.value = (front.value + 1) % SHOWCASE.length; }, 2800); });
onUnmounted(() => clearInterval(timer));
const pos = (i) => (i - front.value + SHOWCASE.length) % SHOWCASE.length;
</script>

<template>
  <section class="auth">
    <div class="auth-bg" aria-hidden="true">
      <span class="blob b1" /><span class="blob b2" /><span class="blob b3" />
    </div>

    <!-- Etalase -->
    <div class="auth-hero">
      <div class="auth-brand">
        <BrandMark :size="56" />
        <div>
          <p class="auth-name">Ingetin</p>
          <p class="auth-tag">Pengingat dokumen & tagihan</p>
        </div>
      </div>

      <div class="auth-deck" aria-hidden="true">
        <motion.div
          v-for="(c, i) in SHOWCASE"
          :key="c.name"
          class="demo-card"
          :style="{ background: `linear-gradient(150deg, ${c.color}, color-mix(in srgb, ${c.color} 70%, black))`, zIndex: 10 - pos(i) }"
          :animate="pos(i) === 0
            ? { y: 0, scale: 1, opacity: 1, rotate: 0 }
            : pos(i) < 3 ? { y: -pos(i) * 18, scale: 1 - pos(i) * 0.06, opacity: 1, rotate: 0 } : { y: -40, scale: 0.84, opacity: 0, rotate: 0 }"
          :transition="{ type: 'spring', stiffness: 260, damping: 28 }"
        >
          <span class="demo-cat"><span class="demo-glyph"><AppIcon :name="c.icon" :size="14" /></span>{{ c.label }}</span>
          <span class="demo-name">{{ c.name }}</span>
          <span class="demo-count"><span class="demo-num">{{ c.days }}</span><span class="demo-unit">hari lagi</span></span>
          <span class="demo-date">{{ c.date }}</span>
          <span class="demo-chip" />
        </motion.div>
      </div>

      <ul class="auth-points">
        <li><span class="app-glyph small" style="background: #34C759"><AppIcon name="camera" :size="14" /></span>Foto dokumen, tanggalnya dibaca otomatis</li>
        <li><span class="app-glyph small" style="background: #FF9500"><AppIcon name="bell" :size="14" /></span>Diingatkan lewat notifikasi HP jam 8 pagi</li>
        <li><span class="app-glyph small" style="background: #5856D6"><AppIcon name="shield" :size="14" /></span>Datamu hanya bisa dilihat olehmu</li>
      </ul>
    </div>

    <!-- Form -->
    <div class="auth-panel">
      <button v-if="mode === 'forgot'" class="auth-back" @click="switchTo('login')"><AppIcon name="chevron-left" :size="18" /> Kembali ke Masuk</button>

      <!-- Judul langsung berganti (tanpa menunggu animasi keluar), lalu masuk dengan halus -->
      <motion.div
        :key="mode"
        :initial="{ opacity: 0, y: 8 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.2 }"
      >
        <h1 class="auth-title">{{ copy.title }}</h1>
        <p class="auth-sub">{{ copy.sub }}</p>
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div
          v-if="sent"
          key="sent"
          class="auth-sent"
          role="status"
          :initial="{ opacity: 0, scale: 0.96 }"
          :animate="{ opacity: 1, scale: 1 }"
          :transition="{ type: 'spring', stiffness: 400, damping: 30 }"
        >
          <span class="app-glyph" style="background: #34C759"><AppIcon name="check" :size="18" /></span>
          <p>{{ msg }}</p>
          <button class="btn primary wide" @click="switchTo('login')">Ke halaman Masuk</button>
        </motion.div>

        <form v-else key="form" class="auth-form" @submit.prevent="submit">
          <div class="form-group">
            <label class="form-row auth-field">
              <AppIcon name="mail" :size="18" class="auth-ico" />
              <input v-model="email" type="email" autocomplete="email" required placeholder="Email" aria-label="Email">
            </label>
            <label v-if="mode !== 'forgot'" class="form-row auth-field">
              <AppIcon name="lock" :size="18" class="auth-ico" />
              <input
                v-model="password"
                :type="showPw ? 'text' : 'password'"
                required
                :minlength="MIN_PASSWORD"
                :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
                :placeholder="mode === 'signup' ? `Password (min. ${MIN_PASSWORD} karakter)` : 'Password'"
                aria-label="Password"
              >
              <button type="button" class="auth-eye" :aria-label="showPw ? 'Sembunyikan password' : 'Tampilkan password'" @click="showPw = !showPw">
                {{ showPw ? "Sembunyikan" : "Lihat" }}
              </button>
            </label>
          </div>
          <p v-if="pwTooShort" class="form-hint warn">Kurang {{ MIN_PASSWORD - password.length }} karakter lagi.</p>
          <p v-if="msg && isError" class="auth-error" role="alert">{{ msg }}</p>

          <motion.button type="submit" class="btn primary wide" :disabled="loading" :while-press="{ scale: 0.98 }">
            {{ loading ? "Sebentar…" : copy.submit }}
          </motion.button>

          <button v-if="mode === 'login'" type="button" class="link auth-forgot" @click="switchTo('forgot')">Lupa password?</button>
          <p v-if="mode === 'signup'" class="auth-fine">Dengan membuat akun, kamu setuju datamu disimpan untuk keperluan pengingat. Kamu bisa menghapus akun kapan saja dari Pengaturan.</p>
        </form>
      </AnimatePresence>

      <p v-if="mode !== 'forgot' && !sent" class="auth-switch">
        <template v-if="mode === 'login'">
          Belum punya akun?
          <button type="button" @click="switchTo('signup')">Daftar</button>
        </template>
        <template v-else>
          Sudah punya akun?
          <button type="button" @click="switchTo('login')">Masuk</button>
        </template>
      </p>

      <button class="auth-intro" @click="emit('intro')">Kembali ke perkenalan</button>
    </div>
  </section>
</template>
