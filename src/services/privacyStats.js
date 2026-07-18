const FIREFOX_PRIVACY_ID = 'midori-protection@astian.org';
const CHROMIUM_PRIVACY_ID = 'pimgloaejdgobcgjahbgippfilfdpcfa';

let cachedExtensionId = '';

function runtimeProtocol() {
  try {
    const runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime;
    return new URL(runtime?.getURL?.('') || '').protocol;
  } catch {
    return '';
  }
}

export function getPrivacyExtensionCandidates(protocol = runtimeProtocol()) {
  return protocol === 'moz-extension:'
    ? [FIREFOX_PRIVACY_ID, CHROMIUM_PRIVACY_ID]
    : [CHROMIUM_PRIVACY_ID, FIREFOX_PRIVACY_ID];
}

function sendToExtension(extensionId, message) {
  return new Promise((resolve) => {
    try {
      if (runtimeProtocol() === 'moz-extension:' && globalThis.browser?.runtime?.sendMessage) {
        globalThis.browser.runtime.sendMessage(extensionId, message)
          .then(resolve)
          .catch(() => resolve(null));
        return;
      }

      if (globalThis.chrome?.runtime?.sendMessage) {
        globalThis.chrome.runtime.sendMessage(extensionId, message, (response) => {
          resolve(globalThis.chrome.runtime.lastError ? null : response);
        });
        return;
      }
    } catch {
      // The companion extension is unavailable or still starting.
    }
    resolve(null);
  });
}

export async function requestPrivacyStats() {
  const message = { action: 'get-stats-summary', schemaVersion: 2 };

  if (cachedExtensionId) {
    const response = await sendToExtension(cachedExtensionId, message);
    if (response && !response.error) return response;
    cachedExtensionId = '';
  }

  for (const extensionId of getPrivacyExtensionCandidates()) {
    const response = await sendToExtension(extensionId, message);
    if (!response || response.error) continue;
    cachedExtensionId = extensionId;
    return response;
  }

  return null;
}

function toCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

const CATEGORY_KEYS = Object.freeze([
  'scripts',
  'frames',
  'xhr',
  'images',
  'media',
  'fonts',
  'other',
]);

export function normalizePrivacyStats(data) {
  if (!data || typeof data !== 'object') return null;

  const totalBlocked = toCount(data.totalBlocked);
  const totalRequests = Math.max(totalBlocked, toCount(data.totalRequests));
  const categories = {};

  for (const key of CATEGORY_KEYS) {
    categories[key] = toCount(data.categories?.[key]);
  }

  return {
    totalBlocked,
    totalRequests,
    pageBlocked: toCount(data.pageBlocked),
    pageRequests: toCount(data.pageRequests),
    blockRate: totalRequests === 0 ? 0 : (totalBlocked / totalRequests) * 100,
    categories,
    enabled: data.enabled !== false,
    state: String(data.state || 'ready').toLowerCase(),
  };
}

