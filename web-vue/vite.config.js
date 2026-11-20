import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  base: "./", // supaya tetap jalan kalau di-hosting di sub-folder (mis. GitHub Pages)
});
