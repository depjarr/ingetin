<script setup>
// Scan dokumen: file "dimasukkan ke saku dompet", dibaca AI, lalu keluar sebagai usulan pengingat.
// Fase: idle → picked → reading → done | error
import { ref, computed, watch, onUnmounted } from "vue";
import { motion, AnimatePresence } from "motion-v";
import { ACCEPT, prepareAttachment, sendChat, saveProposal } from "../lib/chat";
import BottomSheet from "./BottomSheet.vue";
import AppIcon from "./AppIcon.vue";
import ProposalCard from "./ProposalCard.vue";

const props = defineProps({ open: { type: Boolean, default: false } });
const emit = defineEmits(["update:open", "saved"]);

const MAX_FILES = 3;
const STEPS = ["Mengenali jenis dokumen", "Mencari tanggal berlaku", "Menyusun pengingat"];

const phase = ref("idle");
const files = ref([]); // { id, name, label, tone, size, status, error, reply, payload }
const proposals = ref([]);
const note = ref("");
const dragging = ref(false);
const pickError = ref("");
const step = ref(0);
const savingAll = ref(false);
const fileEl = ref(null);
const cameraEl = ref(null);
let stepTimer = null;
let dragDepth = 0;

const failed = computed(() => files.value.filter((f) => f.status === "failed"));
const pending = computed(() => proposals.value.filter((p) => !p.status));
const totalSize = computed(() => files.value.reduce((a, f) => a + f.size, 0));

function sizeLabel(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function tileFor(type) {
  if (type === "application/pdf") return { label: "PDF", tone: "pdf" };
  if (type === "text/plain") return { label: "Teks", tone: "note" };
  return { label: type.includes("png") ? "PNG" : "Foto", tone: "img" };
}

const title = computed(() => {
  if (dragging.value) return "Lepas untuk menambahkan";
  switch (phase.value) {
    case "picked": return preparing.value ? "Menyiapkan file…" : `${files.value.length} file siap dibaca`;
    case "reading": return `Membaca ${files.value.length} dokumen`;
    case "done":
      if (proposals.value.length) return `${proposals.value.length} pengingat siap disimpan`;
      return "Tanggal belum terbaca";
    case "error": return "Dokumen belum terbaca";
    default: return "Scan dokumen";
  }
});

const subtitle = computed(() => {
  if (dragging.value) return `Foto atau PDF, maksimal ${MAX_FILES} file`;
  switch (phase.value) {
    case "picked": return `${sizeLabel(totalSize.value)} total. Tambahkan keterangan kalau perlu.`;
    case "reading": return `${STEPS[step.value]}…`;
    case "done": return proposals.value.length ? "Cek tanggalnya, lalu simpan." : "Lihat pesan asisten di bawah, atau coba foto yang lebih jelas.";
    case "error": return `${failed.value[0]?.error ?? ""} Tekan “Coba lagi”.`;
    default: return "Foto STNK, SIM, paspor, atau tagihan. Tanggalnya dibaca otomatis.";
  }
});

// Posisi kartu di atas/dalam saku, tergantung fase
function tilePose(i) {
  const n = files.value.length;
  const c = i - (n - 1) / 2;
  if (phase.value === "picked" || (phase.value === "idle" && n)) {
    return { x: c * 62, y: -54 - Math.abs(c) * -6, rotate: c * 11, scale: 1, opacity: 1 };
  }
  if (phase.value === "reading") return { x: c * 22, y: 18, rotate: c * 4, scale: 0.9, opacity: 1 };
  return { x: c * 22, y: 30, rotate: c * 3, scale: 0.86, opacity: 1 };
}

async function addFiles(list) {
  pickError.value = "";
  const incoming = [...list].slice(0, MAX_FILES - files.value.length);
  if (list.length > incoming.length) pickError.value = `Maksimal ${MAX_FILES} file sekaligus.`;
  if (incoming.length) phase.value = "picked";
  for (const file of incoming) {
    // Baris muncul dulu dengan status "Menyiapkan", lalu jadi "Siap" (bar penuh + centang)
    files.value.push({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      ...tileFor(file.type),
      status: "preparing",
      error: "",
      payload: null,
    });
    const f = files.value[files.value.length - 1]; // versi reaktif
    try {
      const [payload] = await Promise.all([prepareAttachment(file), new Promise((r) => setTimeout(r, 450))]);
      f.payload = payload;
      f.size = Math.round((payload.data.length * 3) / 4);
      f.status = "ready";
    } catch (err) {
      pickError.value = `${file.name}: ${err.message}`;
      files.value = files.value.filter((x) => x.id !== f.id);
    }
  }
  if (!files.value.length) phase.value = "idle";
}

function onPick(e) {
  if (e.target.files?.length) addFiles(e.target.files);
  e.target.value = "";
}

function removeFile(id) {
  files.value = files.value.filter((f) => f.id !== id);
  if (!files.value.length) phase.value = "idle";
}

// Drag & drop (desktop)
function onDragEnter(e) {
  if (![...(e.dataTransfer?.types ?? [])].includes("Files")) return;
  dragDepth++;
  dragging.value = true;
}
function onDragLeave() {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) dragging.value = false;
}
function onDrop(e) {
  dragDepth = 0;
  dragging.value = false;
  if (phase.value === "reading") return;
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
}

const preparing = computed(() => files.value.some((f) => f.status === "preparing"));
const reply = ref("");

/** Semua file dikirim dalam SATU permintaan: lebih cepat & tidak kena batas per menit Gemini. */
async function readAll() {
  const batch = files.value.filter((f) => f.status !== "done");
  for (const f of batch) { f.status = "reading"; f.error = ""; }
  try {
    const attachments = batch.map((f) => f.payload).filter(Boolean);
    const res = await sendChat({
      history: [],
      message: note.value.trim() || (attachments.length ? "" : "Buatkan pengingat dari keterangan ini."),
      attachments,
    });
    reply.value = res.reply || "";
    proposals.value.push(...(res.proposals || []).map((p) => ({ ...p, status: null })));
    for (const f of batch) f.status = "done";
  } catch (err) {
    for (const f of batch) { f.status = "failed"; f.error = err.message; }
  }
}

async function start() {
  // Tanpa file tapi ada keterangan → jadikan "kartu teks"
  if (!files.value.length && note.value.trim()) {
    files.value.push({ id: crypto.randomUUID(), name: "Keterangan", size: note.value.length, label: "Teks", tone: "note", status: "ready", error: "", payload: null });
  }
  if (!files.value.length || preparing.value) return;

  phase.value = "reading";
  step.value = 0;
  clearInterval(stepTimer);
  stepTimer = setInterval(() => { step.value = (step.value + 1) % STEPS.length; }, 1600);

  await readAll();

  clearInterval(stepTimer);
  phase.value = failed.value.length ? "error" : "done";
}

async function retry() {
  phase.value = "reading";
  await readAll();
  phase.value = failed.value.length ? "error" : "done";
}

async function saveAll() {
  savingAll.value = true;
  for (const p of pending.value) {
    try {
      await saveProposal(p);
      p.status = "tersimpan";
    } catch (err) {
      p.error = err.message;
    }
  }
  savingAll.value = false;
  emit("saved");
}

function onProposal(p, status) {
  p.status = status;
  if (status === "tersimpan") emit("saved");
}

function reset() {
  clearInterval(stepTimer);
  phase.value = "idle";
  files.value = [];
  proposals.value = [];
  reply.value = "";
  note.value = "";
  pickError.value = "";
  dragging.value = false;
}

function close() {
  emit("update:open", false);
}

// Bersihkan setelah sheet tertutup (tunggu animasi keluar)
watch(() => props.open, (open) => {
  if (!open && phase.value !== "reading") setTimeout(reset, 350);
});
onUnmounted(() => clearInterval(stepTimer));

const shake = computed(() => (phase.value === "error" ? { x: [0, -10, 9, -6, 4, 0] } : { x: 0 }));
</script>

<template>
  <BottomSheet :open="open" label="Scan dokumen" @update:open="emit('update:open', $event)">
    <div
      class="scan"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <header class="scan-head">
        <div aria-live="polite">
          <AnimatePresence mode="wait">
            <motion.h2
              :key="title"
              :initial="{ opacity: 0, y: 6 }"
              :animate="{ opacity: 1, y: 0 }"
              :exit="{ opacity: 0, y: -6 }"
              :transition="{ duration: 0.18 }"
            >{{ title }}</motion.h2>
          </AnimatePresence>
          <p class="scan-sub">{{ subtitle }}</p>
        </div>
        <button class="icon-btn" aria-label="Tutup" @click="close"><AppIcon name="x" :size="18" /></button>
      </header>

      <!-- Panggung: saku dompet -->
      <motion.div
        class="stage"
        :class="[`is-${phase}`, { dragging }]"
        :animate="shake"
        :transition="{ duration: 0.45 }"
      >
        <motion.div
          class="pocket-back"
          :animate="{ y: dragging ? -10 : 0 }"
          :transition="{ type: 'spring', stiffness: 400, damping: 24 }"
        />

        <AnimatePresence>
          <motion.div
            v-for="(f, i) in files"
            :key="f.id"
            class="tile"
            :class="[`tone-${f.tone}`, { failed: f.status === 'failed' }]"
            :initial="{ x: 0, y: -160, rotate: -20, opacity: 0, scale: 0.8 }"
            :animate="tilePose(i)"
            :exit="{ y: -120, opacity: 0, scale: 0.7, transition: { duration: 0.2 } }"
            :transition="{ type: 'spring', stiffness: 300, damping: 24, delay: phase === 'picked' ? i * 0.05 : i * 0.08 }"
          >
            <span class="tile-fold" />
            <AppIcon :name="f.tone === 'note' ? 'pencil' : f.tone === 'pdf' ? 'file' : 'camera'" :size="18" />
            <span class="tile-label">{{ f.label }}</span>
            <motion.span
              v-if="f.status === 'ready'"
              class="tile-ok"
              :initial="{ scale: 0 }"
              :animate="{ scale: [0, 1.3, 1] }"
              :transition="{ duration: 0.4, delay: 0.1 }"
            ><AppIcon name="check" :size="12" /></motion.span>
          </motion.div>
        </AnimatePresence>

        <!-- Sinar scan saat membaca -->
        <motion.div
          v-if="phase === 'reading'"
          class="beam"
          :initial="{ y: -50, opacity: 0 }"
          :animate="{ y: [-50, 40, -50], opacity: 1 }"
          :transition="{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }"
        />

        <motion.div
          class="pocket-front"
          :animate="{ y: dragging ? 8 : 0, rotateX: dragging ? -14 : 0 }"
          :transition="{ type: 'spring', stiffness: 400, damping: 24 }"
        >
          <span class="pocket-stitch" />
          <AnimatePresence mode="wait">
            <motion.span
              v-if="phase === 'done'"
              key="ok"
              class="pocket-badge ok"
              :initial="{ scale: 0, rotate: -40 }"
              :animate="{ scale: 1, rotate: 0 }"
              :exit="{ scale: 0 }"
              :transition="{ type: 'spring', stiffness: 500, damping: 18 }"
            ><AppIcon name="check" :size="22" /></motion.span>
            <motion.span
              v-else-if="phase === 'error'"
              key="err"
              class="pocket-badge err"
              :initial="{ scale: 0 }"
              :animate="{ scale: 1 }"
              :exit="{ scale: 0 }"
            ><AppIcon name="x" :size="20" /></motion.span>
            <motion.span
              v-else-if="phase === 'idle' && !dragging"
              key="hint"
              class="pocket-hint"
              :initial="{ opacity: 0 }"
              :animate="{ opacity: 1 }"
              :exit="{ opacity: 0 }"
            >Taruh dokumen di sini</motion.span>
          </AnimatePresence>
        </motion.div>
      </motion.div>

      <!-- Pilih file -->
      <div v-if="phase === 'idle' || phase === 'picked'" class="scan-actions">
        <input ref="cameraEl" type="file" accept="image/*" capture="environment" hidden @change="onPick">
        <input ref="fileEl" type="file" :accept="ACCEPT" multiple hidden @change="onPick">
        <button class="btn glass" :disabled="files.length >= MAX_FILES" @click="cameraEl.click()"><AppIcon name="camera" :size="18" /> Ambil foto</button>
        <button class="btn glass" :disabled="files.length >= MAX_FILES" @click="fileEl.click()"><AppIcon name="clip" :size="18" /> Pilih file</button>
      </div>
      <p v-if="pickError" class="msg error" role="status">{{ pickError }}</p>

      <!-- Daftar file + status -->
      <ul v-if="files.length" class="filelist">
        <AnimatePresence>
          <motion.li
            v-for="f in files"
            :key="f.id"
            layout
            class="file"
            :initial="{ opacity: 0, y: 8 }"
            :animate="{ opacity: 1, y: 0 }"
            :exit="{ opacity: 0, height: 0 }"
          >
            <span class="file-tile" :class="`tone-${f.tone}`">{{ f.label }}</span>
            <div class="file-main">
              <div class="file-top">
                <span class="file-name">{{ f.name }}</span>
                <span class="file-meta" :class="{ err: f.status === 'failed' }">
                  <template v-if="f.status === 'preparing'">Menyiapkan…</template>
                  <span v-else-if="f.status === 'ready'" class="file-ready">{{ sizeLabel(f.size) }} · Siap</span>
                  <template v-else-if="f.status === 'reading'">Membaca…</template>
                  <template v-else-if="f.status === 'done'">Selesai</template>
                  <template v-else>Gagal</template>
                </span>
              </div>
              <div class="bar" :class="f.status">
                <motion.span
                  v-if="f.status === 'preparing' || f.status === 'ready'"
                  class="bar-fill ready"
                  :initial="{ scaleX: 0 }"
                  :animate="{ scaleX: f.status === 'ready' ? 1 : 0.7 }"
                  :transition="{ duration: f.status === 'ready' ? 0.3 : 0.45, ease: 'easeOut' }"
                />
                <motion.span
                  v-else-if="f.status === 'reading'"
                  class="bar-run"
                  :initial="{ x: '-100%' }"
                  :animate="{ x: '260%' }"
                  :transition="{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }"
                />
                <motion.span
                  v-else-if="f.status === 'done' || f.status === 'failed'"
                  class="bar-fill"
                  :initial="{ scaleX: 0 }"
                  :animate="{ scaleX: 1 }"
                  :transition="{ duration: 0.35 }"
                />
              </div>
              <p v-if="f.status === 'failed' && f.error" class="file-reply err">{{ f.error }}</p>
            </div>
            <motion.span
              v-if="f.status === 'ready' || f.status === 'done'"
              :key="`ok-${f.status}`"
              class="file-ok"
              aria-hidden="true"
              :initial="{ scale: 0, rotate: -45 }"
              :animate="{ scale: [0, 1.25, 1], rotate: 0 }"
              :transition="{ duration: 0.4, ease: 'easeOut' }"
            ><AppIcon name="check" :size="14" /></motion.span>
            <button v-if="phase === 'picked' && f.status !== 'preparing'" class="icon-btn small" :aria-label="`Hapus ${f.name}`" @click="removeFile(f.id)"><AppIcon name="x" :size="16" /></button>
          </motion.li>
        </AnimatePresence>
      </ul>

      <p v-if="reply && (phase === 'done' || phase === 'error')" class="scan-reply"><AppIcon name="spark" :size="16" /> {{ reply }}</p>
      <motion.button
        v-if="phase === 'error'"
        class="btn primary wide"
        :initial="{ opacity: 0, y: 6 }"
        :animate="{ opacity: 1, y: 0 }"
        @click="retry"
      ><AppIcon name="retry" :size="18" /> Coba lagi</motion.button>

      <!-- Keterangan -->
      <div v-if="phase === 'idle' || phase === 'picked'" class="scan-note">
        <label for="scan-note">{{ files.length ? 'Keterangan (opsional)' : 'Atau tulis saja' }}</label>
        <textarea
          id="scan-note"
          v-model="note"
          rows="2"
          maxlength="500"
          :placeholder="files.length ? 'Mis. STNK motor istri, bayar di Samsat Bekasi' : 'Mis. pajak motor jatuh tempo 12 Maret 2027'"
        ></textarea>
        <button class="btn primary wide" :disabled="preparing || (!files.length && !note.trim())" @click="start">
          <AppIcon name="spark" :size="18" /> {{ files.length ? 'Baca dokumen' : 'Buat pengingat' }}
        </button>
      </div>

      <!-- Hasil -->
      <div v-if="proposals.length" class="results">
        <motion.div
          v-for="(p, i) in proposals"
          :key="p.id"
          :initial="{ opacity: 0, y: 24, scale: 0.96 }"
          :animate="{ opacity: 1, y: 0, scale: 1 }"
          :transition="{ type: 'spring', stiffness: 320, damping: 26, delay: 0.1 + i * 0.08 }"
        >
          <ProposalCard :proposal="p" @update="(s) => onProposal(p, s)" />
        </motion.div>
      </div>

      <div v-if="phase === 'done' || phase === 'error'" class="scan-foot">
        <button v-if="pending.length > 1" class="btn primary wide" :disabled="savingAll" @click="saveAll">
          <AppIcon name="check" :size="18" /> Simpan semua ({{ pending.length }})
        </button>
        <div class="row-actions">
          <button class="btn ghost" @click="reset">Scan lagi</button>
          <button class="btn ghost" @click="close">Selesai</button>
        </div>
      </div>
    </div>
  </BottomSheet>
</template>
