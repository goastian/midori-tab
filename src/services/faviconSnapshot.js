const KEY = 'midori_favicon_snapshot_v1';
const MAX_BYTES = 64 * 1024;
const MAX_ICON_BYTES = 16 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > MAX_BYTES) return {};
    const parsed = JSON.parse(raw);
    return parsed?.version === 1 && parsed.icons && typeof parsed.icons === 'object' ? parsed.icons : {};
  } catch { return {}; }
}

export function readFaviconSnapshot() {
  const urls = {};
  const stale = {};
  for (const [domain, icon] of Object.entries(read())) {
    if (typeof icon?.url !== 'string' || icon.url.length > MAX_ICON_BYTES
      || !/^data:image\/(?:png|jpeg|gif|webp|x-icon|vnd\.microsoft\.icon);base64,[a-z\d+/=]+$/i.test(icon.url)) continue;
    urls[domain] = icon.url;
    stale[domain] = Date.now() - Number(icon.fetchedAt || 0) > MAX_AGE_MS;
  }
  return { urls, stale };
}

export function writeFaviconSnapshot(domain, url, fetchedAt) {
  const icons = read();
  delete icons[domain];
  if (url?.startsWith('data:image/') && url.length <= MAX_ICON_BYTES) icons[domain] = { url, fetchedAt };
  const keys = Object.keys(icons);
  let raw = JSON.stringify({ version: 1, icons });
  while (keys.length > 16 || raw.length > MAX_BYTES) {
    delete icons[keys.shift()];
    raw = JSON.stringify({ version: 1, icons });
  }
  try { localStorage.setItem(KEY, raw); } catch { /* optional first-frame cache */ }
}

export async function faviconDisplayUrl(blob) {
  if (blob.size <= 10 * 1024 && /^image\/(?:png|jpeg|gif|webp|x-icon|vnd\.microsoft\.icon)$/i.test(blob.type)) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const scale = Math.min(64 / image.naturalWidth, 64 / image.naturalHeight, 1);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    canvas.getContext('2d').drawImage(image, (64 - width) / 2, (64 - height) / 2, width, height);
    return canvas.toDataURL('image/png');
  } finally { URL.revokeObjectURL(url); }
}
