let _cachedBrowserInfo = null;

export function getBrowserInfo() {
  if (_cachedBrowserInfo) return _cachedBrowserInfo;

  const ua = String(navigator.userAgent || '');
  const platform = String(navigator.platform || '').toLowerCase();
  const isWindows = /win/i.test(platform) || /windows/i.test(ua);
  const isMac = /mac/i.test(platform) || /macintosh/i.test(ua);
  const isLinux = /linux/i.test(platform) || /x11/i.test(platform);

  const isFirefox = /Firefox\/\d+/i.test(ua);
  const isEdge = /Edg\//i.test(ua);
  const isOpera = /OPR\//i.test(ua);
  const isVivaldi = /Vivaldi\//i.test(ua);
  const isChromium = !isFirefox && (/Chrome\/\d+/i.test(ua) || isEdge || isOpera || isVivaldi);

  const hasMidoriInUa = /Midori\/\d+/i.test(ua) || /\bMidori\b/i.test(ua);
  const hasMidoriGlobal = Boolean(
    globalThis?.midori
    || globalThis?.Midori
    || globalThis?.__MIDORI__
    || globalThis?.__MIDORI_DESKTOP__
  );

  let hasMidoriRuntimeIdentity = false;
  try {
    const extensionApi = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
    const manifest = extensionApi?.runtime?.getManifest?.();
    const manifestName = String(manifest?.name || '').toLowerCase();
    const manifestAuthor = String(manifest?.author || '').toLowerCase();
    hasMidoriRuntimeIdentity = manifestName.includes('midori') || manifestAuthor.includes('astian');
  } catch (error) {
    hasMidoriRuntimeIdentity = false;
  }

  const isMidori = Boolean(hasMidoriInUa || hasMidoriGlobal || hasMidoriRuntimeIdentity);

  let id = 'unknown';
  let name = 'Unknown';
  if (isFirefox) { id = 'firefox'; name = isMidori ? 'Midori' : 'Firefox'; }
  else if (isVivaldi) { id = 'vivaldi'; name = 'Vivaldi'; }
  else if (isOpera) { id = 'opera'; name = 'Opera'; }
  else if (isEdge) { id = 'edge'; name = 'Edge'; }
  else if (isChromium) { id = 'chrome'; name = isMidori ? 'Midori' : 'Chrome'; }

  const shortcutsHintKey = isFirefox || isMidori ? 'firefox' : 'chromium';
  const platformName = isWindows ? 'windows' : isMac ? 'macos' : isLinux ? 'linux' : 'unknown';
  const family = isMidori ? 'midori' : isFirefox ? 'firefox-compatible' : isChromium ? 'chromium' : 'unknown';

  _cachedBrowserInfo = {
    id,
    environmentId: isMidori ? 'midori' : id,
    name,
    family,
    platform: platformName,
    isMidori,
    isFirefox,
    isFirefoxCompatible: isFirefox || isMidori,
    isChromium,
    isEdge,
    isOpera,
    isVivaldi,
    isWindows,
    isLinux,
    isMac,
    shortcutsHintKey,
  };
  return _cachedBrowserInfo;
}

