const CRITICAL_RESOURCES = [
  /^\/(?:index|boot-theme)\.(?:js|css)$/,
  /^\/assets\/(?:vendor|index|i18n-[a-z]{2}|SearchBox|BookmarkGrid|useAdsStore|useOmniStore|useAutoTheme)-[^/]+\.(?:js|css)$/,
];

export function criticalResourceViolations(resources, documentUrl, { laboratory = false } = {}) {
  const document = new URL(documentUrl);
  const violations = new Set();
  for (const resource of resources) {
    const url = new URL(typeof resource === 'string' ? resource : resource.name, document);
    if (url.protocol !== document.protocol || url.host !== document.host || !/\.(js|css)$/.test(url.pathname)) continue;
    if (laboratory && /^\/assets\/labVisualStability-[^/]+\.js$/.test(url.pathname)) continue;
    if (!CRITICAL_RESOURCES.some(pattern => pattern.test(url.pathname))) violations.add(url.pathname);
  }
  return [...violations].sort();
}
