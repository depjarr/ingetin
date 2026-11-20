<script setup>
import { reactive, computed, watch, nextTick } from "vue";
import { motion, AnimatePresence } from "motion-v";
import {
  filterItems, groupByMonth, daysUntil, formatDate, formatRupiah, REPEAT_LABEL, friendlyRemind, shortCountdown,
} from "../lib/dates";
import AppIcon from "./AppIcon.vue";
import { categorize } from "../lib/categories";

const props = defineProps({
  items: { type: Array, required: true },
  loading: { type: Boolean, default: false },
  busyId: { type: String, default: null },
  focusId: { type: String, default: null },
});
const emit = defineEmits(["add", "edit", "done", "remove", "update:focusId"]);

const filters = reactive({ query: "", kind: "all", status: "all" });
const KINDS = [
  { id: "all", label: "Semua" },
  { id: "dokumen", label: "Dokumen" },
  { id: "tagihan", label: "Tagihan" },
];

const visible = computed(() => filterItems(props.items, filters));
const groups = computed(() => groupByMonth(visible.value));
const overdueCount = computed(() => props.items.filter((i) => daysUntil(i.due_date) < 0).length);
const filtering = computed(() => filters.query.trim() || filters.kind !== "all" || filters.status !== "all");

function resetFilters() {
  Object.assign(filters, { query: "", kind: "all", status: "all" });
}

function toggle(id) {
  emit("update:focusId", props.focusId === id ? null : id);
}

function sub(i) {
  const parts = [i.kind === "tagihan" ? "Tagihan" : "Dokumen", formatDate(i.due_date)];
  if (i.amount != null) parts.push(formatRupiah(i.amount));
  return parts.join(", ");
}

// Dibuka dari beranda / notifikasi: pastikan item terlihat lalu scroll ke sana
watch(() => props.focusId, async (id) => {
  if (!id) return;
  if (!visible.value.some((i) => i.id === id)) resetFilters();
  await nextTick();
  document.getElementById(`item-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}, { immediate: true });
</script>

<template>
  <section class="listscreen">
    <h1 class="large-title">Daftar</h1>
    <div class="search">
      <AppIcon name="search" :size="18" />
      <input v-model="filters.query" type="search" placeholder="Cari STNK, PLN, catatan…" aria-label="Cari pengingat">
    </div>

    <div class="segmented" role="radiogroup" aria-label="Jenis">
      <button
        v-for="k in KINDS"
        :key="k.id"
        role="radio"
        :aria-checked="filters.kind === k.id"
        :class="{ active: filters.kind === k.id }"
        @click="filters.kind = k.id"
      >
        <motion.span v-if="filters.kind === k.id" layout-id="seg-active" class="segmented-active" :transition="{ type: 'spring', stiffness: 500, damping: 40 }" />
        <span class="segmented-label">{{ k.label }}</span>
      </button>
    </div>

    <div class="filter-row">
      <button class="chip" :class="{ on: filters.status === 'soon' }" @click="filters.status = filters.status === 'soon' ? 'all' : 'soon'">30 hari ke depan</button>
      <button v-if="overdueCount" class="chip" :class="{ on: filters.status === 'overdue' }" @click="filters.status = filters.status === 'overdue' ? 'all' : 'overdue'">Sudah lewat ({{ overdueCount }})</button>
    </div>

    <p v-if="loading" class="msg" role="status">Memuat…</p>
    <p v-else-if="items.length === 0" class="msg" role="status">Belum ada pengingat. Tekan tombol <strong>+</strong> di bawah untuk menambah.</p>
    <p v-else-if="visible.length === 0" class="msg" role="status">
      Tidak ada yang cocok.
      <button v-if="filtering" class="link" @click="resetFilters">Hapus filter</button>
    </p>

    <section v-for="g in groups" :key="g.key" class="month">
      <h2 class="month-title" :class="{ hot: g.key === 'overdue' }">{{ g.label }}</h2>
      <ul class="ios-list">
        <li v-for="it in g.items" :id="`item-${it.id}`" :key="it.id" :class="{ open: focusId === it.id }">
          <button class="ios-row" :aria-expanded="focusId === it.id" @click="toggle(it.id)">
            <span class="app-glyph" :style="{ background: categorize(it).color }"><AppIcon :name="categorize(it).icon" :size="17" /></span>
            <span class="ios-row-main">
              <span class="ios-row-title">{{ it.name }}</span>
              <span class="ios-row-sub">{{ sub(it) }}</span>
            </span>
            <span class="tag" :class="daysUntil(it.due_date) <= 7 ? 'tag-red' : daysUntil(it.due_date) <= 30 ? 'tag-orange' : 'tag-gray'">
              {{ shortCountdown(daysUntil(it.due_date)) }}
            </span>
          </button>

          <AnimatePresence>
            <motion.div
              v-if="focusId === it.id"
              class="row-more"
              :initial="{ height: 0, opacity: 0 }"
              :animate="{ height: 'auto', opacity: 1 }"
              :exit="{ height: 0, opacity: 0 }"
              :transition="{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }"
            >
              <div class="row-more-inner">
                <p class="row-detail">
                  Berulang: {{ REPEAT_LABEL[it.repeat].toLowerCase() }}. Diingatkan {{ [...it.remind_days].sort((a, b) => b - a).map(friendlyRemind).join(", ") }}.
                </p>
                <p v-if="it.note" class="row-detail note">{{ it.note }}</p>
                <div class="row-acts">
                  <button class="act act-green" :disabled="busyId === it.id" @click="emit('done', it)">
                    <AppIcon name="check" :size="18" /> {{ it.repeat === 'none' ? 'Selesai' : 'Sudah diperpanjang' }}
                  </button>
                  <button class="act" :disabled="busyId === it.id" @click="emit('edit', it)"><AppIcon name="pencil" :size="18" /> Ubah</button>
                  <button class="act act-red" :disabled="busyId === it.id" @click="emit('remove', it)"><AppIcon name="trash" :size="18" /> Hapus</button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </li>
      </ul>
    </section>
  </section>
</template>
