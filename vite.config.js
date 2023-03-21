import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import path from 'path';
import fs from 'fs';
import ADMZip from 'adm-zip';
import * as pkg from './package.json';
import progress from 'vite-plugin-progress';
import checker from 'vite-plugin-checker';

const isProd = process.env.NODE_ENV === 'production';

const prepareBuilds = () => ({
  name: 'prepareBuilds',
  buildEnd() {
    if (isProd) {
      // chrome
      fs.mkdirSync(path.resolve(__dirname, './build/chrome'), { recursive: true });
      fs.copyFileSync(
        path.resolve(__dirname, './manifest/chrome.json'),
        path.resolve(__dirname, './build/chrome/manifest.json'),
      );
      fs.copyFileSync(
        path.resolve(__dirname, './manifest/background-chrome.js'),
        path.resolve(__dirname, './build/chrome/background.js'),
      );
      fs.cpSync(
        path.resolve(__dirname, './manifest/_locales'),
        path.resolve(__dirname, './build/chrome/_locales'),
        {
          recursive: true,
        },
      );
      fs.cpSync(path.resolve(__dirname, './dist'), path.resolve(__dirname, './build/chrome/'), {
        recursive: true,
      });

      // firefox
      fs.mkdirSync(path.resolve(__dirname, './build/firefox'), { recursive: true });
      fs.copyFileSync(
        path.resolve(__dirname, './manifest/firefox.json'),
        path.resolve(__dirname, './build/firefox/manifest.json'),
      );
      fs.copyFileSync(
        path.resolve(__dirname, './manifest/background-firefox.js'),
        path.resolve(__dirname, './build/firefox/background.js'),
      );
      fs.cpSync(path.resolve(__dirname, './dist'), path.resolve(__dirname, './build/firefox/'), {
        recursive: true,
      });

      // create zip
      const zip = new ADMZip();
      zip.addLocalFolder(path.resolve(__dirname, './build/chrome'));
      zip.writeZip(path.resolve(__dirname, `./build/chrome-${pkg.version}.zip`));

      const zip2 = new ADMZip();
      zip2.addLocalFolder(path.resolve(__dirname, './build/firefox'));
      zip2.writeZip(path.resolve(__dirname, `./build/firefox-${pkg.version}.zip`));
    }
  },
});

export default defineConfig({
  plugins: [preact(), prepareBuilds(), progress()],
  server: {
    open: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
    },
  },
  build: {
    minify: isProd ? 'esbuild' : false,
    sourcemap: !isProd,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@mui')) {
              return 'vendor_mui';
            }

            return 'vendor';
          }
        },
      },
    },
  },
  alias: {
    react: 'preact/compat',
    'react-dom': 'preact/compat',
  },
  resolve: {
    extensions: ['.js', '.jsx'],
    alias: {
      components: path.resolve(__dirname, './src/components'),
      modules: path.resolve(__dirname, './src/modules'),
      translations: path.resolve(__dirname, './src/translations'),
      scss: path.resolve(__dirname, './src/scss')
    },
  },
});
