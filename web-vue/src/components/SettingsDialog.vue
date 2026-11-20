<script setup>
import { ref } from "vue";
import { supabase, MIN_PASSWORD } from "../lib/supabase";
import { authErrorText } from "../lib/errors";
import { disablePush } from "../lib/push";

const props = defineProps({ user: { type: Object, required: true } });
const emit = defineEmits(["sign-out"]);

const dialogEl = ref(null);
const emailReminders = ref(true);
const newPassword = ref("");
const msg = ref("");
const isError = ref(false);
const busy = ref(false);
const confirmDelete = ref("");

function open() {
  emailReminders.value = props.user.user_metadata?.email_reminders !== false;
  newPassword.value = "";
  confirmDelete.value = "";
  msg.value = "";
  dialogEl.value.showModal();
}
defineExpose({ open });

async function run(action, okText) {
  busy.value = true;
  isError.value = false;
  msg.value = "Memproses…";
  try {
    await action();
    msg.value = okText;
  } catch (err) {
    msg.value = authErrorText(err);
    isError.value = true;
  } finally {
    busy.value = false;
  }
}

function saveEmailPref() {
  return run(async () => {
    const { error } = await supabase.auth.updateUser({ data: { email_reminders: emailReminders.value } });
    if (error) throw error;
  }, emailReminders.value ? "Email pengingat aktif." : "Email pengingat dimatikan.");
}

function changePassword() {
  return run(async () => {
    const { error } = await supabase.auth.updateUser({ password: newPassword.value });
    if (error) throw error;
    newPassword.value = "";
  }, "Password berhasil diganti.");
}

function deleteAccount() {
  return run(async () => {
    await disablePush().catch(() => {});
    const { error } = await supabase.rpc("delete_my_account");
    if (error) throw error;
    await supabase.auth.signOut({ scope: "local" });
  }, "Akun dihapus.");
}
</script>

<template>
  <dialog ref="dialogEl" class="ios-sheet" aria-labelledby="settings-title">
    <header class="sheet-bar">
      <span />
      <h2 id="settings-title">Pengaturan</h2>
      <button type="button" class="bar-btn strong" @click="dialogEl.close()">Selesai</button>
    </header>

    <div class="form-body">
      <div class="profile">
        <span class="avatar" aria-hidden="true">{{ (user.email || "?").slice(0, 1).toUpperCase() }}</span>
        <span><strong>{{ user.email }}</strong><br><span class="form-hint inline">Akun Ingetin</span></span>
      </div>

      <h3 class="form-section">Pengingat</h3>
      <div class="form-group">
        <label class="form-row switch-row">
          <span>Kirim juga lewat email<br><small>Kalau notifikasi di HP tidak aktif</small></span>
          <input v-model="emailReminders" type="checkbox" role="switch" class="ios-switch" :disabled="busy" @change="saveEmailPref">
        </label>
      </div>

      <h3 class="form-section">Ganti password</h3>
      <form class="form-group" @submit.prevent="changePassword">
        <label class="form-row">
          <input id="s-pw" v-model="newPassword" type="password" autocomplete="new-password" :minlength="MIN_PASSWORD" required :placeholder="`Password baru (min. ${MIN_PASSWORD} karakter)`" aria-label="Password baru">
        </label>
        <button type="submit" class="form-row link-row" :disabled="busy">Simpan password baru</button>
      </form>

      <div class="form-group">
        <button type="button" class="form-row link-row" @click="emit('sign-out')">Keluar dari akun</button>
      </div>

      <h3 class="form-section danger">Hapus akun</h3>
      <form class="form-group" @submit.prevent="deleteAccount">
        <p class="form-row plain">Semua pengingatmu ikut terhapus dan tidak bisa dikembalikan. Ketik HAPUS untuk melanjutkan.</p>
        <label class="form-row">
          <input id="s-del" v-model="confirmDelete" autocomplete="off" placeholder="Ketik HAPUS" aria-label="Konfirmasi hapus akun">
        </label>
        <button type="submit" class="form-row link-row destructive" :disabled="busy || confirmDelete !== 'HAPUS'">Hapus akun saya</button>
      </form>

      <p v-if="msg" class="form-hint" :class="{ 'form-error': isError }" role="status">{{ msg }}</p>
    </div>
  </dialog>
</template>
