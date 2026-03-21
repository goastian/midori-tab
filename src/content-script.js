// Content Script (Stub) — Se inyecta en TODAS las páginas web
// Mínimo footprint: solo escucha mensajes y carga la paleta bajo demanda
// La lógica completa está en content-script-palette.js

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

let paletteModule = null;
let paletteLoadingPromise = null;

// Cargar la paleta bajo demanda (lazy load)
async function loadPalette() {
  if (!paletteModule) {
    try {
      if (!paletteLoadingPromise) {
        paletteLoadingPromise = import(
        /* webpackChunkName: "palette" */
        browserAPI.runtime.getURL('content-script-palette.js')
        );
      }
      paletteModule = await paletteLoadingPromise;
    } catch (e) {
      // Fallback: inyectar el script directamente
      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = browserAPI.runtime.getURL('content-script-palette.js');
        script.type = 'module';
        script.onload = () => {
          paletteModule = window.__midoriPalette || { toggleCommandPalette: () => {} };
          resolve();
        };
        script.onerror = () => resolve();
        document.head.appendChild(script);
      });
    }
  }
}

// Toggle con carga lazy
async function togglePalette() {
  await loadPalette();
  if (paletteModule && paletteModule.toggleCommandPalette) {
    paletteModule.toggleCommandPalette();
  }
}

function isCommandPaletteShortcut(e) {
  if (!e) return false;
  if (!e.ctrlKey || !e.altKey) return false;
  if (e.shiftKey || e.metaKey) return false;
  if (e.code === 'Space') return true;
  return e.key === ' ' || e.key === 'Spacebar';
}

function onKeydown(e) {
  if (e.repeat) return;
  if (!isCommandPaletteShortcut(e)) return;
  e.preventDefault();
  e.stopPropagation();
  togglePalette();
}

window.addEventListener('keydown', onKeydown, true);

// Escuchar mensajes del background (desde comando del navegador)
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOGGLE_COMMAND_PALETTE') {
    togglePalette().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'PING') {
    sendResponse({ success: true, loaded: true });
    return true;
  }
});
