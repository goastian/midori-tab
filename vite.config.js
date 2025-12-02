import { viteStaticCopy } from 'vite-plugin-static-copy'
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
        }
      ]
    })
  ],
  define: {
    'process.env': {},
  },
  build: {
    minify: 'esbuild',
    rollupOptions: {
      input: {
        background: 'src/background.js',
        'content-script': 'src/content-script.js',
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