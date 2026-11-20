<script setup>
import { ref } from "vue";
import { supabase, MIN_PASSWORD } from "../lib/supabase";
import { authErrorText } from "../lib/errors";

const emit = defineEmits(["done"]);

const password = ref("");
const confirmPw = ref("");
const msg = ref("");
const isError = ref(false);
const loading = ref(false);

async function submit() {
  if (password.value !== confirmPw.value) {
    msg.value = "Kedua password tidak sama.";
    isError.value = true;
    return;
  }
  loading.value = true;
  isError.value = false;
  msg.value = "Menyimpan…";
  const { error } = await supabase.auth.updateUser({ password: password.value });
  loading.value = false;
  if (error) {
    msg.value = authErrorText(error);
    isError.value = true;
    return;
  }
  history.replaceState(null, "", window.location.pathname);
  emit("done");
}
</script>

<template>
  <section>
    <h1 class="brand">Ingetin</h1>
    <form class="card stack" @submit.prevent="submit">
      <h2>Buat password baru</h2>

      <label for="new-pw">Password baru</label>
      <input id="new-pw" v-model="password" type="password" autocomplete="new-password" :minlength="MIN_PASSWORD" required>
      <p class="hint">Minimal {{ MIN_PASSWORD }} karakter.</p>

      <label for="new-pw2">Ulangi password baru</label>
      <input id="new-pw2" v-model="confirmPw" type="password" autocomplete="new-password" :minlength="MIN_PASSWORD" required>

      <button type="submit" class="btn primary" :disabled="loading">Simpan password</button>
      <p class="msg" :class="{ error: isError }" role="status">{{ msg }}</p>
    </form>
  </section>
</template>
