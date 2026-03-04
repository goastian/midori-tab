import es from './locales/es.js';
import en from './locales/en.js';
import pt from './locales/pt.js';
import fr from './locales/fr.js';
import de from './locales/de.js';
import ru from './locales/ru.js';
import zh from './locales/zh.js';
import ja from './locales/ja.js';
import it from './locales/it.js';

export const locales = { es, en, pt, fr, de, ru, zh, ja, it };

export const availableLanguages = [
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
];

export default locales;
