export function useKeyboardShortcuts(shortcuts) {
  
  const handleKeyDown = (event) => {
    
    // Verificar si el usuario está escribiendo en un input
    const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
    
    for (const shortcut of shortcuts) {
      const { key, ctrl, meta, shift, alt, callback, allowInInput } = shortcut;
      
      // Si está escribiendo y el atajo no permite input, skip
      if (isTyping && !allowInInput) {
        continue;
      }
      
      // Verificar si la tecla principal coincide
      const keyMatch = event.key.toLowerCase() === key.toLowerCase();
      
      // Verificar modificadores - deben coincidir EXACTAMENTE
      const ctrlPressed = event.ctrlKey || event.metaKey;
      const altPressed = event.altKey;
      const shiftPressed = event.shiftKey;
      
      // El atajo requiere estos modificadores
      const needsCtrl = ctrl || false;
      const needsAlt = alt || false;
      const needsShift = shift || false;
      
      // Deben coincidir exactamente
      const ctrlMatch = ctrlPressed === needsCtrl;
      const altMatch = altPressed === needsAlt;
      const shiftMatch = shiftPressed === needsShift;
      
      const shortcutMatch = keyMatch && ctrlMatch && altMatch && shiftMatch;
      
      if (shortcutMatch) {
        event.preventDefault();
        shortcut.callback(event);
        break;
      }
    }
  };

  // Registrar el listener INMEDIATAMENTE (no esperar a onMounted)
  window.addEventListener('keydown', handleKeyDown);

  // Retornar función para cleanup
  return {
    handleKeyDown,
    cleanup: () => {
      window.removeEventListener('keydown', handleKeyDown);
    }
  };
}

// Atajos predefinidos del sistema
export const defaultShortcuts = {
  COMMAND_PALETTE: { key: 'k', ctrl: true, description: 'Abrir paleta de comandos' },
  SETTINGS: { key: ',', ctrl: true, description: 'Abrir configuración' },
  SEARCH: { key: '/', description: 'Enfocar búsqueda' },
  NEW_TAB: { key: 't', ctrl: true, description: 'Nueva pestaña' },
  CLOSE_TAB: { key: 'w', ctrl: true, description: 'Cerrar pestaña' },
  NEXT_TAB: { key: 'Tab', ctrl: true, description: 'Siguiente pestaña' },
  PREV_TAB: { key: 'Tab', ctrl: true, shift: true, description: 'Pestaña anterior' },
  RELOAD: { key: 'r', ctrl: true, description: 'Recargar página' },
  BOOKMARK: { key: 'd', ctrl: true, description: 'Agregar marcador' },
  HISTORY: { key: 'h', ctrl: true, description: 'Ver historial' },
  DOWNLOADS: { key: 'j', ctrl: true, description: 'Ver descargas' },
};

// Helper para formatear atajos para mostrar
export function formatShortcut(shortcut) {
  const parts = [];
  
  if (shortcut.ctrl || shortcut.meta) {
    parts.push(navigator.platform.includes('Mac') ? '⌘' : 'Ctrl');
  }
  if (shortcut.shift) parts.push('⇧');
  if (shortcut.alt) parts.push(navigator.platform.includes('Mac') ? '⌥' : 'Alt');
  
  parts.push(shortcut.key.toUpperCase());
  
  return parts.join(' + ');
}
