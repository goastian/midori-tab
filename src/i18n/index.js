export const DEFAULT_LOCALE = 'en';

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

export const localeLoaders = {
  en: () => import('./locales/en.js'),
  es: () => import('./locales/es.js'),
  pt: () => import('./locales/pt.js'),
  fr: () => import('./locales/fr.js'),
  de: () => import('./locales/de.js'),
  ru: () => import('./locales/ru.js'),
  zh: () => import('./locales/zh.js'),
  ja: () => import('./locales/ja.js'),
  it: () => import('./locales/it.js'),
};

// Load the initial language before mounting the UI. Keeping every locale,
// including English, async removes translations from the New Tab critical path.
export const locales = {};

export function normalizeLocale(code) {
  return String(code || '').trim().toLowerCase().split('-')[0];
}

export function isLocaleSupported(code) {
  return Object.prototype.hasOwnProperty.call(localeLoaders, normalizeLocale(code));
}

export async function loadLocaleMessages(code) {
  const normalized = isLocaleSupported(code) ? normalizeLocale(code) : DEFAULT_LOCALE;
  if (locales[normalized]) return { code: normalized, messages: locales[normalized] };

  const mod = await localeLoaders[normalized]();
  const messages = mod.default || mod;
  locales[normalized] = messages;
  return { code: normalized, messages };
}

export default locales;
