<script setup>
import { computed, ref } from "vue";
import { formatDate, formatRupiah, REPEAT_LABEL, remindLabel } from "../lib/dates";
import { saveProposal } from "../lib/chat";

const props = defineProps({ proposal: { type: Object, required: true } });
const emit = defineEmits(["update"]);

const busy = ref(false);
const error = ref("");

const LABEL = { kind: "Jenis", name: "Nama", due_date: "Tanggal", repeat: "Berulang", remind_days: "Ingatkan", amount: "Nominal", note: "Catatan" };

function show(key, value) {
  if (value == null || value === "") return "–";
  if (key === "kind") return value === "tagihan" ? "Tagihan" : "Dokumen";
  if (key === "due_date") return formatDate(value);
  if (key === "repeat") return REPEAT_LABEL[value] ?? value;
  if (key === "remind_days") return [...value].sort((a, b) => b - a).map(remindLabel).join(", ");
  if (key === "amount") return formatRupiah(value);
  return String(value);
}

const isCreate = computed(() => props.proposal.type === "create");
const title = computed(() => (isCreate.value ? "Usulan pengingat baru" : `Usulan ubah “${props.proposal.item_name}”`));

const rows = computed(() => {
  const p = props.proposal;
  if (isCreate.value) {
    return Object.keys(LABEL)
      .filter((k) => !(k === "amount" && p.item.kind !== "tagihan") && !(k === "note" && !p.item.note))
      .map((k) => ({ key: k, label: LABEL[k], value: show(k, p.item[k]) }));
  }
  return Object.keys(p.changes).map((k) => ({
    key: k,
    label: LABEL[k] ?? k,
    before: show(k, p.before?.[k]),
    value: show(k, p.changes[k]),
  }));
});

async function save() {
  busy.value = true;
  error.value = "";
  try {
    await saveProposal(props.proposal);
    emit("update", "tersimpan");
  } catch (err) {
    error.value = err.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="proposal" :class="proposal.status">
    <div class="proposal-title">{{ title }}</div>
    <dl>
      <template v-for="r in rows" :key="r.key">
        <dt>{{ r.label }}</dt>
        <dd>
          <template v-if="r.before !== undefined"><s>{{ r.before }}</s> → </template>{{ r.value }}
        </dd>
      </template>
    </dl>

    <p v-if="proposal.status === 'tersimpan'" class="msg ok">✓ Tersimpan</p>
    <p v-else-if="proposal.status === 'diabaikan'" class="msg">Diabaikan</p>
    <template v-else>
      <p v-if="error" class="msg error" role="status">{{ error }}</p>
      <div class="row">
        <button class="btn small primary" :disabled="busy" @click="save">{{ isCreate ? "Simpan" : "Simpan perubahan" }}</button>
        <button class="btn small" :disabled="busy" @click="emit('update', 'diabaikan')">Abaikan</button>
      </div>
    </template>
  </div>
</template>
