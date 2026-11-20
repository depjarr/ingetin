<script setup>
// Kalender bulanan gaya iPhone. Tagihan/dokumen berulang ikut muncul di bulan-bulan berikutnya (sebagai perkiraan).
import { ref, computed } from "vue";
import { motion, AnimatePresence } from "motion-v";
import {
  monthGrid, monthTitle, eventsByDay, longDate, todayISO, parseISO, daysUntil, shortCountdown,
  formatRupiah, REPEAT_LABEL, HARI_PENDEK,
} from "../lib/dates";
import { categorize } from "../lib/categories";
import AppIcon from "./AppIcon.vue";

const props = defineProps({ items: { type: Array, required: true } });
const emit = defineEmits(["open", "add-on"]);

const now = parseISO(todayISO());
const year = ref(now.getFullYear());
const month = ref(now.getMonth());
const selected = ref(todayISO());
const dir = ref(1);

const grid = computed(() => monthGrid(year.value, month.value));
const range = computed(() => [grid.value[0].iso, grid.value[41].iso]);
const events = computed(() => eventsByDay(props.items, range.value[0], range.value[1]));
const monthKey = computed(() => `${year.value}-${month.value}`);

const dayEvents = computed(() =>
  (events.value[selected.value] ?? [])
    .map((e) => ({ ...e, cat: categorize(e.item) }))
    .sort((a, b) => Number(a.projected) - Number(b.projected)),
);

const monthCount = computed(() =>
  grid.value.filter((c) => c.inMonth).reduce((n, c) => n + (events.value[c.iso]?.length ?? 0), 0),
);

function shift(step) {
  dir.value = step;
  const d = new Date(year.value, month.value + step, 1);
  year.value = d.getFullYear();
  month.value = d.getMonth();
}

function goToday() {
  dir.value = selected.value > todayISO() ? -1 : 1;
  year.value = now.getFullYear();
  month.value = now.getMonth();
  selected.value = todayISO();
}

function pick(cell) {
  selected.value = cell.iso;
  if (!cell.inMonth) shift(cell.iso < `${year.value}-${String(month.value + 1).padStart(2, "0")}-01` ? -1 : 1);
}

function onDragEnd(_e, info) {
  if (info.offset.x < -60 || info.velocity.x < -450) shift(1);
  else if (info.offset.x > 60 || info.velocity.x > 450) shift(-1);
}

function dotsFor(iso) {
  return (events.value[iso] ?? []).slice(0, 3).map((e) => ({ color: categorize(e.item).color, projected: e.projected }));
}

function sub(e) {
  const parts = [e.cat.label];
  if (e.item.amount != null) parts.push(formatRupiah(e.item.amount));
  return parts.join(" · ");
}
</script>

<template>
  <section class="cal">
    <header class="cal-head">
      <h1 class="large-title">{{ monthTitle(year, month) }}</h1>
      <div class="cal-nav">
        <button class="pill-btn" @click="goToday">Hari ini</button>
        <button class="round-btn" aria-label="Bulan sebelumnya" @click="shift(-1)"><AppIcon name="chevron-left" :size="18" /></button>
        <button class="round-btn" aria-label="Bulan berikutnya" @click="shift(1)"><AppIcon name="chevron-right" :size="18" /></button>
      </div>
    </header>
    <p class="cal-sub">{{ monthCount ? `${monthCount} jadwal bulan ini` : 'Belum ada jadwal bulan ini' }}. Geser kalender untuk pindah bulan.</p>

    <div class="cal-card">
      <div class="cal-week" aria-hidden="true">
        <span v-for="h in HARI_PENDEK" :key="h">{{ h }}</span>
      </div>
      <AnimatePresence mode="wait" :initial="false">
        <motion.div
          :key="monthKey"
          class="cal-grid"
          role="grid"
          :aria-label="monthTitle(year, month)"
          :initial="{ x: dir * 48, opacity: 0 }"
          :animate="{ x: 0, opacity: 1 }"
          :exit="{ x: dir * -48, opacity: 0 }"
          :transition="{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }"
          drag="x"
          :drag-snap-to-origin="true"
          :drag-elastic="0.25"
          @drag-end="onDragEnd"
        >
          <button
            v-for="c in grid"
            :key="c.iso"
            role="gridcell"
            class="cal-cell"
            :class="{ out: !c.inMonth, today: c.isToday, sel: c.iso === selected }"
            :aria-selected="c.iso === selected"
            :aria-label="`${longDate(c.iso)}${events[c.iso] ? `, ${events[c.iso].length} jadwal` : ''}`"
            @click="pick(c)"
          >
            <span class="cal-num">{{ c.day }}</span>
            <span class="cal-dots">
              <span
                v-for="(d, k) in dotsFor(c.iso)"
                :key="k"
                class="cal-dot"
                :class="{ ghost: d.projected }"
                :style="{ '--dot': d.color }"
              />
            </span>
            <span class="cal-chips">
              <span
                v-for="e in (events[c.iso] ?? []).slice(0, 2)"
                :key="e.item.id"
                class="cal-chip"
                :class="{ ghost: e.projected }"
                :style="{ '--dot': categorize(e.item).color }"
              >{{ e.item.name }}</span>
            </span>
          </button>
        </motion.div>
      </AnimatePresence>
    </div>

    <section class="agenda">
      <h2 class="agenda-title">{{ longDate(selected) }}</h2>
      <AnimatePresence mode="wait">
        <motion.ul
          v-if="dayEvents.length"
          :key="selected"
          class="ios-list"
          :initial="{ opacity: 0, y: 8 }"
          :animate="{ opacity: 1, y: 0 }"
          :exit="{ opacity: 0 }"
          :transition="{ duration: 0.18 }"
        >
          <li v-for="e in dayEvents" :key="e.item.id">
            <button class="ios-row" @click="emit('open', e.item)">
              <span class="app-glyph" :style="{ background: e.cat.color }"><AppIcon :name="e.cat.icon" :size="17" /></span>
              <span class="ios-row-main">
                <span class="ios-row-title">{{ e.item.name }}</span>
                <span class="ios-row-sub">
                  {{ sub(e) }}
                  <template v-if="e.projected"><br>Perkiraan berikutnya ({{ REPEAT_LABEL[e.item.repeat].toLowerCase() }})</template>
                </span>
              </span>
              <span v-if="!e.projected" class="tag" :class="daysUntil(e.item.due_date) <= 7 ? 'tag-red' : 'tag-gray'">{{ shortCountdown(daysUntil(e.item.due_date)) }}</span>
              <AppIcon name="chevron-right" :size="16" class="ios-chevron" />
            </button>
          </li>
        </motion.ul>
        <motion.div
          v-else
          :key="`empty-${selected}`"
          class="agenda-empty"
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1 }"
          :exit="{ opacity: 0 }"
        >
          <p>Tidak ada jadwal di tanggal ini.</p>
          <button class="pill-btn tinted" @click="emit('add-on', selected)"><AppIcon name="plus" :size="16" /> Tambah pengingat di tanggal ini</button>
        </motion.div>
      </AnimatePresence>
    </section>
  </section>
</template>
