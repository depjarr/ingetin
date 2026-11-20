<script setup>
// Ikon aplikasi Ingetin: kartu dengan lonceng kecil, gaya ikon iPhone.
defineProps({ size: { type: Number, default: 64 } });
</script>

<template>
  <span class="brandmark" :style="{ width: `${size}px`, height: `${size}px`, borderRadius: `${size * 0.23}px` }" aria-hidden="true">
    <svg :width="size * 0.62" :height="size * 0.62" viewBox="0 0 40 40" fill="none">
      <rect x="4" y="9" width="26" height="19" rx="4" fill="#fff" opacity="0.45" transform="rotate(-8 17 18)" />
      <rect x="8" y="12" width="26" height="19" rx="4" fill="#fff" />
      <rect x="12" y="16" width="7" height="5" rx="1.5" fill="#F5C451" />
      <rect x="12" y="25" width="12" height="2.4" rx="1.2" fill="#007AFF" opacity="0.5" />
      <circle cx="31" cy="11" r="6" fill="#FF3B30" stroke="#fff" stroke-width="2" />
      <path d="M31 8.5v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="31" cy="13.6" r="0.9" fill="#fff" />
    </svg>
  </span>
</template>
