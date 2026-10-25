const FIREFOX_PRIVACY_ID = 'midori-protection@astian.org';
const CHROMIUM_PRIVACY_ID = 'pimgloaejdgobcgjahbgippfilfdpcfa';

const BRIDGE_TIMEOUT_MS = 3000;
const COMPANION_TIMEOUT_MS = 1500;

let cachedExtensionId = '';

// A host that never answers must not leave the widget waiting forever.
function withTimeout(promise, timeoutMs = BRIDGE_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise(resolve => { timer = setTimeout(resolve, timeoutMs, null); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

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

function sendToSelf(message) {
  return new Promise((resolve) => {
    try {
      if (globalThis.browser?.runtime?.sendMessage) {
        globalThis.browser.runtime.sendMessage(message)
          .then(resolve)
          .catch(() => resolve(null));
        return;
      }

      if (globalThis.chrome?.runtime?.sendMessage) {
        globalThis.chrome.runtime.sendMessage(message, (response) => {
          resolve(globalThis.chrome.runtime.lastError ? null : response);
        });
        return;
      }
    } catch {
      // Not running inside an extension context.
    }
    resolve(null);
  });
}

function isBridgeResponse(response) {
  return !!response && typeof response === 'object' && !response.error && 'totalBlocked' in response;
}

export async function requestPrivacyStats({ timeoutMs = BRIDGE_TIMEOUT_MS } = {}) {
  const message = { action: 'get-stats-summary', schemaVersion: 2 };

  const selfResponse = await withTimeout(sendToSelf(message), timeoutMs);
  if (isBridgeResponse(selfResponse)) return selfResponse;

  if (cachedExtensionId) {
    const response = await withTimeout(sendToExtension(cachedExtensionId, message), Math.min(timeoutMs, COMPANION_TIMEOUT_MS));
    if (isBridgeResponse(response)) return response;
    cachedExtensionId = '';
  }

  for (const extensionId of getPrivacyExtensionCandidates()) {
    const response = await withTimeout(sendToExtension(extensionId, message), Math.min(timeoutMs, COMPANION_TIMEOUT_MS));
    if (!isBridgeResponse(response)) continue;
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
  const reported = data.totalBlocked;
  // A response without a usable blocked total is not a report: show nothing rather than zeros.
  if (reported === null || reported === undefined || reported === '' || !Number.isFinite(Number(reported)) || Number(reported) < 0) return null;

  const totalBlocked = toCount(data.totalBlocked);
  const reportedRequests = toCount(data.totalRequests);
  const hasRequestCounts = data.capabilities?.requestCounts !== false
    && data.totalRequests !== null && data.totalRequests !== undefined
    && Number.isFinite(Number(data.totalRequests))
    && reportedRequests >= totalBlocked;
  const totalRequests = hasRequestCounts ? reportedRequests : null;
  const categories = {};

  for (const key of CATEGORY_KEYS) {
    categories[key] = toCount(data.categories?.[key]);
  }

  return {
    totalBlocked,
    totalRequests,
    pageBlocked: toCount(data.pageBlocked),
    pageRequests: data.capabilities?.pageRequestCounts === false || data.pageRequests == null
      ? null : toCount(data.pageRequests),
    blockRate: totalRequests === null || totalRequests === 0 ? null : (totalBlocked / totalRequests) * 100,
    categories,
    enabled: data.enabled !== false,
    state: String(data.state || 'ready').toLowerCase(),
  };
}
