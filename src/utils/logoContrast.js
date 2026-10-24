/** Map the visible logo area to an image rendered with object-fit: cover, centered. */
export function getCoverSourceRect(imageWidth, imageHeight, viewportRect, logoRect) {
  if (!viewportRect || !logoRect) return null;
  const viewportLeft = viewportRect.left ?? viewportRect.x ?? 0;
  const viewportTop = viewportRect.top ?? viewportRect.y ?? 0;
  const logoLeft = logoRect.left ?? logoRect.x ?? 0;
  const logoTop = logoRect.top ?? logoRect.y ?? 0;
  const dimensions = [imageWidth, imageHeight, viewportRect.width, viewportRect.height, logoRect.width, logoRect.height];
  if (dimensions.some(value => !Number.isFinite(value) || value <= 0)
    || [viewportLeft, viewportTop, logoLeft, logoTop].some(value => !Number.isFinite(value))) return null;

  const left = Math.max(viewportLeft, logoLeft);
  const top = Math.max(viewportTop, logoTop);
  const right = Math.min(viewportLeft + viewportRect.width, logoLeft + logoRect.width);
  const bottom = Math.min(viewportTop + viewportRect.height, logoTop + logoRect.height);
  if (left >= right || top >= bottom) return null;

  const scale = Math.max(viewportRect.width / imageWidth, viewportRect.height / imageHeight);
  const imageLeft = viewportLeft + (viewportRect.width - imageWidth * scale) / 2;
  const imageTop = viewportTop + (viewportRect.height - imageHeight * scale) / 2;
  return {
    x: (left - imageLeft) / scale,
    y: (top - imageTop) / scale,
    width: (right - left) / scale,
    height: (bottom - top) / scale,
  };
}

function linearChannel(value) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

const LINEAR_CHANNELS = Float64Array.from({ length: 256 }, (_, value) => linearChannel(value));

function luminance(red, green, blue) {
  return 0.2126 * (LINEAR_CHANNELS[red] ?? linearChannel(red))
    + 0.7152 * (LINEAR_CHANNELS[green] ?? linearChannel(green))
    + 0.0722 * (LINEAR_CHANNELS[blue] ?? linearChannel(blue));
}

const MIDORI_GREEN_LUMINANCE = luminance(4, 166, 107);
const WORDMARK_START = 130 / 393;
const CONTRAST_CAP = 4.5;
const LOWER_PERCENTILE = 0.15;

/**
 * Pixels and optional logo mask are matching canvas RGBA buffers. The mask's alpha excludes
 * transparent logo areas; width allows the wordmark to carry two thirds of the sample weight.
 */
export function analyzeLogoContrast(pixels, {
  mask = null,
  width = 0,
  overlay = [0, 0, 0, 0],
  base = [15, 21, 32],
  previousTone = null,
} = {}) {
  const overlayAlpha = Math.max(0, Math.min(1, overlay[3]));
  const composite = (channel, sourceAlpha, index) => (
    (channel * sourceAlpha + base[index] * (1 - sourceAlpha)) * (1 - overlayAlpha)
    + overlay[index] * overlayAlpha
  );
  const hasMask = mask?.length === pixels.length;
  const weightRegions = hasMask && Number.isInteger(width) && width > 0
    && (pixels.length / 4) % width === 0;
  const samples = [];
  const regionWeights = [0, 0];
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const weight = hasMask ? mask[index + 3] / 255 : 1;
    if (!weight) continue;
    const alpha = pixels[index + 3] / 255;
    const region = weightRegions && ((index / 4) % width) / width >= WORDMARK_START ? 1 : 0;
    samples.push({
      luminance: luminance(
        composite(pixels[index], alpha, 0),
        composite(pixels[index + 1], alpha, 1),
        composite(pixels[index + 2], alpha, 2),
      ),
      weight,
      region,
    });
    regionWeights[region] += weight;
  }

  if (!samples.length) {
    samples.push({
      luminance: luminance(composite(base[0], 1, 0), composite(base[1], 1, 1), composite(base[2], 1, 2)),
      weight: 1,
      region: 0,
    });
  } else if (weightRegions && regionWeights.every(weight => weight > 0)) {
    for (const sample of samples) {
      sample.weight *= (sample.region ? 2 / 3 : 1 / 3) / regionWeights[sample.region];
    }
  }

  const metrics = {
    light: measureContrast(samples, 1),
    green: measureContrast(samples, MIDORI_GREEN_LUMINANCE),
  };
  let tone = metrics.light.score >= metrics.green.score ? 'light' : 'green';
  const bothFullyContrasted = Math.min(metrics.light.score, metrics.green.score) >= CONTRAST_CAP - 1e-9;
  if (bothFullyContrasted) {
    tone = metrics.light.meanContrast >= metrics.green.meanContrast ? 'light' : 'green';
  } else if (Object.hasOwn(metrics, previousTone)
    && metrics[tone].score <= metrics[previousTone].score * 1.05) tone = previousTone;
  const chosen = metrics[tone];
  return {
    tone,
    needsOutline: chosen.lowContrastFraction >= 0.1 || chosen.lowerContrast < 2,
    metrics,
  };
}

function measureContrast(samples, foreground) {
  const contrasts = samples.map(sample => ({
    value: (Math.max(sample.luminance, foreground) + 0.05)
      / (Math.min(sample.luminance, foreground) + 0.05),
    weight: sample.weight,
  })).sort((left, right) => left.value - right.value);
  const totalWeight = contrasts.reduce((sum, sample) => sum + sample.weight, 0);
  let clippedTotal = 0;
  let rawTotal = 0;
  let lowContrastWeight = 0;
  let cumulativeWeight = 0;
  let lowerContrast = null;
  for (const sample of contrasts) {
    clippedTotal += Math.min(sample.value, CONTRAST_CAP) * sample.weight;
    rawTotal += sample.value * sample.weight;
    if (sample.value < 3) lowContrastWeight += sample.weight;
    cumulativeWeight += sample.weight;
    if (lowerContrast === null && cumulativeWeight >= totalWeight * LOWER_PERCENTILE) {
      lowerContrast = sample.value;
    }
  }
  return {
    score: 0.65 * clippedTotal / totalWeight + 0.35 * Math.min(lowerContrast, CONTRAST_CAP),
    meanContrast: rawTotal / totalWeight,
    lowerContrast,
    lowContrastFraction: lowContrastWeight / totalWeight,
  };
}

export function chooseLogoTone(pixels, overlay = [0, 0, 0, 0], base = [15, 21, 32]) {
  return analyzeLogoContrast(pixels, { overlay, base }).tone;
}
