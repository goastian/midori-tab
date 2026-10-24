import { inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { observeElementSize, subscribeViewportSize } from './layoutResizeBus.js';
import { analyzeLogoContrast, getCoverSourceRect } from '../utils/logoContrast.js';

export const WALLPAPER_ELEMENT = Symbol('wallpaper-element');
const SAMPLE_WIDTH = 196;
const SAMPLE_HEIGHT = 65;

function paintPageBackground(context, rect) {
  const body = document.body;
  const style = getComputedStyle(body);
  context.fillStyle = style.backgroundColor;
  context.fillRect(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);

  const gradient = style.backgroundImage.match(/^linear-gradient\(([\d.-]+)deg, (.+)\)$/);
  const colors = gradient?.[2].match(/rgba?\([^)]+\)/g);
  if (!colors || colors.length < 2) return;
  const bodyRect = body.getBoundingClientRect();
  const angle = Number(gradient[1]) * Math.PI / 180;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const length = Math.abs(bodyRect.width * dx) + Math.abs(bodyRect.height * dy);
  const cx = bodyRect.left + bodyRect.width / 2;
  const cy = bodyRect.top + bodyRect.height / 2;
  context.save();
  context.scale(SAMPLE_WIDTH / rect.width, SAMPLE_HEIGHT / rect.height);
  context.translate(-rect.left, -rect.top);
  const fill = context.createLinearGradient(cx - dx * length / 2, cy - dy * length / 2, cx + dx * length / 2, cy + dy * length / 2);
  colors.forEach((color, index) => fill.addColorStop(index / (colors.length - 1), color));
  context.fillStyle = fill;
  context.fillRect(rect.left, rect.top, rect.width, rect.height);
  context.restore();
}

export function useLogoContrast(logo) {
  const wallpaper = inject(WALLPAPER_ELEMENT, ref(null));
  const tone = ref(document.documentElement.dataset.logoTone || (document.documentElement.dataset.theme === 'dark' ? 'light' : 'green'));
  const needsOutline = ref(document.documentElement.dataset.logoOutline === 'true');
  let frame = null;
  let source = '';
  let previousTone = null;
  let logoMask = null;
  let thumbnail = null;
  let thumbnailAttempted = false;
  let unreadable = false;
  let cancelThumbnail = () => {};
  const cleanup = [];

  function remember(result) {
    const key = window.__midoriWallpaperKey || window.__midoriEarlyWallpaper?.key;
    if (!key) return;
    try {
      const raw = localStorage.getItem('midori_wallpaper_logo_v1');
      const records = raw && raw.length <= 8192 ? JSON.parse(raw) : [];
      const current = { key, width: innerWidth, height: innerHeight,
        theme: document.documentElement.dataset.theme, density: document.documentElement.dataset.density,
        tone: result.tone, outline: result.needsOutline };
      const entries = (Array.isArray(records) ? records : []).filter(item => item && item.key !== key).slice(-7);
      entries.push(current);
      let serialized = JSON.stringify(entries);
      while (serialized.length > 8192 && entries.length) { entries.shift(); serialized = JSON.stringify(entries); }
      if (serialized !== raw) localStorage.setItem('midori_wallpaper_logo_v1', serialized);
    } catch { /* Optional visual cache. */ }
  }

  function schedule() {
    if (frame !== null) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      update();
    });
  }

  function loadThumbnail(image) {
    if (thumbnailAttempted) return;
    thumbnailAttempted = true;
    let url;
    try { url = new URL(source); } catch { return; }
    if (url.hostname !== 'images.unsplash.com') return;
    url.searchParams.set('w', '512');
    if (url.searchParams.has('h')) url.searchParams.set('h', String(Math.max(1, Math.round(512 * image.naturalHeight / image.naturalWidth))));
    url.searchParams.set('dpr', '1');
    url.searchParams.set('q', '60');
    const requestedSource = source;
    const candidate = new Image();
    candidate.crossOrigin = 'anonymous';
    candidate.decoding = 'async';
    candidate.fetchPriority = 'low';
    const finish = () => {
      clearTimeout(timeout);
      candidate.onload = null;
      candidate.onerror = null;
      cancelThumbnail = () => {};
    };
    cancelThumbnail = () => { finish(); candidate.src = ''; };
    const timeout = setTimeout(() => cancelThumbnail(), 4000);
    candidate.onerror = finish;
    candidate.onload = () => {
      finish();
      if (source !== requestedSource) return;
      thumbnail = candidate;
      schedule();
    };
    candidate.src = url.href;
  }

  function sample(image, imageRect, logoRect) {
    const canvas = document.createElement('canvas');
    canvas.width = SAMPLE_WIDTH;
    canvas.height = SAMPLE_HEIGHT;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    if (!logoMask) {
      context.drawImage(logo.value, 0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      logoMask = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data;
      context.clearRect(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    }
    paintPageBackground(context, logoRect);
    if (image) {
      const crop = getCoverSourceRect(image.naturalWidth, image.naturalHeight, imageRect, logoRect);
      if (!crop) return null;
      const left = Math.max(imageRect.left, logoRect.left);
      const top = Math.max(imageRect.top, logoRect.top);
      const right = Math.min(imageRect.right, logoRect.right);
      const bottom = Math.min(imageRect.bottom, logoRect.bottom);
      const x = (left - logoRect.left) * SAMPLE_WIDTH / logoRect.width;
      const y = (top - logoRect.top) * SAMPLE_HEIGHT / logoRect.height;
      const width = (right - left) * SAMPLE_WIDTH / logoRect.width;
      const height = (bottom - top) * SAMPLE_HEIGHT / logoRect.height;
      const scaleX = width / crop.width;
      const scaleY = height / crop.height;
      context.save();
      context.beginPath();
      context.rect(x, y, width, height);
      context.clip();
      // srcset corrects naturalWidth for density, but canvas source coordinates use raw pixels.
      // Map the whole image into the clipped canvas so both use the same visible cover region.
      context.drawImage(image, x - crop.x * scaleX, y - crop.y * scaleY,
        image.naturalWidth * scaleX, image.naturalHeight * scaleY);
      context.restore();
    }
    const viewport = logo.value.closest('.viewport');
    if (viewport) {
      context.fillStyle = getComputedStyle(viewport, '::after').backgroundColor;
      context.fillRect(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
    }
    let mask = logoMask;
    const viewportWidth = innerWidth;
    const viewportHeight = innerHeight;
    if (logoRect.left < 0 || logoRect.top < 0 || logoRect.right > viewportWidth || logoRect.bottom > viewportHeight) {
      mask = logoMask.slice();
      for (let y = 0; y < SAMPLE_HEIGHT; y++) {
        for (let x = 0; x < SAMPLE_WIDTH; x++) {
          const screenX = logoRect.left + (x + 0.5) * logoRect.width / SAMPLE_WIDTH;
          const screenY = logoRect.top + (y + 0.5) * logoRect.height / SAMPLE_HEIGHT;
          if (screenX < 0 || screenX >= viewportWidth || screenY < 0 || screenY >= viewportHeight) {
            mask[(y * SAMPLE_WIDTH + x) * 4 + 3] = 0;
          }
        }
      }
    }
    return analyzeLogoContrast(context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT).data, {
      mask, width: SAMPLE_WIDTH, previousTone,
    });
  }

  function update() {
    if (!logo.value?.complete || !logo.value.naturalWidth) return;
    const rect = logo.value.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight) return;
    const image = wallpaper.value;
    if (!image && window.__midoriEarlyWallpaper?.dataUrl) return;
    const nextSource = image?.currentSrc || image?.src || '';
    if (nextSource !== source) {
      cancelThumbnail();
      source = nextSource;
      thumbnail = null;
      thumbnailAttempted = false;
      unreadable = false;
      previousTone = null;
    }
    if (image && (!image.complete || !image.naturalWidth || getComputedStyle(image).display === 'none')) return;
    if (unreadable && !thumbnail) return;
    try {
      const result = sample(thumbnail || image, image?.getBoundingClientRect(), rect);
      if (result) {
        tone.value = result.tone;
        needsOutline.value = result.needsOutline;
        previousTone = result.tone;
        if (image) remember(result);
      }
    } catch {
      // Remote wallpapers still display normally when their pixels cannot be read.
      unreadable = true;
      tone.value = 'light';
      needsOutline.value = true;
      if (image) loadThumbnail(image);
    }
  }

  onMounted(() => {
    logo.value.addEventListener('load', schedule);
    const imageObserver = new MutationObserver(schedule);
    cleanup.push(watch(wallpaper, (image, previous) => {
      previous?.removeEventListener('load', schedule);
      imageObserver.disconnect();
      image?.addEventListener('load', schedule);
      if (image) imageObserver.observe(image, { attributes: true, attributeFilter: ['src', 'srcset', 'style'] });
      schedule();
    }, { immediate: true, flush: 'post' }));
    let resizeTimer = null;
    let initialSize = true;
    cleanup.push(subscribeViewportSize(() => {
      if (initialSize) { initialSize = false; schedule(); return; }
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(schedule, 150);
    }), () => clearTimeout(resizeTimer), observeElementSize(logo.value, schedule));
    const toolbar = logo.value.closest('.dashboard')?.querySelector('.dashboard-toolbar');
    if (toolbar) cleanup.push(observeElementSize(toolbar, schedule));
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-density', 'style'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
    cleanup.push(() => observer.disconnect(), () => imageObserver.disconnect());
    window.addEventListener('scroll', schedule, { passive: true });
  });

  onBeforeUnmount(() => {
    cleanup.forEach(dispose => dispose());
    wallpaper.value?.removeEventListener('load', schedule);
    logo.value?.removeEventListener('load', schedule);
    window.removeEventListener('scroll', schedule);
    if (frame !== null) cancelAnimationFrame(frame);
    cancelThumbnail();
  });

  return { tone, needsOutline };
}
