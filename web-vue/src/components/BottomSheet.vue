<script setup>
// Bottom sheet dengan animasi Motion. Pakai v-model:open.
import { watch, onUnmounted } from "vue";
import { motion, AnimatePresence } from "motion-v";

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: "" },
  label: { type: String, default: "" }, // aria-label kalau title kosong
});
const emit = defineEmits(["update:open"]);

const close = () => emit("update:open", false);
const onKey = (e) => { if (e.key === "Escape") close(); };

watch(() => props.open, (open) => {
  document.body.style.overflow = open ? "hidden" : "";
  if (open) window.addEventListener("keydown", onKey);
  else window.removeEventListener("keydown", onKey);
});
onUnmounted(() => {
  document.body.style.overflow = "";
  window.removeEventListener("keydown", onKey);
});
</script>

<template>
  <Teleport to="body">
    <AnimatePresence>
      <motion.div
        v-if="open"
        key="backdrop"
        class="sheet-backdrop"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.2 }"
        @click="close"
      />
      <motion.section
        v-if="open"
        key="sheet"
        class="sheet"
        role="dialog"
        aria-modal="true"
        :aria-label="title || label"
        :initial="{ y: '100%' }"
        :animate="{ y: 0 }"
        :exit="{ y: '100%' }"
        :transition="{ type: 'spring', stiffness: 380, damping: 36 }"
      >
        <div class="sheet-grip" aria-hidden="true" />
        <header v-if="title" class="sheet-head">
          <h2>{{ title }}</h2>
          <button class="icon-btn" aria-label="Tutup" @click="close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <slot />
      </motion.section>
    </AnimatePresence>
  </Teleport>
</template>
