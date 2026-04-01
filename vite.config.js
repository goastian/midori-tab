import { viteStaticCopy } from 'vite-plugin-static-copy'
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from 'path'

import { APP_VERSION } from './version.config.js'

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
    __MIDORI_APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: {
    minify: 'esbuild',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
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
