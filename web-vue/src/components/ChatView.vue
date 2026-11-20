<script setup>
import { ref, nextTick, onMounted } from "vue";
import { motion, AnimatePresence } from "motion-v";
import {
  ACCEPT, prepareAttachment, sendChat, historyForApi, loadHistory, storeHistory, clearHistory,
} from "../lib/chat";
import ProposalCard from "./ProposalCard.vue";
import AppIcon from "./AppIcon.vue";
import { confirmDialog } from "../lib/ui";

const props = defineProps({ userId: { type: String, required: true } });
const emit = defineEmits(["changed", "scan"]);

const SUGGESTIONS = [
  "Apa yang paling dekat jatuh tempo?",
  "Ada yang sudah lewat?",
  "Berapa total tagihan bulan ini?",
];

const messages = ref([]);
const input = ref("");
const attachment = ref(null); // { media_type, data, name }
const preparing = ref(false);
const sending = ref(false);
const error = ref("");
const remaining = ref(null);
const fileEl = ref(null);

function persist() {
  storeHistory(props.userId, messages.value);
}

async function scrollToBottom() {
  await nextTick();
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
}

async function onFile(e) {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  error.value = "";
  preparing.value = true;
  try {
    attachment.value = await prepareAttachment(file);
  } catch (err) {
    error.value = err.message;
  } finally {
    preparing.value = false;
  }
}

async function send(text = input.value) {
  const message = text.trim();
  if ((!message && !attachment.value) || sending.value) return;

  const history = historyForApi(messages.value);
  const att = attachment.value;
  messages.value.push({ role: "user", text: message, attachmentName: att?.name ?? null });
  input.value = "";
  attachment.value = null;
  error.value = "";
  sending.value = true;
  persist();
  scrollToBottom();

  try {
    const res = await sendChat({ history, message, attachment: att });
    messages.value.push({
      role: "assistant",
      text: res.reply || "",
      proposals: (res.proposals || []).map((p) => ({ ...p, status: null })),
    });
    remaining.value = res.remaining ?? null;
    persist();
  } catch (err) {
    error.value = err.message;
    // Kembalikan pesan ke kotak input supaya bisa dikirim ulang
    messages.value.pop();
    input.value = message;
    attachment.value = att;
    persist();
  } finally {
    sending.value = false;
    scrollToBottom();
  }
}

function onKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send();
  }
}

function updateProposal(proposal, status) {
  proposal.status = status;
  persist();
  if (status === "tersimpan") emit("changed");
}

async function reset() {
  if (!(await confirmDialog({ title: "Mulai obrolan baru?", message: "Riwayat obrolan ini akan dihapus.", confirmText: "Hapus", destructive: true }))) return;
  messages.value = [];
  clearHistory(props.userId);
}

onMounted(() => {
  messages.value = loadHistory(props.userId);
  scrollToBottom();
});
</script>

<template>
  <section class="chat">
    <div v-if="messages.length === 0" class="chat-empty">
      <div class="chat-orb" aria-hidden="true"><AppIcon name="spark" :size="26" /></div>
      <h2>Tanya soal pengingatmu</h2>
      <p class="muted">Asisten bisa melihat daftar pengingatmu dan membuat usulan baru. Tidak ada yang tersimpan sebelum kamu menekan Simpan.</p>
      <div class="chips-col">
        <button v-for="s in SUGGESTIONS" :key="s" class="chip big" @click="send(s)">{{ s }}</button>
        <button class="chip big accent" @click="emit('scan')"><AppIcon name="scan" :size="16" /> Scan dokumen</button>
      </div>
    </div>

    <div v-else class="chat-list" aria-live="polite">
      <div class="chat-tools">
        <button class="link" @click="reset">Mulai obrolan baru</button>
      </div>
      <motion.div
        v-for="(m, i) in messages"
        :key="i"
        class="bubble-wrap"
        :class="m.role"
        :initial="{ opacity: 0, y: 10 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.2 }"
      >
        <div v-if="m.text || m.attachmentName" class="bubble">
          <div v-if="m.attachmentName" class="attach-tag"><AppIcon name="clip" :size="14" /> {{ m.attachmentName }}</div>
          <div v-if="m.text" class="bubble-text">{{ m.text }}</div>
        </div>
        <ProposalCard
          v-for="p in m.proposals || []"
          :key="p.id"
          :proposal="p"
          @update="(status) => updateProposal(p, status)"
        />
      </motion.div>

      <AnimatePresence>
        <motion.div
          v-if="sending"
          key="typing"
          class="bubble-wrap assistant"
          :initial="{ opacity: 0, y: 8 }"
          :animate="{ opacity: 1, y: 0 }"
          :exit="{ opacity: 0 }"
        >
          <div class="bubble typing" aria-label="Asisten sedang mengetik">
            <motion.span
              v-for="d in 3"
              :key="d"
              class="typing-dot"
              :animate="{ y: [0, -4, 0] }"
              :transition="{ duration: 0.8, repeat: Infinity, delay: d * 0.12 }"
            />
          </div>
        </motion.div>
      </AnimatePresence>
    </div>

    <div class="composer">
      <p v-if="error" class="msg error" role="status">{{ error }}</p>
      <div v-if="attachment || preparing" class="attach-preview">
        <span><AppIcon name="clip" :size="14" /> {{ preparing ? "Menyiapkan file…" : attachment.name }}</span>
        <button v-if="attachment" class="link" @click="attachment = null">Hapus</button>
      </div>
      <form class="composer-box" @submit.prevent="send()">
        <input ref="fileEl" type="file" :accept="ACCEPT" hidden @change="onFile">
        <button type="button" class="icon-btn" :disabled="sending || preparing" aria-label="Lampirkan foto atau PDF" @click="fileEl.click()">
          <AppIcon name="clip" :size="19" />
        </button>
        <textarea
          v-model="input"
          rows="1"
          maxlength="2000"
          placeholder="Tulis pesan…"
          aria-label="Pesan untuk asisten"
          @keydown="onKeydown"
        ></textarea>
        <motion.button
          type="submit"
          class="send"
          aria-label="Kirim"
          :disabled="sending || preparing || (!input.trim() && !attachment)"
          :while-press="{ scale: 0.9 }"
        >
          <AppIcon name="send" :size="19" />
        </motion.button>
      </form>
      <p class="hint">
        Jawaban AI bisa keliru, cek tanggalnya sebelum menyimpan.<template v-if="remaining != null"> Sisa {{ remaining }} pesan hari ini.</template>
      </p>
    </div>
  </section>
</template>
