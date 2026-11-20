<script setup>
// Lapisan UI global: banner notifikasi (atas), alert (tengah), action sheet (bawah). Dipasang sekali di App.vue.
import { onMounted, onUnmounted } from "vue";
import { motion, AnimatePresence } from "motion-v";
import { ui, dismissBanner, holdBanner, closeAlert, closeSheet } from "../lib/ui";
import AppIcon from "./AppIcon.vue";

function tapBanner(b) {
  dismissBanner(b.id);
  b.onTap?.();
}

function onBannerDragEnd(b, _e, info) {
  // Geser ke atas (atau lempar ke atas) = tutup, seperti di iPhone
  if (info.offset.y < -24 || info.velocity.y < -300) dismissBanner(b.id);
}

function onKey(e) {
  if (e.key !== "Escape") return;
  if (ui.alert) closeAlert(false);
  else if (ui.sheet) closeSheet(null);
}
onMounted(() => window.addEventListener("keydown", onKey));
onUnmounted(() => window.removeEventListener("keydown", onKey));

const SPRING = { type: "spring", stiffness: 420, damping: 32, mass: 0.9 };
</script>

<template>
  <Teleport to="body">
    <!-- Banner notifikasi -->
    <div class="banners" aria-live="polite">
      <AnimatePresence>
        <motion.div
          v-for="(b, i) in ui.banners"
          :key="b.id"
          layout
          class="banner-ios"
          role="status"
          :style="{ zIndex: 100 - i }"
          :initial="{ y: -110, scale: 0.92, opacity: 0 }"
          :animate="{ y: 0, scale: 1, opacity: 1 }"
          :exit="{ y: -110, scale: 0.92, opacity: 0, transition: { duration: 0.25 } }"
          :transition="SPRING"
          drag="y"
          :drag-constraints="{ top: 0, bottom: 0 }"
          :drag-elastic="{ top: 0.7, bottom: 0.08 }"
          @drag-start="holdBanner(b.id)"
          @drag-end="(e, info) => onBannerDragEnd(b, e, info)"
        >
          <button class="banner-hit" @click="tapBanner(b)">
            <span class="app-glyph" :style="{ background: b.color }"><AppIcon :name="b.icon" :size="18" /></span>
            <span class="banner-text">
              <span class="banner-top"><span>Ingetin</span><span>sekarang</span></span>
              <strong>{{ b.title }}</strong>
              <span v-if="b.body" class="banner-body">{{ b.body }}</span>
            </span>
          </button>
          <button class="nc-x banner-x" aria-label="Tutup notifikasi" @click="dismissBanner(b.id)"><AppIcon name="x" :size="12" /></button>
        </motion.div>
      </AnimatePresence>
    </div>

    <!-- Alert tengah -->
    <AnimatePresence>
      <motion.div
        v-if="ui.alert"
        key="alert-bg"
        class="alert-backdrop"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.18 }"
      />
      <motion.div
        v-if="ui.alert"
        key="alert"
        class="alert-ios"
        role="alertdialog"
        aria-modal="true"
        :aria-label="ui.alert.title"
        :initial="{ scale: 1.15, opacity: 0 }"
        :animate="{ scale: 1, opacity: 1 }"
        :exit="{ scale: 0.95, opacity: 0, transition: { duration: 0.15 } }"
        :transition="{ type: 'spring', stiffness: 500, damping: 34 }"
      >
        <div class="alert-body">
          <strong>{{ ui.alert.title }}</strong>
          <p v-if="ui.alert.message">{{ ui.alert.message }}</p>
        </div>
        <div class="alert-actions" :class="{ single: !ui.alert.cancelText }">
          <button v-if="ui.alert.cancelText" @click="closeAlert(false)">{{ ui.alert.cancelText }}</button>
          <button class="strong" :class="{ destructive: ui.alert.destructive }" @click="closeAlert(true)">{{ ui.alert.confirmText }}</button>
        </div>
      </motion.div>
    </AnimatePresence>

    <!-- Action sheet -->
    <AnimatePresence>
      <motion.div
        v-if="ui.sheet"
        key="sheet-bg"
        class="alert-backdrop"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        @click="closeSheet(null)"
      />
      <motion.div
        v-if="ui.sheet"
        key="action-sheet"
        class="action-sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="ui.sheet.title || 'Pilihan'"
        :initial="{ y: '110%' }"
        :animate="{ y: 0 }"
        :exit="{ y: '110%' }"
        :transition="{ type: 'spring', stiffness: 420, damping: 38 }"
      >
        <div class="as-group">
          <div v-if="ui.sheet.title || ui.sheet.message" class="as-head">
            <strong v-if="ui.sheet.title">{{ ui.sheet.title }}</strong>
            <span v-if="ui.sheet.message">{{ ui.sheet.message }}</span>
          </div>
          <button
            v-for="a in ui.sheet.actions"
            :key="a.value"
            class="as-btn"
            :class="{ destructive: a.destructive }"
            @click="closeSheet(a.value)"
          >
            <span v-if="a.icon" class="app-glyph small" :style="{ background: a.color || '#007AFF' }"><AppIcon :name="a.icon" :size="16" /></span>
            <span class="as-label">
              {{ a.label }}
              <small v-if="a.hint">{{ a.hint }}</small>
            </span>
          </button>
        </div>
        <button class="as-btn as-cancel" @click="closeSheet(null)">Batal</button>
      </motion.div>
    </AnimatePresence>
  </Teleport>
</template>
