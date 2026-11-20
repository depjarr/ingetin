<script setup>
import { ref, onUnmounted } from "vue";
import { MotionConfig } from "motion-v";
import { supabase, openedFromRecoveryLink } from "./lib/supabase";
import AuthView from "./components/AuthView.vue";
import HomeView from "./components/HomeView.vue";
import UpdatePasswordView from "./components/UpdatePasswordView.vue";
import UiLayer from "./components/UiLayer.vue";
import IntroView from "./components/IntroView.vue";

const user = ref(null);
const ready = ref(false);
const recovering = ref(openedFromRecoveryLink);

// Didaftarkan langsung saat setup (bukan onMounted) supaya event PASSWORD_RECOVERY tidak terlewat
const { data } = supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") recovering.value = true;
  if (event === "SIGNED_OUT") {
    recovering.value = false;
    showIntro.value = true; // setelah keluar, mulai lagi dari halaman perkenalan
  }
  user.value = session?.user ?? null;
  ready.value = true;
});

onUnmounted(() => data.subscription.unsubscribe());

// Halaman perkenalan selalu jadi halaman pertama saat belum masuk.
const showIntro = ref(true);
const authMode = ref("login");

function finishIntro(mode) {
  authMode.value = mode;
  showIntro.value = false;
}
</script>

<template>
  <!-- reducedMotion="user": animasi dikurangi kalau HP diset "kurangi gerakan" -->
  <MotionConfig reduced-motion="user">
    <main class="wrap" :class="{ 'wrap-app': user && !recovering, 'wrap-auth': ready && !user }">
      <template v-if="ready">
        <UpdatePasswordView v-if="user && recovering" @done="recovering = false" />
        <HomeView v-else-if="user" :key="user.id" :user="user" />
        <IntroView v-else-if="showIntro" @done="finishIntro" />
        <AuthView v-else :key="authMode" :initial-mode="authMode" @intro="showIntro = true" />
      </template>
    </main>
    <UiLayer />
  </MotionConfig>
</template>
