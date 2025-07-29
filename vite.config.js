import { viteStaticCopy } from 'vite-plugin-static-copy'
import webExtension from 'vite-plugin-web-extension'
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    viteStaticCopy({
      targets: [
        {
          src: 'manifest/manifest.json',
          dest: '.'
        },
        {
          src: 'src/background.js',
          dest: '.'
        }
      ]
    })
  ],
  define: {
    'process.env': {}
  },
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: '[name].js'
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext'
  }
});