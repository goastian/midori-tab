export const WIDGET_BOARD_MODE = Object.freeze({
  SINGLE: 'single',
  PAIR: 'pair',
  GRID: 'grid',
});

export function resolveResponsiveWidgetColumns({
  configuredColumns,
  viewportWidth,
  horizontalPadding = 32,
} = {}) {
  const configured = Math.min(4, Math.max(1, Number(configuredColumns) || 1));
  const width = Number(viewportWidth) || 0;
  if (!width) return configured;

  const availableWidth = Math.max(0, width - horizontalPadding);
  let fittingColumns = 1;
  if (availableWidth >= 680) fittingColumns = 2;
  if (availableWidth >= 920) fittingColumns = 3;
  if (availableWidth >= 1120) fittingColumns = 4;

  return Math.min(configured, fittingColumns);
}

export function resolveWidgetBoardMode(widgetCount) {
  const count = Math.max(0, Number(widgetCount) || 0);
  if (count <= 1) return WIDGET_BOARD_MODE.SINGLE;
  if (count === 2) return WIDGET_BOARD_MODE.PAIR;
  return WIDGET_BOARD_MODE.GRID;
}

export function moveWidget(order, sourceKey, targetKey, placement = 'before') {
  if (!Array.isArray(order)) return [];

  const next = [...order];
  const sourceIndex = next.indexOf(sourceKey);
  const targetIndex = next.indexOf(targetKey);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return next;

  next.splice(sourceIndex, 1);
  const nextTargetIndex = next.indexOf(targetKey);
  const insertionIndex = placement === 'after' ? nextTargetIndex + 1 : nextTargetIndex;
  next.splice(insertionIndex, 0, sourceKey);
  return next;
}

export function mergeWidgetSubset(fullOrder, orderedSubset) {
  if (!Array.isArray(fullOrder) || !Array.isArray(orderedSubset)) {
    return Array.isArray(fullOrder) ? [...fullOrder] : [];
  }

  const subset = [...orderedSubset];
  const subsetSet = new Set(subset);
  if (subsetSet.size !== subset.length) return [...fullOrder];

  const currentSubset = fullOrder.filter(key => subsetSet.has(key));
  if (currentSubset.length !== subset.length) return [...fullOrder];
  if (currentSubset.some(key => !subsetSet.has(key))) return [...fullOrder];

  let index = 0;
  return fullOrder.map(key => (subsetSet.has(key) ? subset[index++] : key));
}
