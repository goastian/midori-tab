export function getBrowserInfo() {
  const ua = String(navigator.userAgent || '');
  const isFirefox = /Firefox\/\d+/i.test(ua);
  const isEdge = /Edg\//i.test(ua);
  const isOpera = /OPR\//i.test(ua);
  const isVivaldi = /Vivaldi\//i.test(ua);
  const isChromium = !isFirefox && (/Chrome\/\d+/i.test(ua) || isEdge || isOpera || isVivaldi);

  let id = 'unknown';
  let name = 'Unknown';
  if (isFirefox) { id = 'firefox'; name = 'Firefox'; }
  else if (isVivaldi) { id = 'vivaldi'; name = 'Vivaldi'; }
  else if (isOpera) { id = 'opera'; name = 'Opera'; }
  else if (isEdge) { id = 'edge'; name = 'Edge'; }
  else if (isChromium) { id = 'chrome'; name = 'Chrome'; }

  const isMac = /Mac/i.test(navigator.platform || '') || /Macintosh/i.test(ua);
  const shortcutsHintKey = isFirefox ? 'firefox' : 'chromium';

  return { id, name, isFirefox, isChromium, isEdge, isOpera, isVivaldi, isMac, shortcutsHintKey };
}

