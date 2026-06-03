const GRID_KEYS = ['weather', 'currency', 'browserBookmarks', 'privacy', 'rss', 'calendar', 'notes', 'todo'];

const WIDGET_META = [
  { key: 'weather', icon: '⛅', labelKey: 'widgets.weather' },
  { key: 'currency', icon: '💹', labelKey: 'widgets.currency' },
  { key: 'browserBookmarks', icon: '🔖', labelKey: 'dashboard.quickSettings.bookmarks' },
  { key: 'privacy', icon: '🛡️', labelKey: 'widgets.privacy' },
  { key: 'calendar', icon: '📅', labelKey: 'widgets.calendar' },
  { key: 'notes', icon: '📝', labelKey: 'widgets.notes' },
  { key: 'todo', icon: '✅', labelKey: 'widgets.todo' },
  { key: 'rss', icon: '📰', labelKey: 'widgets.rss' },
];

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

  function toggleWidget(key) {
    widgetsStore.toggle(key);
  }

  return {
    getActiveGridWidgets,
    getAvailableWidgets,
    getWidgetComponentMap,
    toggleWidget,
  };
}
