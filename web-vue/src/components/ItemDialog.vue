<script setup>
// Form tambah/ubah pengingat gaya iPhone: tombol Batal & Simpan di atas, isian dikelompokkan.
import { ref, reactive, computed, watch } from "vue";
import { supabase } from "../lib/supabase";
import { dbErrorText } from "../lib/errors";
import { daysUntil } from "../lib/dates";
import { categorize } from "../lib/categories";
import { showBanner } from "../lib/ui";
import AppIcon from "./AppIcon.vue";

const emit = defineEmits(["saved"]);

const dialogEl = ref(null);
const saving = ref(false);
const msg = ref("");
const editingId = ref(null);
let loadingForm = false;

// Pilihan pengingat dengan bahasa sehari-hari (nilai = hari sebelum jatuh tempo)
const REMIND = [
  { value: 30, label: "1 bulan sebelum" },
  { value: 14, label: "2 minggu sebelum" },
  { value: 7, label: "1 minggu sebelum" },
  { value: 3, label: "3 hari sebelum" },
  { value: 1, label: "1 hari sebelum" },
  { value: 0, label: "Di hari H" },
  { value: -1, label: "1 hari sesudah" },
  { value: -3, label: "3 hari sesudah" },
];
const REPEAT = [
  { value: "none", label: "Sekali" },
  { value: "monthly", label: "Tiap bulan" },
  { value: "yearly", label: "Tiap tahun" },
  { value: "5yearly", label: "Tiap 5 tahun" },
];

const blank = () => ({
  kind: "dokumen",
  name: "",
  due_date: "",
  amount: "",
  repeat: "yearly",
  remind_days: [30, 7, 1],
  note: "",
});
const form = reactive(blank());

const isBill = computed(() => form.kind === "tagihan");
const isEdit = computed(() => editingId.value !== null);
const pastWarning = computed(() => form.due_date && daysUntil(form.due_date) < 0);
const cat = computed(() => categorize({ name: form.name, kind: form.kind, note: form.note }));

// Ganti jenis → sesuaikan default "berulang" & pengingat (hanya saat tambah baru)
watch(() => form.kind, (kind) => {
  if (loadingForm || isEdit.value) return;
  form.repeat = kind === "tagihan" ? "monthly" : "yearly";
  form.remind_days = kind === "tagihan" ? [3, 1, 0] : [30, 7, 1];
});

/** open() untuk tambah, open(item) untuk ubah, open(null, { due_date }) untuk tambah dengan isian awal */
function open(item = null, preset = null) {
  loadingForm = true;
  editingId.value = item?.id ?? null;
  Object.assign(form, blank(), preset ?? {}, item ? {
    kind: item.kind,
    name: item.name,
    due_date: item.due_date,
    amount: item.amount ?? "",
    repeat: item.repeat,
    remind_days: [...item.remind_days],
    note: item.note ?? "",
  } : {});
  msg.value = "";
  dialogEl.value.showModal();
  queueMicrotask(() => { loadingForm = false; });
}
function close() {
  dialogEl.value.close();
}
defineExpose({ open });

function toggleRemind(v) {
  const i = form.remind_days.indexOf(v);
  if (i === -1) form.remind_days.push(v);
  else form.remind_days.splice(i, 1);
}

async function save() {
  const name = form.name.trim();
  if (!name) return (msg.value = "Tulis dulu namanya, misalnya “STNK Motor”.");
  if (!form.due_date) return (msg.value = "Pilih tanggalnya dulu.");
  if (form.remind_days.length === 0) return (msg.value = "Pilih minimal satu kapan kamu mau diingatkan.");

  const row = {
    kind: form.kind,
    name,
    due_date: form.due_date,
    repeat: form.repeat,
    remind_days: [...form.remind_days].sort((a, b) => b - a),
    note: form.note.trim() || null,
    amount: isBill.value && form.amount !== "" ? Math.max(0, Math.round(Number(form.amount))) : null,
  };

  saving.value = true;
  msg.value = "";
  const { error } = isEdit.value
    ? await supabase.from("items").update(row).eq("id", editingId.value)
    : await supabase.from("items").insert(row);
  saving.value = false;

  if (error) return (msg.value = "Belum tersimpan: " + dbErrorText(error));
  close();
  showBanner({
    title: isEdit.value ? "Perubahan disimpan" : "Pengingat ditambahkan",
    body: `${name} sudah masuk ke daftarmu.`,
    icon: "check",
    color: "#34C759",
    duration: 3000,
  });
  emit("saved");
}
</script>

<template>
  <dialog ref="dialogEl" class="ios-sheet" aria-labelledby="item-dialog-title">
    <form @submit.prevent="save">
      <header class="sheet-bar">
        <button type="button" class="bar-btn" @click="close">Batal</button>
        <h2 id="item-dialog-title">{{ isEdit ? "Ubah pengingat" : "Pengingat baru" }}</h2>
        <button type="submit" class="bar-btn strong" :disabled="saving">{{ saving ? "Menyimpan…" : "Simpan" }}</button>
      </header>

      <div class="form-body">
        <div class="ios-seg" role="radiogroup" aria-label="Jenis">
          <label :class="{ on: form.kind === 'dokumen' }"><input v-model="form.kind" type="radio" value="dokumen" class="sr-only"> Dokumen</label>
          <label :class="{ on: form.kind === 'tagihan' }"><input v-model="form.kind" type="radio" value="tagihan" class="sr-only"> Tagihan</label>
        </div>
        <p class="form-hint">{{ isBill ? 'Contoh: listrik, internet, BPJS, cicilan.' : 'Contoh: STNK, SIM, KTP, paspor, asuransi.' }}</p>

        <div class="form-group">
          <label class="form-row">
            <span class="app-glyph small" :style="{ background: cat.color }"><AppIcon :name="cat.icon" :size="15" /></span>
            <input v-model="form.name" maxlength="100" required :placeholder="isBill ? 'Nama tagihan, mis. Listrik PLN' : 'Nama dokumen, mis. STNK Motor'" aria-label="Nama">
          </label>
          <label class="form-row">
            <span class="form-label">{{ isBill ? "Jatuh tempo" : "Berlaku sampai" }}</span>
            <input v-model="form.due_date" type="date" required class="align-right">
          </label>
          <label v-if="isBill" class="form-row">
            <span class="form-label">Nominal</span>
            <input v-model="form.amount" type="number" min="0" step="1000" inputmode="numeric" placeholder="Opsional, mis. 450000" class="align-right">
          </label>
        </div>
        <p v-if="pastWarning" class="form-hint warn">Tanggal ini sudah lewat. Kamu hanya akan diingatkan “sesudah” jatuh tempo.</p>

        <h3 class="form-section">Berulang</h3>
        <div class="choice-grid">
          <button
            v-for="r in REPEAT"
            :key="r.value"
            type="button"
            class="choice"
            :class="{ on: form.repeat === r.value }"
            :aria-pressed="form.repeat === r.value"
            @click="form.repeat = r.value"
          >{{ r.label }}</button>
        </div>

        <h3 class="form-section">Ingatkan saya</h3>
        <div class="form-group">
          <button
            v-for="r in REMIND"
            :key="r.value"
            type="button"
            class="form-row check-row"
            :aria-pressed="form.remind_days.includes(r.value)"
            @click="toggleRemind(r.value)"
          >
            <span>{{ r.label }}</span>
            <span class="checkmark" :class="{ on: form.remind_days.includes(r.value) }"><AppIcon name="check" :size="16" /></span>
          </button>
        </div>
        <p class="form-hint">Notifikasi dikirim jam 08.00 pagi di hari yang kamu pilih.</p>

        <h3 class="form-section">Catatan</h3>
        <div class="form-group">
          <textarea v-model="form.note" rows="3" maxlength="500" placeholder="Opsional, mis. bawa KTP asli & BPKB" class="form-textarea" aria-label="Catatan"></textarea>
        </div>

        <p v-if="msg" class="form-error" role="alert">{{ msg }}</p>
      </div>
    </form>
  </dialog>
</template>
