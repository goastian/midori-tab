import { APP_VERSION } from './appVersion.js';
import { getBrowserInfo } from './browserInfo.js';
import { compareVersions } from './semver.js';

function isVersionCompatible(currentVersion, minVersion, maxVersion) {
  if (minVersion && compareVersions(currentVersion, minVersion) < 0) return false;
  if (maxVersion && compareVersions(currentVersion, maxVersion) > 0) return false;
  return true;
}

function normalizeAuthor(author) {
  if (!author) return { name: '', url: '' };
  if (typeof author === 'string') return { name: author, url: '' };
  return {
    name: author.name || '',
    url: author.url || '',
  };
}

function resolveThemePreview(lightVars, darkVars) {
  return {
    light: lightVars['--color-bg'] || lightVars['--color-primary'] || '#dbe5de',
    dark: darkVars['--color-bg'] || darkVars['--color-primary'] || '#10161d',
  };
}

function getAdaptiveWallpaperWidth() {
  const viewportWidth = typeof window !== 'undefined' ? Math.max(window.innerWidth || 1280, 1280) : 1280;
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 1.5) : 1;
  const deviceMemory = typeof navigator !== 'undefined' ? Number(navigator.deviceMemory || 4) : 4;
  const estimated = Math.round(viewportWidth * dpr);
  if (deviceMemory <= 2) return Math.min(estimated, 1280);
  if (deviceMemory <= 4) return Math.min(estimated, 1440);
  return Math.min(estimated, 1920);
}

function optimizeRemoteImageUrl(rawUrl, { width, quality = 70 } = {}) {
  if (!rawUrl || !width) return rawUrl || '';
  try {
    const url = new URL(rawUrl);
    if (/images\.unsplash\.com$/.test(url.hostname)) {
      url.searchParams.set('w', String(width));
      url.searchParams.set('fit', 'max');
      url.searchParams.set('fm', 'webp');
      url.searchParams.set('q', String(quality));
      url.searchParams.set('dpr', '1');
      return url.toString();
    }
    return rawUrl;
  } catch {
    return rawUrl || '';
  }
}

function resolveMediaValue(media, keys) {
  for (const key of keys) {
    const value = media?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeMarketplaceApiBaseUrl(rawBaseUrl) {
  if (!rawBaseUrl) return '';

  const trimmed = String(rawBaseUrl).trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('/api/v1')) return trimmed;
  if (trimmed.endsWith('/api')) return `${trimmed}/v1`;
  return `${trimmed}/api/v1`;
}

function resolveMarketplaceApiBaseUrl(explicitBaseUrl = '') {
  if (explicitBaseUrl) {
    return normalizeMarketplaceApiBaseUrl(explicitBaseUrl);
  }

  const envBase = typeof import.meta !== 'undefined'
    ? (import.meta.env?.VITE_MARKETPLACE_API_BASE_URL || import.meta.env?.VITE_PASSPORT_SERVER || '')
    : '';

  return normalizeMarketplaceApiBaseUrl(envBase);
}

function buildWallpaperDownloadUrl(asset, explicitBaseUrl = '') {
  if (!asset?.slug) {
    return '';
  }

  const baseUrl = resolveMarketplaceApiBaseUrl(explicitBaseUrl);
  if (!baseUrl) {
    return `/api/v1/assets/${encodeURIComponent(asset.slug)}/download`;
  }

  return `${baseUrl}/assets/${encodeURIComponent(asset.slug)}/download`;
}

function resolveWallpaperMedia(asset, manifest, options = {}) {
  const payload = manifest.payload || {};
  const media = Array.isArray(payload.media) ? payload.media[0] : {};
  const preview = manifest.preview || {};
  const distribution = manifest.distribution || {};
  const assetPreviewUrl = resolveMediaValue(asset, ['previewUrl', 'preview_url'])
    || resolveMediaValue(asset?.preview, ['url', 'thumbnailUrl', 'smallUrl'])
    || resolveMediaValue(asset, ['imageUrl', 'image_url']);
  const assetDownloadUrl = resolveMediaValue(asset, ['downloadUrl', 'download_url'])
    || buildWallpaperDownloadUrl(asset, options.apiBaseUrl);
  const finalUrl = resolveMediaValue(media, ['optimizedUrl', 'fullUrl', 'assetUrl', 'url'])
    || resolveMediaValue(distribution, ['assetUrl', 'downloadUrl', 'url'])
    || resolveMediaValue(preview, ['fullUrl', 'url'])
    || assetDownloadUrl
    || assetPreviewUrl
    || '';
  const previewUrl = resolveMediaValue(media, ['previewUrl', 'thumbnailUrl', 'thumbUrl'])
    || resolveMediaValue(preview, ['thumbnailUrl', 'smallUrl', 'url'])
    || assetPreviewUrl
    || finalUrl;
  const srcSet = media?.srcset || media?.srcSet || preview?.srcset || preview?.srcSet || '';

  return {
    finalUrl,
    previewUrl,
    srcSet,
  };
}

function buildImageSrcSet(rawUrl, existingSrcSet = '') {
  if (existingSrcSet) return existingSrcSet;
  if (!rawUrl) return '';
  const entries = [960, 1280, 1440, 1920]
    .map(width => ({
      width,
      url: optimizeRemoteImageUrl(rawUrl, { width, quality: width <= 960 ? 62 : 72 }),
    }))
    .filter(entry => entry.url && entry.url !== rawUrl);
  if (!entries.length) return '';
  return entries
    .map(entry => `${entry.url} ${entry.width}w`)
    .join(', ');
}

export function resolveBuiltinWidgetKey(asset) {
  const manifest = asset?.manifest || {};
  const payload = manifest.payload || {};
  const explicitKey = payload.midoriWidgetKey || payload.builtinWidgetKey || payload.widgetKey;
  if (typeof explicitKey === 'string' && explicitKey.trim()) {
    return explicitKey.trim();
  }

  const corpus = [asset?.slug, asset?.id, payload.entry, ...(asset?.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (corpus.includes('privacy')) return 'privacy';
  if (corpus.includes('calendar')) return 'calendar';
  if (corpus.includes('note')) return 'notes';
  if (corpus.includes('todo') || corpus.includes('task')) return 'todo';
  if (corpus.includes('rss') || corpus.includes('feed')) return 'rss';
  return null;
}

export function buildMarketplaceThemeDefinition(asset) {
  const manifest = asset?.manifest || {};
  const payload = manifest.payload || {};
  const baseTokens = payload.tokens || {};
  const lightVariant = { ...baseTokens, ...(payload.modes?.light || {}) };
  const darkVariant = { ...baseTokens, ...(payload.modes?.dark || {}) };
  const light = Object.keys(lightVariant).length ? lightVariant : { ...darkVariant };
  const dark = Object.keys(darkVariant).length ? darkVariant : { ...lightVariant };

  if (!Object.keys(light).length && !Object.keys(dark).length) {
    return null;
  }

  return {
    id: `marketplace:${asset.slug}`,
    name: asset.name,
    icon: '🛍️',
    preview: resolveThemePreview(light, dark),
    autoAdapt: true,
    light,
    dark,
    marketplace: {
      slug: asset.slug,
      version: asset.version,
      author: asset.author,
    },
  };
}

export function buildMarketplaceWallpaperBackground(asset) {
  const manifest = asset?.manifest || {};
  const author = normalizeAuthor(asset.author);
  const media = resolveWallpaperMedia(asset, manifest, { apiBaseUrl: asset.apiBaseUrl || '' });
  const adaptiveWidth = getAdaptiveWallpaperWidth();
  const lowMemory = typeof navigator !== 'undefined' && Number(navigator.deviceMemory || 4) <= 2;
  const sourceUrl = media.finalUrl || asset.imageUrl || asset.previewUrl || buildWallpaperDownloadUrl(asset, asset.apiBaseUrl || '');
  const previewSourceUrl = media.previewUrl || asset.previewUrl || asset.imageUrl || sourceUrl;
  const imageUrl = optimizeRemoteImageUrl(sourceUrl, {
    width: adaptiveWidth,
    quality: lowMemory ? 50 : 72,
  });
  const previewUrl = optimizeRemoteImageUrl(previewSourceUrl, {
    width: 480,
    quality: 50,
  });

  if (!imageUrl) {
    return null;
  }

  return {
    type: 'MarketplaceWallpaper',
    default: false,
    assetSlug: asset.slug,
    source: 'marketplace',
    imageUrl,
    previewUrl,
    imageSrcSet: buildImageSrcSet(sourceUrl, media.srcSet),
    authorName: author.name,
    authorUrl: author.url,
    sourceUrl: sourceUrl || imageUrl,
  };
}

export function normalizeMarketplaceAsset(rawAsset, options = {}) {
  const version = rawAsset?.latest_version || rawAsset?.versions?.[0] || null;
  const manifest = version?.manifest || rawAsset?.manifest || {};
  const browserInfo = options.browserInfo || getBrowserInfo();
  const compatibility = manifest.compatibility || {};
  const browserCompatibility = Array.isArray(compatibility.browsers)
    ? compatibility.browsers.find(item => item?.id === browserInfo.id)
    : null;
  const appCompatibility = compatibility.app || {};
  const media = Array.isArray(manifest.payload?.media) ? manifest.payload.media[0] : null;
  const apiBaseUrl = resolveMarketplaceApiBaseUrl(options.apiBaseUrl || '');
  const wallpaperMedia = rawAsset.type === 'wallpaper'
    ? resolveWallpaperMedia(rawAsset, manifest, { apiBaseUrl })
    : null;
  const lowMemory = typeof navigator !== 'undefined' && Number(navigator.deviceMemory || 4) <= 2;

  const isCompatible = isVersionCompatible(APP_VERSION, appCompatibility.minVersion, appCompatibility.maxVersion)
    && (!browserCompatibility || isVersionCompatible(APP_VERSION, browserCompatibility.minVersion, browserCompatibility.maxVersion));

  return {
    id: rawAsset.id,
    slug: rawAsset.slug,
    type: rawAsset.type,
    name: rawAsset.name,
    description: rawAsset.description || rawAsset.summary || '',
    author: normalizeAuthor(rawAsset.author),
    license: rawAsset.license || '',
    tags: Array.isArray(rawAsset.tags) ? rawAsset.tags : [],
    status: rawAsset.status,
    publishedAt: rawAsset.published_at || null,
    version: version?.version || '',
    versionId: version?.id || null,
    manifest,
    checksum: version?.checksum || '',
    sizeBytes: version?.size_bytes || manifest.distribution?.sizeBytes || 0,
    apiBaseUrl,
    downloadUrl: rawAsset.type === 'wallpaper'
      ? (resolveMediaValue(rawAsset, ['downloadUrl', 'download_url']) || buildWallpaperDownloadUrl(rawAsset, apiBaseUrl))
      : '',
    previewUrl: rawAsset.type === 'wallpaper'
      ? optimizeRemoteImageUrl(wallpaperMedia?.previewUrl || wallpaperMedia?.finalUrl || buildWallpaperDownloadUrl(rawAsset, apiBaseUrl), { width: 480, quality: 50 })
      : (media?.url || manifest.preview?.url || ''),
    imageUrl: rawAsset.type === 'wallpaper'
      ? optimizeRemoteImageUrl(wallpaperMedia?.finalUrl || buildWallpaperDownloadUrl(rawAsset, apiBaseUrl), { width: getAdaptiveWallpaperWidth(), quality: lowMemory ? 50 : 72 })
      : '',
    imageSrcSet: rawAsset.type === 'wallpaper'
      ? buildImageSrcSet(wallpaperMedia?.finalUrl, wallpaperMedia?.srcSet)
      : '',
    isCompatible,
    compatibility,
    builtinWidgetKey: resolveBuiltinWidgetKey({ ...rawAsset, manifest }),
  };
}

export function buildInstalledAssetRecord(asset, extra = {}) {
  return {
    slug: asset.slug,
    type: asset.type,
    name: asset.name,
    version: asset.version,
    previewUrl: asset.previewUrl || '',
    builtinWidgetKey: asset.builtinWidgetKey || null,
    installedAt: new Date().toISOString(),
    ...extra,
  };
}
