import { parseSemver } from './semver.js';

/** Only a browser-provided identity may authorize a browser update notice. */
export async function getMidoriBrowserInfo({ runtime, userAgent } = {}) {
  const browserRuntime = runtime === undefined
    ? (globalThis.browser?.runtime || globalThis.chrome?.runtime)
    : runtime;

  if (typeof browserRuntime?.getBrowserInfo === 'function') {
    try {
      const info = await browserRuntime.getBrowserInfo();
      const version = String(info?.version || '').trim();
      const isMidori = /^midori$/i.test(String(info?.name || '').trim()) && Boolean(parseSemver(version));
      return {
        isMidori,
        version: isMidori ? version : '',
      };
    } catch {
      // A browser that cannot report its identity must not show an update notice.
      return { isMidori: false, version: '' };
    }
  }

  const ua = String(userAgent === undefined ? globalThis.navigator?.userAgent || '' : userAgent);
  const match = ua.match(/\bMidori\/(v?\d+(?:\.\d+){1,2}(?:-[0-9A-Za-z.-]+)?)/i);
  const version = match?.[1] || '';
  return { isMidori: Boolean(parseSemver(version)), version };
}
