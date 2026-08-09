const GRID_KEYS = ['weather', 'currency', 'browserBookmarks', 'privacy', 'rss', 'calendar', 'notes', 'todo'];

const WIDGET_META = [
  { key: 'weather', icon: 'weather', labelKey: 'widgets.weather', layout: 'compact' },
  { key: 'currency', icon: 'currency', labelKey: 'widgets.currency', layout: 'compact' },
  { key: 'browserBookmarks', icon: 'bookmark', labelKey: 'dashboard.quickSettings.bookmarks', layout: 'wide' },
  { key: 'privacy', icon: 'privacy', labelKey: 'widgets.privacy', layout: 'compact' },
  { key: 'calendar', icon: 'calendar', labelKey: 'widgets.calendar', layout: 'wide-tall' },
  { key: 'notes', icon: 'notes', labelKey: 'widgets.notes', layout: 'compact-tall' },
  { key: 'todo', icon: 'todo', labelKey: 'widgets.todo', layout: 'compact-tall' },
  { key: 'rss', icon: 'rss', labelKey: 'widgets.rss', layout: 'wide-tall' },
];

// PERF-202: altura real que reserva cada widget en su estado contenido, medida
// sobre el CSS de cada tarjeta. El placeholder del dashboard la reutiliza para
// minimizar el CLS cuando el widget asíncrono reemplaza al reservado.
const WIDGET_PLACEHOLDER_HEIGHTS = {
  weather: '235px',
  currency: '215px',
  browserBookmarks: '300px',
  privacy: '205px',
  calendar: '410px',
  notes: '265px',
  todo: '280px',
  rss: '360px',
};

const LAYOUT_FALLBACK_HEIGHTS = {
  'compact': '132px',
  'compact-tall': '220px',
  'wide': '150px',
  'wide-tall': '320px',
};

const WIDGET_COMPONENT_MAP = {
  weather: 'WeatherWidget',
  currency: 'CurrencyWidget',
  browserBookmarks: 'BrowserBookmarksWidget',
  privacy: 'PrivacyWidget',
  rss: 'RssWidget',
  calendar: 'CalendarWidget',
  notes: 'NotesWidget',
  todo: 'TodoWidget',
};

export function useWidgetManagement({ widgetsStore, i18n }) {
  function getActiveGridWidgets() {
    const orderedKeys = Array.isArray(widgetsStore.activeWidgets) ? widgetsStore.activeWidgets : [];
    const normalizedOrder = orderedKeys.length ? orderedKeys : GRID_KEYS;
    return normalizedOrder.filter(key => GRID_KEYS.includes(key) && widgetsStore.enabled[key]);
  }

  function getAvailableWidgets() {
    return WIDGET_META.map(widget => ({
      ...widget,
      label: i18n.$t(widget.labelKey),
    }));
  }

  function getWidgetComponentMap() {
    return WIDGET_COMPONENT_MAP;
  }

  function getWidgetMetaMap() {
    return Object.fromEntries(getAvailableWidgets().map(widget => [widget.key, widget]));
  }

  function getWidgetPlaceholderHeight(key) {
    const widget = WIDGET_META.find(entry => entry.key === key);
    if (!widget) return '132px';
    return WIDGET_PLACEHOLDER_HEIGHTS[key] || LAYOUT_FALLBACK_HEIGHTS[widget.layout] || '132px';
  }

  function toggleWidget(key) {
    widgetsStore.toggle(key);
  }

  return {
    getActiveGridWidgets,
    getAvailableWidgets,
    getWidgetComponentMap,
    getWidgetMetaMap,
    getWidgetPlaceholderHeight,
    toggleWidget,
  };
}
