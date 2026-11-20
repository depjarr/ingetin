<script setup>
import { computed } from "vue";
import {
  daysUntil, formatDate, formatRupiah, shortCountdown, longToday, greeting,
} from "../lib/dates";
import { categorize } from "../lib/categories";
import AppIcon from "./AppIcon.vue";
import WalletStack from "./WalletStack.vue";

const props = defineProps({
  items: { type: Array, required: true },
  summary: { type: Object, required: true },
  loading: { type: Boolean, default: false },
});
const emit = defineEmits(["open", "ask", "add", "scan", "see-all", "calendar"]);

const today = longToday();
const hello = greeting();

// Kartu: yang sudah lewat dulu (paling mendesak), lalu yang akan datang
const deck = computed(() =>
  props.items
    .map((i) => ({ ...i, days: daysUntil(i.due_date) }))
    .sort((a, b) => ((a.days < 0) === (b.days < 0) ? a.days - b.days : a.days < 0 ? -1 : 1)),
);

const upcoming = computed(() =>
  props.items
    .map((i) => ({ ...i, days: daysUntil(i.due_date), cat: categorize(i) }))
    .filter((i) => i.days >= 0 && i.days <= 30),
);

const billsMonth = new Intl.DateTimeFormat("id-ID", { month: "long" }).format(new Date());
</script>

<template>
  <section class="dash">
    <header class="dash-hello">
      <p class="dash-date">{{ today }}</p>
      <h1 class="large-title">{{ hello }}</h1>
    </header>

    <div v-if="loading && !items.length" class="wcard skeleton" aria-label="Memuat" />
    <WalletStack v-else-if="deck.length" :items="deck" @open="emit('open', $event)" />
    <button v-else class="empty-wallet" @click="emit('add')">
      <span class="app-glyph big" style="background: #007AFF"><AppIcon name="plus" :size="26" /></span>
      <strong>Tambah pengingat pertamamu</strong>
      <span>Foto STNK, SIM, atau tagihan. Ingetin akan membaca tanggalnya dan mengingatkanmu sebelum habis.</span>
    </button>

    <div class="quick">
      <button class="quick-btn" @click="emit('scan')">
        <span class="app-glyph" style="background: #34C759"><AppIcon name="camera" :size="18" /></span>
        <span>Foto dokumen</span>
      </button>
      <button class="quick-btn" @click="emit('ask')">
        <span class="app-glyph" style="background: #AF52DE"><AppIcon name="spark" :size="18" /></span>
        <span>Tanya asisten</span>
      </button>
    </div>

    <div class="stats">
      <button class="stat" @click="emit('calendar')">
        <span class="stat-icon" style="color: #007AFF"><AppIcon name="calendar" :size="20" /></span>
        <span class="stat-num">{{ summary.soonCount }}</span>
        <span class="stat-label">jatuh tempo dalam 30 hari</span>
      </button>
      <button class="stat" :class="{ alert: summary.overdueCount }" @click="emit('see-all')">
        <span class="stat-icon" :style="{ color: summary.overdueCount ? '#FF3B30' : '#34C759' }"><AppIcon :name="summary.overdueCount ? 'bell' : 'check'" :size="20" /></span>
        <span class="stat-num">{{ summary.overdueCount }}</span>
        <span class="stat-label">{{ summary.overdueCount ? 'sudah lewat, perlu diurus' : 'tidak ada yang lewat' }}</span>
      </button>
      <button class="stat wide" @click="emit('see-all')">
        <span class="app-glyph" style="background: #FF9500"><AppIcon name="receipt" :size="17" /></span>
        <span class="stat-wide-text">
          <span class="stat-wide-title">Tagihan bulan {{ billsMonth }}</span>
          <span class="stat-label">{{ summary.billsCount }} tagihan</span>
        </span>
        <span class="stat-amount">{{ formatRupiah(summary.billsTotal) }}</span>
      </button>
    </div>

    <section v-if="upcoming.length" class="ios-section">
      <div class="ios-section-head">
        <h2>30 hari ke depan</h2>
        <button class="text-btn" @click="emit('see-all')">Lihat semua</button>
      </div>
      <ul class="ios-list">
        <li v-for="it in upcoming" :key="it.id">
          <button class="ios-row" @click="emit('open', it)">
            <span class="app-glyph" :style="{ background: it.cat.color }"><AppIcon :name="it.cat.icon" :size="17" /></span>
            <span class="ios-row-main">
              <span class="ios-row-title">{{ it.name }}</span>
              <span class="ios-row-sub">{{ formatDate(it.due_date) }}<template v-if="it.amount != null"> · {{ formatRupiah(it.amount) }}</template></span>
            </span>
            <span class="tag" :class="it.days <= 7 ? 'tag-red' : it.days <= 14 ? 'tag-orange' : 'tag-gray'">{{ shortCountdown(it.days) }}</span>
          </button>
        </li>
      </ul>
    </section>
  </section>
</template>
