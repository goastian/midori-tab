import { getBrowserInfo } from './browserInfo.js';

const APP_VERSION = import.meta.env.VITE_MIDORI_APP_VERSION || '1.0.10';

function toVersionParts(version) {
  return String(version || '')
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(part => Number.parseInt(part, 10) || 0);
}

function compareVersions(left, right) {
  const leftParts = toVersionParts(left);
  const rightParts = toVersionParts(right);
  const size = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < size; index += 1) {
    const leftValue = leftParts[index] || 0;
    const rightValue = rightParts[index] || 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
}

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
  const media = Array.isArray(manifest.payload?.media) ? manifest.payload.media[0] : null;
  const author = normalizeAuthor(asset.author);
  const imageUrl = media?.url || manifest.preview?.url || asset.previewUrl || '';

  if (!imageUrl) {
    return null;
  }

  return {
    type: 'MarketplaceWallpaper',
    default: false,
    assetSlug: asset.slug,
    source: 'marketplace',
    imageUrl,
    previewUrl: imageUrl,
    authorName: author.name,
    authorUrl: author.url,
    sourceUrl: imageUrl,
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
    previewUrl: media?.url || manifest.preview?.url || '',
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