<script setup>
// Tab bar gaya iPhone: ikon + label selalu terlihat, tombol Tambah di tengah.
import { motion } from "motion-v";
import AppIcon from "./AppIcon.vue";

defineProps({ modelValue: { type: String, required: true } });
const emit = defineEmits(["update:modelValue", "add"]);

const LEFT = [
  { id: "home", label: "Beranda", icon: "home" },
  { id: "calendar", label: "Kalender", icon: "calendar" },
];
const RIGHT = [
  { id: "list", label: "Daftar", icon: "list" },
  { id: "chat", label: "Asisten", icon: "spark" },
];
</script>

<template>
  <nav class="tabbar" aria-label="Menu utama">
    <template v-for="group in [LEFT, null, RIGHT]" :key="group ? group[0].id : 'add'">
      <template v-if="group">
        <button
          v-for="t in group"
          :key="t.id"
          class="tab"
          :class="{ on: modelValue === t.id }"
          :aria-current="modelValue === t.id ? 'page' : undefined"
          @click="emit('update:modelValue', t.id)"
        >
          <motion.span
            v-if="modelValue === t.id"
            layout-id="tab-pill"
            class="tab-pill"
            :transition="{ type: 'spring', stiffness: 520, damping: 40 }"
          />
          <AppIcon :name="t.icon" :size="22" />
          <span class="tab-label">{{ t.label }}</span>
        </button>
      </template>
      <motion.button
        v-else
        class="tab-add"
        aria-label="Tambah pengingat"
        :while-press="{ scale: 0.9 }"
        :transition="{ type: 'spring', stiffness: 600, damping: 30 }"
        @click="emit('add')"
      >
        <AppIcon name="plus" :size="26" />
      </motion.button>
    </template>
  </nav>
</template>
