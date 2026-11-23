const SNAPSHOT_PREFIX = 'ads:creative:visible:v1:';
export const AD_CREATIVE_FIELDS = ['ad_id', 'format_id', 'placement', 'channel', 'interaction_contract', 'bookmark_key',
  'icon_url', 'image_url', 'bookmark_url', 'title', 'description', 'cta', 'disclosure_required', 'sponsor_label', 'locale'];
export const SESSION_DISMISS_KEY = 'ads:newtab:dismissed';

export function adsApiBase() {
  return String(import.meta.env?.VITE_ADS_API_BASE || 'https://ads.astian.org').trim().replace(/\/+$/, '');
}

export function detectDeviceType() {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = String(navigator.userAgent || '').toLowerCase();
  if (/ipad|tablet|playbook|silk|kindle/.test(ua) || (/android/.test(ua) && !/mobile/.test(ua)) || (/macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'tablet';
  if (/mobile|iphone|android.+mobile|ipod/.test(ua)) return 'mobile';
  return 'desktop';
}

export function detectLanguage() {
  return String(globalThis.navigator?.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
}

export function readDismissed() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(SESSION_DISMISS_KEY) || '[]');
    return new Set(Array.isArray(stored) ? stored : []);
  } catch (_) { return new Set(); }
}

export function creativeContent(data, baseUrl) {
  if (!data || data.creative_contract !== 'ads-creative-v1' || !/^[a-f0-9]{64}$/.test(data.creative_version || '')) return null;
  if (!Number.isSafeInteger(data.ad_id) || data.ad_id <= 0 || data.format_id !== 'newtab_icon_v1' || data.channel !== 'midori_tab' || data.placement !== 'new_tab') return null;
  if (typeof data.title !== 'string' || !data.title.trim() || data.title.length > 120 || typeof data.disclosure_required !== 'boolean') return null;
  if (data.disclosure_required ? typeof data.sponsor_label !== 'string' || !data.sponsor_label.trim() || data.sponsor_label.length > 80 : data.sponsor_label !== null) return null;
  try {
    const base = new URL(baseUrl);
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) return null;
    for (const url of [data.icon_url, data.image_url]) if (new URL(url).origin !== base.origin) return null;
  } catch (_) { return null; }
  return { ...Object.fromEntries(AD_CREATIVE_FIELDS.filter(key => Object.hasOwn(data, key)).map(key => [key, data[key]])),
    creative_contract: data.creative_contract, creative_version: data.creative_version, creative_preview: true };
}

function snapshotKey({ baseUrl = adsApiBase(), device_type = detectDeviceType(), language = detectLanguage(), bookmark_key = '' } = {}) {
  return `${SNAPSHOT_PREFIX}${baseUrl}:${device_type}:${String(language).toLowerCase().startsWith('es') ? 'es' : 'en'}${bookmark_key ? `:${bookmark_key}` : ''}`;
}

export function readCreativeSnapshot(context = {}) {
  try {
    const creative = creativeContent(JSON.parse(localStorage.getItem(snapshotKey(context))), context.baseUrl || adsApiBase());
    return creative && !readDismissed().has(String(creative.ad_id)) ? creative : null;
  } catch (_) { return null; }
}

export function writeCreativeSnapshot(context, data) {
  const creative = creativeContent(data, context.baseUrl);
  if (!creative) return;
  const { creative_preview, ...stored } = creative;
  try { localStorage.setItem(snapshotKey(context), JSON.stringify(stored)); } catch (_) { }
}

export function clearCreativeSnapshot(context) {
  try { localStorage.removeItem(snapshotKey(context)); } catch (_) { }
}
