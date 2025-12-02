<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isOpen" class="shortcuts-overlay" @click="close">
        <div class="shortcuts-panel" @click.stop>
          <div class="shortcuts-header">
            <h2>⌨️ Atajos de Teclado</h2>
            <button @click="close" class="close-btn">✕</button>
          </div>
          
          <div class="shortcuts-content">
            <div class="shortcuts-section">
              <h3>General</h3>
              <div class="tip-box">
                💡 <strong>Todos los atajos son personalizables</strong> desde Configuración → Atajos
              </div>
              <div class="shortcut-item">
                <div class="shortcut-keys">
                  <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Space</kbd>
                </div>
                <div class="shortcut-description">Abrir paleta de comandos (predeterminado)</div>
              </div>
              <div class="shortcut-item">
                <div class="shortcut-keys">
                  <kbd>Ctrl</kbd> + <kbd>,</kbd>
                </div>
                <div class="shortcut-description">Abrir configuración</div>
              </div>
              <div class="shortcut-item">
                <div class="shortcut-keys">
                  <kbd>ESC</kbd>
                </div>
                <div class="shortcut-description">Cerrar diálogos</div>
              </div>
            </div>

            <div class="shortcuts-section">
              <h3>Navegación en Paleta de Comandos</h3>
              <div class="shortcut-item">
                <div class="shortcut-keys">
                  <kbd>↑</kbd> / <kbd>↓</kbd>
                </div>
                <div class="shortcut-description">Navegar entre resultados</div>
              </div>
              <div class="shortcut-item">
                <div class="shortcut-keys">
                  <kbd>Enter</kbd>
                </div>
                <div class="shortcut-description">Ejecutar comando seleccionado</div>
              </div>
            </div>

            <div class="shortcuts-section">
              <h3>Comandos Rápidos</h3>
              <div class="commands-grid">
                <div class="command-example">
                  <span class="command-name">notion</span>
                  <span class="command-desc">Abrir Notion</span>
                </div>
                <div class="command-example">
                  <span class="command-name">asana</span>
                  <span class="command-desc">Abrir Asana</span>
                </div>
                <div class="command-example">
                  <span class="command-name">github</span>
                  <span class="command-desc">Abrir GitHub</span>
                </div>
                <div class="command-example">
                  <span class="command-name">gmail</span>
                  <span class="command-desc">Abrir Gmail</span>
                </div>
                <div class="command-example">
                  <span class="command-name">figma</span>
                  <span class="command-desc">Abrir Figma</span>
                </div>
                <div class="command-example">
                  <span class="command-name">slack</span>
                  <span class="command-desc">Abrir Slack</span>
                </div>
              </div>
              <p class="tip">💡 Escribe cualquier nombre de app en la paleta de comandos para abrirla rápidamente</p>
            </div>

            <div class="shortcuts-section">
              <h3>Búsqueda Avanzada</h3>
              <p class="feature-desc">
                La paleta de comandos busca automáticamente en:
              </p>
              <ul class="feature-list">
                <li>📝 Comandos predefinidos</li>
                <li>⭐ Marcadores guardados</li>
                <li>🗂️ Pestañas abiertas</li>
                <li>🕐 Historial de navegación</li>
              </ul>
            </div>
          </div>

          <div class="shortcuts-footer">
            <p>Presiona <kbd>?</kbd> en cualquier momento para ver esta ayuda</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { ref } from 'vue';

export default {
  name: 'KeyboardShortcutsHelp',
  setup() {
    const isOpen = ref(false);

    const open = () => {
      isOpen.value = true;
    };

    const close = () => {
      isOpen.value = false;
    };

    const toggle = () => {
      isOpen.value = !isOpen.value;
    };

    return {
      isOpen,
      open,
      close,
      toggle,
    };
  },
};
</script>

<style scoped>
.shortcuts-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 2rem;
}

.shortcuts-panel {
  background: var(--bg-glass, rgba(255, 255, 255, 0.1));
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  max-width: 800px;
  width: 100%;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.shortcuts-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 2rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
}

.shortcuts-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-color, white);
}

.close-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--text-color, white);
  width: 32px;
  height: 32px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.shortcuts-content {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
}

.shortcuts-section {
  margin-bottom: 2rem;
}

.shortcuts-section h3 {
  font-size: 1.1rem;
  color: var(--text-color, white);
  margin-bottom: 1rem;
  opacity: 0.9;
}

.tip-box {
  background: rgba(59, 130, 246, 0.15);
  border-left: 3px solid #3b82f6;
  padding: 0.8rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  color: var(--text-color, white);
  font-size: 0.9rem;
}

.shortcut-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.8rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  margin-bottom: 0.5rem;
  transition: all 0.2s ease;
}

.shortcut-item:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateX(4px);
}

.shortcut-keys {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  color: var(--text-color, white);
  font-weight: 500;
}

.shortcut-description {
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
}

kbd {
  padding: 0.3rem 0.6rem;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  font-size: 0.85rem;
  color: var(--text-color, white);
  font-family: monospace;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.commands-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.8rem;
  margin-bottom: 1rem;
}

.command-example {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.8rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.command-name {
  font-family: monospace;
  color: #60a5fa;
  font-weight: 600;
  font-size: 0.9rem;
}

.command-desc {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.85rem;
}

.tip {
  background: rgba(59, 130, 246, 0.2);
  border-left: 3px solid #3b82f6;
  padding: 0.8rem 1rem;
  border-radius: 6px;
  color: var(--text-color, white);
  font-size: 0.9rem;
  margin: 0;
}

.feature-desc {
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 0.8rem;
}

.feature-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.feature-list li {
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  margin-bottom: 0.5rem;
  color: var(--text-color, white);
}

.shortcuts-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 1rem 2rem;
  background: rgba(255, 255, 255, 0.03);
  text-align: center;
}

.shortcuts-footer p {
  margin: 0;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.9rem;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Scrollbar */
.shortcuts-content::-webkit-scrollbar {
  width: 8px;
}

.shortcuts-content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.shortcuts-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.shortcuts-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}
</style>
