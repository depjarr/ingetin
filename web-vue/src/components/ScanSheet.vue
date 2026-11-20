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
    case "picked": return `${files.value.length} file siap dibaca`;
    case "reading": return `Membaca ${files.value.length} dokumen`;
    case "done":
      if (proposals.value.length) return `${proposals.value.length} pengingat siap disimpan`;
      return "Tanggal belum terbaca";
    case "error": return failed.value.length === files.value.length ? "Dokumen gagal dibaca" : `${failed.value.length} file gagal dibaca`;
    default: return "Scan dokumen";
  }
});

const subtitle = computed(() => {
  if (dragging.value) return `Foto atau PDF, maksimal ${MAX_FILES} file`;
  switch (phase.value) {
    case "picked": return `${sizeLabel(totalSize.value)} total. Tambahkan keterangan kalau perlu.`;
    case "reading": return `${STEPS[step.value]}…`;
    case "done": return proposals.value.length ? "Cek tanggalnya, lalu simpan." : "Lihat pesan asisten di bawah, atau coba foto yang lebih jelas.";
    case "error": return failed.value[0]?.error ?? "";
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
  for (const file of incoming) {
    try {
      const payload = await prepareAttachment(file);
      files.value.push({
        id: crypto.randomUUID(),
        name: file.name,
        size: Math.round((payload.data.length * 3) / 4),
        ...tileFor(file.type),
        status: "waiting",
        error: "",
        reply: "",
        payload,
      });
    } catch (err) {
      pickError.value = err.message;
    }
  }
  if (files.value.length) phase.value = "picked";
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

async function readOne(f) {
  f.status = "reading";
  f.error = "";
  try {
    const res = await sendChat({
      history: [],
      message: note.value.trim() || (f.payload ? "" : "Buatkan pengingat dari keterangan ini."),
      attachment: f.payload,
    });
    f.reply = res.reply || "";
    const got = (res.proposals || []).map((p) => ({ ...p, status: null, source: f.id }));
    proposals.value.push(...got);
    f.status = "done";
  } catch (err) {
    f.status = "failed";
    f.error = err.message;
  }
}

async function start() {
  // Tanpa file tapi ada keterangan → jadikan "kartu teks"
  if (!files.value.length && note.value.trim()) {
    files.value.push({ id: crypto.randomUUID(), name: "Keterangan", size: note.value.length, label: "Teks", tone: "note", status: "waiting", error: "", reply: "", payload: null });
  }
  if (!files.value.length) return;

  phase.value = "reading";
  step.value = 0;
  clearInterval(stepTimer);
  stepTimer = setInterval(() => { step.value = (step.value + 1) % STEPS.length; }, 1600);

  for (const f of files.value) if (f.status !== "done") await readOne(f);

  clearInterval(stepTimer);
  phase.value = failed.value.length ? "error" : "done";
}

async function retry(f) {
  phase.value = "reading";
  await readOne(f);
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
                  <template v-if="f.status === 'waiting'">{{ phase === 'reading' ? 'Menunggu' : sizeLabel(f.size) }}</template>
                  <template v-else-if="f.status === 'reading'">Membaca</template>
                  <template v-else-if="f.status === 'done'">Selesai</template>
                  <template v-else>Gagal</template>
                </span>
              </div>
              <div class="bar" :class="f.status">
                <motion.span
                  v-if="f.status === 'reading'"
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
              <p v-if="f.reply && f.status === 'done'" class="file-reply">{{ f.reply }}</p>
            </div>
            <button v-if="f.status === 'failed'" class="icon-btn small" aria-label="Coba lagi" @click="retry(f)"><AppIcon name="retry" :size="16" /></button>
            <button v-else-if="phase === 'picked'" class="icon-btn small" :aria-label="`Hapus ${f.name}`" @click="removeFile(f.id)"><AppIcon name="x" :size="16" /></button>
            <span v-else-if="f.status === 'done'" class="file-ok" aria-hidden="true"><AppIcon name="check" :size="14" /></span>
          </motion.li>
        </AnimatePresence>
      </ul>

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
        <button class="btn primary wide" :disabled="!files.length && !note.trim()" @click="start">
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
