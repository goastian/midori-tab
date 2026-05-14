import { viteStaticCopy } from 'vite-plugin-static-copy'
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from 'path'
import { brotliCompressSync, gzipSync } from 'zlib'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { relative, join } from 'path'

import { APP_VERSION } from './version.config.js'

const SHOULD_ANALYZE_BUNDLE = process.env.ANALYZE_BUNDLE === '1';

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

function classifyBundleFile(fileName) {
  if (fileName === 'background.js') return 'background';
  if (fileName === 'omni-content.js') return 'content-script';
  if (fileName === 'index.js') return 'index';
  if (fileName === 'vendor.js' || /^assets\/vendor-.*\.js$/.test(fileName)) return 'vendor';
  if (fileName.endsWith('.css')) return 'css';
  if (/Widget|widgets/i.test(fileName)) return 'widget-chunk';
  if (fileName.endsWith('.js')) return 'chunk';
  return 'asset';
}

function walkFiles(dir, baseDir = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(fullPath, baseDir);
    return [relative(baseDir, fullPath).replace(/\\/g, '/')];
  });
}

function createBundleAnalyzerPlugin() {
  let rollupBundle = [];

  return {
    name: 'midori-bundle-analyzer',
    apply: 'build',
    generateBundle(_options, bundle) {
      rollupBundle = Object.entries(bundle).map(([fileName, item]) => {
        const content = item.type === 'chunk' ? item.code : item.source;
        const bytes = Buffer.byteLength(typeof content === 'string' ? content : Buffer.from(content || ''));

        return {
          fileName,
          type: item.type,
          category: classifyBundleFile(fileName),
          bytes,
          gzipBytes: gzipSync(typeof content === 'string' ? content : Buffer.from(content || '')).length,
          brotliBytes: brotliCompressSync(typeof content === 'string' ? content : Buffer.from(content || '')).length,
          imports: item.type === 'chunk' ? item.imports : [],
          dynamicImports: item.type === 'chunk' ? item.dynamicImports : [],
          modules: item.type === 'chunk' ? Object.keys(item.modules) : [],
          isEntry: item.type === 'chunk' ? item.isEntry : false,
        };
      });
    },
    closeBundle() {
      const outDir = resolve(__dirname, 'dist');
      const files = walkFiles(outDir)
        .filter((fileName) => !fileName.startsWith('bundle-analysis'))
        .map((fileName) => {
          const fullPath = join(outDir, fileName);
          const content = readFileSync(fullPath);
          return {
            fileName,
            category: classifyBundleFile(fileName),
            bytes: statSync(fullPath).size,
            gzipBytes: gzipSync(content).length,
            brotliBytes: brotliCompressSync(content).length,
            raw: formatBytes(statSync(fullPath).size),
            gzip: formatBytes(gzipSync(content).length),
            brotli: formatBytes(brotliCompressSync(content).length),
          };
        })
        .sort((a, b) => b.bytes - a.bytes);

      const totals = files.reduce((acc, file) => {
        acc.bytes += file.bytes;
        acc.gzipBytes += file.gzipBytes;
        acc.brotliBytes += file.brotliBytes;
        return acc;
      }, { bytes: 0, gzipBytes: 0, brotliBytes: 0 });

      const payload = {
        generatedAt: new Date().toISOString(),
        command: 'npm run analyze:bundle',
        outDir: 'dist',
        totals: {
          ...totals,
          raw: formatBytes(totals.bytes),
          gzip: formatBytes(totals.gzipBytes),
          brotli: formatBytes(totals.brotliBytes),
        },
        files,
        byCategory: Object.values(files.reduce((acc, file) => {
          acc[file.category] ||= {
            category: file.category,
            bytes: 0,
            gzipBytes: 0,
            brotliBytes: 0,
            count: 0,
          };
          acc[file.category].bytes += file.bytes;
          acc[file.category].gzipBytes += file.gzipBytes;
          acc[file.category].brotliBytes += file.brotliBytes;
          acc[file.category].count += 1;
          return acc;
        }, {})).map((category) => ({
          ...category,
          raw: formatBytes(category.bytes),
          gzip: formatBytes(category.gzipBytes),
          brotli: formatBytes(category.brotliBytes),
        })),
      };

      writeFileSync(join(outDir, 'bundle-analysis.json'), `${JSON.stringify(payload, null, 2)}\n`);
      writeFileSync(join(outDir, 'bundle-analysis.rollup.json'), `${JSON.stringify(rollupBundle, null, 2)}\n`);
    },
  };
}

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
          src: 'shared/omni-ui.shared.json',
          dest: '.'
        }
      ]
    }),
    SHOULD_ANALYZE_BUNDLE && createBundleAnalyzerPlugin(),
  ],
  define: {
    'process.env': {},
    __MIDORI_APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: {
    target: 'es2022',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_debugger: true,
        passes: 2,
      },
    },
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: '[name].js',
        manualChunks: {
          vendor: ['vue', 'pinia', 'pinia-plugin-persistedstate'],
        },
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  }
});
