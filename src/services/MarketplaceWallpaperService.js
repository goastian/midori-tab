function isMarketplaceDownloadUrl(url) {
  return typeof url === 'string' && /\/api\/v1\/assets\/[^/]+\/download(?:$|\?)/.test(url);
}

async function resolveMarketplaceDownloadImage(downloadUrl, assetSlug, signal) {
  try {
    const { fetchBlobWithTimeout } = await import('./fetchJsonWithTimeout.js');
    if (typeof caches !== 'undefined') {
      const cache = await caches.open('midori-marketplace-wallpapers-v1');
      const request = new Request(downloadUrl, { method: 'GET', mode: 'cors', credentials: 'omit' });
      let response = await cache.match(request);
      const cached = Boolean(response);
      let blob;

      if (!response) {
        ({ response, payload: blob } = await fetchBlobWithTimeout(request, { signal, timeoutMs: 8000 }));
      }

      if (!response?.ok) {
        return '';
      }

      const responseContentType = response.headers?.get('content-type') || '';
      if (!responseContentType.includes('image/')) {
        return '';
      }

      blob ||= await response.blob();
      if (!blob || !blob.type?.startsWith('image/') || blob.size > 8 * 1024 * 1024 || signal?.aborted) {
        await cache.delete(request);
        return '';
      }
      try {
        if (cached) await cache.delete(request);
        await cache.put(request, new Response(blob, { headers: { 'content-type': blob.type } }));
        const keys = await cache.keys();
        for (const old of keys.slice(0, Math.max(0, keys.length - 8))) await cache.delete(old);
      } catch (error) {
        console.warn('Marketplace wallpaper cache unavailable', error);
      }
      return URL.createObjectURL(blob);
    }

    const { response, payload: blob } = await fetchBlobWithTimeout(downloadUrl, {
      mode: 'cors', credentials: 'omit', signal, timeoutMs: 8000,
    });
    if (!response.ok) {
      return '';
    }

    if (!blob || !blob.type?.startsWith('image/') || blob.size > 8 * 1024 * 1024 || signal?.aborted) {
      return '';
    }

    return URL.createObjectURL(blob);
  } catch (error) {
    if (error?.name !== 'AbortError' && !signal?.aborted) console.warn('Marketplace wallpaper fallback failed', { assetSlug, error });
    return '';
  }
}

export async function loadMarketplaceWallpaper(view, background, signal, requestId) {
  const previewUrl = background?.previewUrl || '';
  const sourceUrl = background?.imageUrl || background?.downloadUrl || '';
  const srcSet = background?.imageSrcSet || '';

  if (previewUrl && !view.backgroundImage && !signal?.aborted && requestId === view.backgroundRequestId) {
    const decoded = await view.preloadImage(previewUrl, signal);
    if (decoded && !signal?.aborted && requestId === view.backgroundRequestId) {
      view.applyBackgroundImage(previewUrl, '', { decoded, cacheKey: previewUrl || sourceUrl, complete: !sourceUrl });
      view.releaseMarketplaceBlobUrl();
    }
  }

  if (!sourceUrl) {
    if (!previewUrl) {
      view.applyBackgroundImage('', '');
      view.releaseMarketplaceBlobUrl();
    }
    return;
  }

  let resolvedUrl = sourceUrl;
  if (isMarketplaceDownloadUrl(sourceUrl)) {
    resolvedUrl = await resolveMarketplaceDownloadImage(sourceUrl, background?.assetSlug || '', signal);
  }

  if (signal?.aborted || requestId !== view.backgroundRequestId) {
    if (resolvedUrl?.startsWith('blob:')) URL.revokeObjectURL(resolvedUrl);
    return;
  }

  if (!resolvedUrl) {
    return;
  }

  const decoded = await view.preloadImage(resolvedUrl, signal, resolvedUrl.startsWith('blob:') ? '' : srcSet);
  if (signal?.aborted || requestId !== view.backgroundRequestId) {
    if (resolvedUrl.startsWith('blob:')) URL.revokeObjectURL(resolvedUrl);
    return;
  }
  if (!decoded) {
    if (resolvedUrl.startsWith('blob:')) URL.revokeObjectURL(resolvedUrl);
    return;
  }
  view.applyBackgroundImage(resolvedUrl, resolvedUrl.startsWith('blob:') ? '' : srcSet,
    { decoded, cacheKey: previewUrl || sourceUrl });
  if (resolvedUrl.startsWith('blob:')) {
    const previous = view.marketplaceBlobUrl;
    view.marketplaceBlobUrl = resolvedUrl;
    if (previous && previous !== resolvedUrl) URL.revokeObjectURL(previous);
  }
}
