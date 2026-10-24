import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeLogoContrast, chooseLogoTone, getCoverSourceRect } from '../src/utils/logoContrast.js';

test('cover maps a wide wallpaper through its centered horizontal crop', () => {
  assert.deepEqual(getCoverSourceRect(4000, 2000,
    { left: 0, top: 0, width: 1000, height: 1000 },
    { left: 450, top: 20, width: 100, height: 60 }),
  { x: 1900, y: 40, width: 200, height: 120 });
});

test('cover maps a portrait wallpaper through its centered vertical crop', () => {
  assert.deepEqual(getCoverSourceRect(1000, 2000,
    { left: 20, top: 50, width: 1000, height: 500 },
    { left: 470, top: 70, width: 100, height: 60 }),
  { x: 450, y: 770, width: 100, height: 60 });
});

test('cover clips a partly visible logo to the image viewport', () => {
  assert.deepEqual(getCoverSourceRect(1000, 1000,
    { left: 0, top: 0, width: 1000, height: 1000 },
    { left: -20, top: -30, width: 100, height: 60 }),
  { x: 0, y: 0, width: 80, height: 30 });
});

test('cover ignores logos outside the viewport and unloaded images', () => {
  const viewport = { left: 0, top: 0, width: 1000, height: 500 };
  assert.equal(getCoverSourceRect(1000, 1000, viewport,
    { left: 10, top: 500, width: 100, height: 60 }), null);
  assert.equal(getCoverSourceRect(1000, 1000, viewport,
    { left: 1000, top: 20, width: 100, height: 60 }), null);
  assert.equal(getCoverSourceRect(0, 0, viewport,
    { left: 10, top: 20, width: 100, height: 60 }), null);
});

test('logo uses original green on white and white on dark or Midori green backgrounds', () => {
  assert.equal(chooseLogoTone([0, 0, 0, 255]), 'light');
  assert.equal(chooseLogoTone([255, 255, 255, 255]), 'green');
  assert.equal(chooseLogoTone([4, 166, 107, 255]), 'light');
  assert.equal(chooseLogoTone([0, 45, 20, 255]), 'light');
});

test('tone compares white with brand green instead of using a black foreground threshold', () => {
  assert.equal(chooseLogoTone([118, 118, 118, 255]), 'light');
  assert.equal(chooseLogoTone([194, 194, 194, 255]), 'light');
  assert.equal(chooseLogoTone([195, 195, 195, 255]), 'green');
});

test('page overlay participates in contrast after the photo is composited', () => {
  assert.equal(chooseLogoTone([255, 255, 255, 255], [0, 0, 0, 0.8]), 'light');
  assert.equal(chooseLogoTone([0, 0, 0, 255], [255, 255, 255, 0.5]), 'light');
  assert.equal(chooseLogoTone([0, 0, 0, 255], [255, 255, 255, 0.9]), 'green');
});

test('transparent image pixels reveal the base before applying an overlay', () => {
  assert.equal(chooseLogoTone([255, 255, 255, 0]), 'light');
  assert.equal(chooseLogoTone([0, 0, 0, 0], [0, 0, 0, 0], [255, 255, 255]), 'green');
  assert.equal(chooseLogoTone([0, 0, 0, 128], [0, 0, 0, 0], [255, 255, 255]), 'light');
  assert.equal(chooseLogoTone([0, 0, 0, 192], [0, 0, 0, 0], [255, 255, 255]), 'light');
  assert.equal(chooseLogoTone([255, 255, 255, 0], [0, 0, 0, 0.8], [255, 255, 255]), 'light');
});

test('tone accounts for the sampled region instead of choosing its first pixel', () => {
  const pixels = new Uint8ClampedArray([
    0, 0, 0, 255,
    255, 255, 255, 255,
    255, 255, 255, 255,
  ]);
  assert.equal(chooseLogoTone(pixels), 'green');
  assert.equal(chooseLogoTone([]), 'light');
});

const rgba = (...colors) => new Uint8ClampedArray(colors.flatMap(color => [...color, 255]));
const black = [0, 0, 0];
const white = [255, 255, 255];
const green = [4, 166, 107];

test('transparent logo spaces cannot outvote the visible strokes', () => {
  const mask = rgba(black, black, black, black, black);
  for (const index of [0, 1, 3, 4]) mask[index * 4 + 3] = 0;
  const darkSpaces = analyzeLogoContrast(rgba(black, black, white, black, black), { mask });
  const lightSpaces = analyzeLogoContrast(rgba(white, white, white, white, white), { mask });
  assert.equal(darkSpaces.tone, 'green');
  assert.deepEqual(darkSpaces, lightSpaces);
  assert.equal(analyzeLogoContrast(rgba(white, white, green, white, white), { mask }).tone, 'light');
});

test('the wordmark outweighs the larger opaque icon even with thin letter strokes', () => {
  const mask = rgba(black, black, black, black, black, black);
  for (let index = 2; index < 6; index++) mask[index * 4 + 3] = 48;
  const brightLetters = rgba(green, green, white, white, white, white);
  assert.equal(analyzeLogoContrast(brightLetters, { mask }).tone, 'light');
  assert.equal(analyzeLogoContrast(brightLetters, { mask, width: 6 }).tone, 'green');
  const greenLetters = rgba(white, white, green, green, green, green);
  assert.equal(analyzeLogoContrast(greenLetters, { mask, width: 6 }).tone, 'light');
});

test('one color must remain readable across bright and dark parts of the lettering', () => {
  const result = analyzeLogoContrast(rgba(black, black, white, white));
  assert.equal(result.tone, 'green');
  assert.ok(result.metrics.light.meanContrast > result.metrics.green.meanContrast);
  assert.ok(result.metrics.light.score < result.metrics.green.score);
  assert.equal(result.metrics.light.lowContrastFraction, 0.5);
  assert.equal(result.needsOutline, false);
});

test('pastel backgrounds get edge protection when neither brand color has sufficient contrast', () => {
  const result = analyzeLogoContrast(rgba([200, 180, 160]));
  assert.equal(result.tone, 'light');
  assert.equal(result.needsOutline, true);
  assert.ok(result.metrics.light.lowerContrast < 3);
  assert.ok(result.metrics.green.lowerContrast < 3);
});

test('well contrasted backgrounds do not receive unnecessary outlines', () => {
  for (const background of [black, white, green]) {
    assert.equal(analyzeLogoContrast(rgba(background)).needsOutline, false);
  }
});

test('edge protection responds to affected strokes without overreacting to isolated pixels', () => {
  const sparse = analyzeLogoContrast(rgba(...Array(99).fill(white), green));
  const mixed = analyzeLogoContrast(rgba(...Array(90).fill(white), ...Array(10).fill(green)));
  assert.equal(sparse.tone, 'green');
  assert.equal(sparse.needsOutline, false);
  assert.equal(mixed.tone, 'green');
  assert.equal(mixed.needsOutline, true);
});

test('hysteresis keeps near ties stable but follows a clearly better tone', () => {
  assert.equal(analyzeLogoContrast(rgba([195, 195, 195])).tone, 'green');
  assert.equal(analyzeLogoContrast(rgba([195, 195, 195]), { previousTone: 'light' }).tone, 'light');
  assert.equal(analyzeLogoContrast(rgba([194, 194, 194]), { previousTone: 'green' }).tone, 'green');
  assert.equal(analyzeLogoContrast(rgba([220, 220, 220]), { previousTone: 'light' }).tone, 'green');
  assert.equal(analyzeLogoContrast(rgba([150, 150, 150]), { previousTone: 'green' }).tone, 'light');
});

test('saturated scores still prefer white over dark backgrounds after showing green', () => {
  for (const background of [black, [8, 13, 20], [0, 45, 20]]) {
    const result = analyzeLogoContrast(rgba(background), { previousTone: 'green' });
    assert.equal(result.tone, 'light');
    assert.equal(result.needsOutline, false);
    assert.ok(result.metrics.light.meanContrast > result.metrics.green.meanContrast);
  }
});

test('fractional composited channels retain exact linear luminance', () => {
  const overlay = [232, 237, 235, 0.08];
  const color = [130, 180, 220];
  const linear = value => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  const weights = [0.2126, 0.7152, 0.0722];
  const expectedLuminance = color.reduce((total, value, index) => (
    total + weights[index] * linear(value * (1 - overlay[3]) + overlay[index] * overlay[3])
  ), 0);
  const result = analyzeLogoContrast(rgba(color), { overlay });
  assert.ok(Math.abs(result.metrics.light.meanContrast - 1.05 / (expectedLuminance + 0.05)) < 1e-12);
});

test('an empty or fully transparent mask uses the composited page background', () => {
  const result = analyzeLogoContrast(rgba(black), { mask: new Uint8ClampedArray(4), base: white });
  assert.equal(result.tone, 'green');
  assert.equal(result.needsOutline, false);
  assert.equal(analyzeLogoContrast([]).tone, 'light');
});
