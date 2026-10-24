export const SPEED_DIAL_SIZES = Object.freeze([
  'icon',
  'tiny',
  'small',
  'medium',
  'large',
  'huge',
  'fit',
]);

export const SPEED_DIAL_TITLE_MODES = Object.freeze(['show', 'hover', 'hide']);

export const START_PAGE_DEFAULTS = Object.freeze({
  showSpeedDials: true,
  speedDialSize: 'tiny',
  speedDialColumns: 7,
  speedDialLimit: 8,
  speedDialTitleMode: 'show',
  showSpeedDialDeleteButton: true,
  showAddSpeedDialButton: true,
  widgetsEnabled: true,
  widgetColumns: 4,
});

const SPEED_DIAL_METRICS = Object.freeze({
  icon: { width: 72, minWidth: 64, height: 72, icon: 32 },
  tiny: { width: 104, minWidth: 92, height: 104, icon: 38 },
  small: { width: 124, minWidth: 108, height: 116, icon: 44 },
  medium: { width: 148, minWidth: 126, height: 132, icon: 52 },
  large: { width: 176, minWidth: 148, height: 152, icon: 62 },
  huge: { width: 216, minWidth: 176, height: 184, icon: 76 },
  fit: { width: 160, minWidth: 88, height: 128, icon: 50 },
});

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function normalizeStartPageSettings(settings = {}) {
  const speedDialSize = SPEED_DIAL_SIZES.includes(settings.speedDialSize)
    ? settings.speedDialSize
    : START_PAGE_DEFAULTS.speedDialSize;
  const speedDialTitleMode = SPEED_DIAL_TITLE_MODES.includes(settings.speedDialTitleMode)
    ? settings.speedDialTitleMode
    : START_PAGE_DEFAULTS.speedDialTitleMode;

  return {
    showSpeedDials: settings.showSpeedDials !== false,
    speedDialSize,
    speedDialColumns: clampInteger(
      settings.speedDialColumns,
      2,
      12,
      START_PAGE_DEFAULTS.speedDialColumns,
    ),
    speedDialLimit: clampInteger(
      settings.speedDialLimit,
      1,
      24,
      START_PAGE_DEFAULTS.speedDialLimit,
    ),
    speedDialTitleMode,
    showSpeedDialDeleteButton: settings.showSpeedDialDeleteButton !== false,
    showAddSpeedDialButton: settings.showAddSpeedDialButton !== false,
    widgetsEnabled: settings.widgetsEnabled !== false,
    widgetColumns: clampInteger(
      settings.widgetColumns,
      1,
      4,
      START_PAGE_DEFAULTS.widgetColumns,
    ),
  };
}

export function getSpeedDialMetrics(size) {
  return SPEED_DIAL_METRICS[size] || SPEED_DIAL_METRICS[START_PAGE_DEFAULTS.speedDialSize];
}

const SPEED_DIAL_GAP = 12;

/**
 * Inline custom properties for the speed dial layout. The column count is
 * resolved by CSS from the width the grid actually receives (see
 * bookmark-layout.css), so it never lags behind a resize.
 */
export function speedDialLayoutStyles({ size, columns } = {}) {
  const metrics = getSpeedDialMetrics(size);
  const count = clampInteger(columns, 2, 12, START_PAGE_DEFAULTS.speedDialColumns);
  const width = size === 'fit' ? 1080 : (count * (metrics.width + SPEED_DIAL_GAP)) - SPEED_DIAL_GAP;
  return {
    container: { maxWidth: `${Math.min(1080, width)}px` },
    grid: {
      '--dial-height': `${metrics.height}px`,
      '--dial-icon-size': `${metrics.icon}px`,
      '--dial-min': `${metrics.minWidth}px`,
      '--dial-columns': count,
    },
  };
}

export function requiresPaidDisclosure(ad) {
  return Boolean(
    ad
    && ad.disclosure_required === true
    && ad.billing?.funding_type === 'prepaid',
  );
}
