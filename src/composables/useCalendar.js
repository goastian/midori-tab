import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { newId, touchItem } from '../services/itemIds.js';
import { contentEqual, mergeById } from '../services/listMerge.js';
import { createSyncedRecord } from '../services/syncedRecord.js';
import { createUndoBuffer } from '../services/undoBuffer.js';
import { normalizeEvents } from '../services/widgetData.js';
import { WIDGET_COST } from './useWidgetRuntime.js';

const STORAGE_KEY = 'midori_calendar_events';
const CALENDAR_MAX_BYTES = 160_000;
const MAX_REMINDER_TIMEOUT = 24 * 60 * 60 * 1000;
export const CALENDAR_WIDGET_POLICY = Object.freeze({
  key: 'calendar-reminders',
  cost: WIDGET_COST.LOW,
  usesNetwork: false,
  ttlMs: 60 * 1000,
  stale: true,
  refresh: 'foreground-reminder-timer, event-change, visibilitychange',
});

function pad(value) {
  return String(value).padStart(2, '0');
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseEventDateTime(dateKey, time) {
  if (!dateKey) return null;
  const [year, month, day] = dateKey.split('-').map(Number);
  if (!year || !month || !day) return null;
  const [hours, minutes] = (time || '09:00').split(':').map(Number);
  return new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
}

function createDraft(dateKey, source = null) {
  return {
    title: source?.title || '',
    date: source?.date || dateKey,
    time: source?.time || '09:00',
    location: source?.location || '',
    notes: source?.notes || '',
    reminderMinutes: Number.isFinite(source?.reminderMinutes) ? source.reminderMinutes : 15,
  };
}

function normalizeEvent(event) {
  return normalizeEvents([event])[0];
}

const sameEvent = (left, right) => contentEqual(left, right, ['notifiedAt']);

/** A reminder shown in one tab must not come back in another; it is not an edit of the event. */
function settleEvent(chosen, local, remote) {
  if (chosen.notifiedAt) return chosen;
  const source = [local, remote].find(item => item.notifiedAt && sameEvent(item, chosen));
  return source ? { ...chosen, notifiedAt: source.notifiedAt } : chosen;
}

function sortEvents(events) {
  return [...events].sort((left, right) => {
    const leftDate = parseEventDateTime(left.date, left.time)?.getTime() || 0;
    const rightDate = parseEventDateTime(right.date, right.time)?.getTime() || 0;
    return leftDate - rightDate;
  });
}

export function useCalendar(i18n) {
  const now = new Date();
  const defaultDate = formatDateKey(now);

  const viewMonth = ref(now.getMonth());
  const viewYear = ref(now.getFullYear());
  const selectedDate = ref(defaultDate);
  const events = ref([]);
  const composerOpen = ref(false);
  const editingEventId = ref(null);
  const draft = ref(createDraft(defaultDate));
  const formError = ref('');
  const activeReminders = ref([]);
  const reminderTimer = ref(null);
  const visibilityListener = ref(null);
  const storage = ref({ load: 'idle', save: 'idle', error: null });
  const undoEntry = ref(null);
  const ready = computed(() => storage.value.load === 'ready');
  const undoBuffer = createUndoBuffer(entry => { undoEntry.value = entry; });
  const record = createSyncedRecord({
    key: STORAGE_KEY,
    maxBytes: CALENDAR_MAX_BYTES,
    delayMs: 600,
    empty: () => [],
    normalize: normalizeEvents,
    merge: (base, local, remote) => mergeById(base, local, remote, { same: sameEvent, settle: settleEvent }),
    getValue: () => events.value,
    setValue: value => {
      events.value = sortEvents(value);
      // Another tab may have added or moved events after the first load.
      if (ready.value) { checkReminders(); scheduleReminderCheck(); }
    },
    onState: state => { storage.value = state; },
  });

  const currentLocale = computed(() => i18n.locale || undefined);
  const year = computed(() => viewYear.value);
  const monthName = computed(() => new Date(viewYear.value, viewMonth.value).toLocaleString(currentLocale.value, { month: 'long' }));

  const dayLabels = computed(() => {
    const formatter = new Intl.DateTimeFormat(currentLocale.value, { weekday: 'short' });
    const baseMonday = new Date(Date.UTC(2024, 0, 1));

    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(baseMonday);
      day.setUTCDate(baseMonday.getUTCDate() + index);
      const label = formatter.format(day).replace('.', '');
      return label.charAt(0).toUpperCase() + label.slice(1);
    });
  });

  const cells = computed(() => {
    const first = new Date(viewYear.value, viewMonth.value, 1);
    let startDay = first.getDay() - 1;
    if (startDay < 0) startDay = 6;

    const allCells = [];
    const firstCellDate = new Date(viewYear.value, viewMonth.value, 1 - startDay);
    const todayKey = formatDateKey(new Date());

    for (let index = 0; index < 42; index++) {
      const cellDate = new Date(firstCellDate);
      cellDate.setDate(firstCellDate.getDate() + index);
      const dateKey = formatDateKey(cellDate);
      const eventCount = events.value.filter(event => event.date === dateKey).length;

      allCells.push({
        day: cellDate.getDate(),
        dateKey,
        eventCount,
        otherMonth: cellDate.getMonth() !== viewMonth.value,
        isToday: dateKey === todayKey,
        isSelected: dateKey === selectedDate.value,
        month: cellDate.getMonth(),
        year: cellDate.getFullYear(),
      });
    }

    return allCells;
  });

  const selectedDayEvents = computed(() => sortEvents(events.value.filter(event => event.date === selectedDate.value)));

  const selectedDateLabel = computed(() => {
    const date = parseEventDateTime(selectedDate.value, '12:00');
    return date
      ? date.toLocaleDateString(currentLocale.value, {
          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        })
      : (i18n.t.calendar.dateInvalid || '');
  });

  const todayFormatted = computed(() => new Date().toLocaleDateString(currentLocale.value, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }));

  const agendaSubtitle = computed(() => {
    const copy = i18n.t.calendar;
    if (!selectedDayEvents.value.length) return copy.noEvents;
    return copy.eventsCount.replace('{n}', selectedDayEvents.value.length);
  });

  const reminderOptions = computed(() => {
    const copy = i18n.t.calendar;
    return [
      { value: 0, label: copy.reminderNone },
      { value: 5, label: copy.reminder5 },
      { value: 15, label: copy.reminder15 },
      { value: 30, label: copy.reminder30 },
      { value: 60, label: copy.reminder60 },
      { value: 1440, label: copy.reminder1440 },
    ];
  });

  function persistEvents() {
    void record.touch();
  }

  function clearReminderTimer() {
    if (reminderTimer.value) {
      window.clearTimeout(reminderTimer.value);
      reminderTimer.value = null;
    }
  }

  function getNextReminderDelay() {
    const nowTs = Date.now();
    let nextTs = Infinity;

    for (const event of events.value) {
      if (!event.reminderMinutes || event.notifiedAt) continue;
      const eventStart = parseEventDateTime(event.date, event.time);
      if (!eventStart) continue;
      const reminderAt = eventStart.getTime() - (event.reminderMinutes * 60 * 1000);
      if (reminderAt < nextTs) nextTs = reminderAt;
    }

    if (!Number.isFinite(nextTs)) return null;
    return Math.max(0, Math.min(nextTs - nowTs, MAX_REMINDER_TIMEOUT));
  }

  function scheduleReminderCheck() {
    clearReminderTimer();
    if (document.visibilityState === 'hidden') return;

    const delay = getNextReminderDelay();
    if (delay === null) return;

    reminderTimer.value = window.setTimeout(() => {
      reminderTimer.value = null;
      checkReminders();
      scheduleReminderCheck();
    }, delay);
  }

  function prevMonth() {
    if (viewMonth.value === 0) {
      viewMonth.value = 11;
      viewYear.value -= 1;
      return;
    }
    viewMonth.value -= 1;
  }

  function nextMonth() {
    if (viewMonth.value === 11) {
      viewMonth.value = 0;
      viewYear.value += 1;
      return;
    }
    viewMonth.value += 1;
  }

  function selectDate(cell) {
    selectedDate.value = cell.dateKey;
    if (cell.otherMonth) {
      viewMonth.value = cell.month;
      viewYear.value = cell.year;
    }
  }

  function openComposer(dateKey = selectedDate.value, event = null) {
    selectedDate.value = dateKey;
    editingEventId.value = event?.id || null;
    draft.value = createDraft(dateKey, event);
    formError.value = '';
    composerOpen.value = true;
  }

  function closeComposer() {
    composerOpen.value = false;
    editingEventId.value = null;
    formError.value = '';
    draft.value = createDraft(selectedDate.value);
  }

  function checkReminders() {
    const nowTs = Date.now();
    const pendingReminders = [];
    let touchedEvents = false;

    events.value = events.value.map(event => {
      if (!event.reminderMinutes || event.notifiedAt) {
        return event;
      }

      const eventStart = parseEventDateTime(event.date, event.time);
      if (!eventStart) {
        return event;
      }

      const reminderAt = eventStart.getTime() - (event.reminderMinutes * 60 * 1000);
      if (reminderAt > nowTs) {
        return event;
      }

      pendingReminders.push(event);
      touchedEvents = true;
      return {
        ...event,
        notifiedAt: new Date(nowTs).toISOString(),
      };
    });

    if (pendingReminders.length) {
      const knownIds = new Set(activeReminders.value.map(reminder => reminder.id));
      const nextReminders = [...activeReminders.value];

      pendingReminders.forEach(event => {
        if (!knownIds.has(event.id)) {
          nextReminders.push(event);
        }
      });

      activeReminders.value = sortEvents(nextReminders);
    }

    if (touchedEvents) {
      persistEvents();
    }
  }

  function saveEvent() {
    if (!ready.value) return;
    const title = draft.value.title.trim();
    if (!title) {
      formError.value = i18n.t.calendar.errorTitleRequired;
      return;
    }
    if (!draft.value.date) {
      formError.value = i18n.t.calendar.errorDateRequired;
      return;
    }

    const existingIndex = events.value.findIndex(event => event.id === editingEventId.value);
    const existingEvent = existingIndex >= 0 ? events.value[existingIndex] : null;
    const reminderMinutes = Number(draft.value.reminderMinutes) || 0;

    const nextEvent = normalizeEvent({
      id: existingEvent?.id || newId(),
      rev: existingEvent?.rev,
      title,
      date: draft.value.date,
      time: draft.value.time || '09:00',
      location: draft.value.location.trim(),
      notes: draft.value.notes.trim(),
      reminderMinutes,
      notifiedAt: existingEvent?.notifiedAt || null,
    });
    Object.assign(nextEvent, existingEvent ? touchItem(nextEvent) : { updatedAt: Date.now() });

    if (
      !existingEvent ||
      existingEvent.date !== nextEvent.date ||
      existingEvent.time !== nextEvent.time ||
      existingEvent.reminderMinutes !== nextEvent.reminderMinutes
    ) {
      nextEvent.notifiedAt = null;
    }

    if (existingIndex >= 0) {
      events.value.splice(existingIndex, 1, nextEvent);
    } else {
      events.value.push(nextEvent);
    }

    events.value = sortEvents(events.value);
    selectedDate.value = nextEvent.date;
    persistEvents();
    closeComposer();
    checkReminders();
    scheduleReminderCheck();
  }

  function removeEvent(eventId) {
    const index = events.value.findIndex(event => event.id === eventId);
    if (!ready.value || index < 0) return;
    const removed = events.value[index];
    events.value = events.value.filter(event => event.id !== eventId);
    activeReminders.value = activeReminders.value.filter(reminder => reminder.id !== eventId);
    undoBuffer.push({ label: removed.title, restore: () => restoreEvent(removed) });
    persistEvents();
    scheduleReminderCheck();
  }

  function restoreEvent(event) {
    if (!ready.value || events.value.some(item => item.id === event.id)) return;
    events.value = sortEvents([...events.value, event]);
    selectedDate.value = event.date;
    persistEvents();
    scheduleReminderCheck();
  }

  function retryStorage() {
    void record.retry().then(loaded => {
      if (loaded && ready.value) { checkReminders(); scheduleReminderCheck(); }
    });
  }

  function reminderCopy(minutes) {
    const copy = i18n.t.calendar;
    if (!minutes) return copy.reminderNone;
    if (minutes < 60) return copy.remindMinutes.replace('{n}', minutes);
    if (minutes === 60) return copy.remindHour;
    if (minutes % 1440 === 0) {
      const days = minutes / 1440;
      return days === 1 ? copy.remindDay : copy.remindDays.replace('{n}', days);
    }
    return copy.remindHours.replace('{n}', Math.round(minutes / 60));
  }

  function formatEventMoment(event) {
    const date = parseEventDateTime(event.date, event.time);
    if (!date) return i18n.t.calendar.dateUnavailable;
    return date.toLocaleString(currentLocale.value, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function dismissReminder(eventId) {
    activeReminders.value = activeReminders.value.filter(reminder => reminder.id !== eventId);
  }

  function handleEscape(event) {
    if (event.key === 'Escape' && composerOpen.value) {
      closeComposer();
    }
  }

  onMounted(async () => {
    visibilityListener.value = () => {
      if (document.visibilityState === 'hidden') {
        clearReminderTimer();
        void record.flush();
        return;
      }
      checkReminders();
      scheduleReminderCheck();
    };
    document.addEventListener('visibilitychange', visibilityListener.value);
    document.addEventListener('keydown', handleEscape);
    if (await record.load()) {
      checkReminders();
      scheduleReminderCheck();
    }
  });

  onBeforeUnmount(() => {
    clearReminderTimer();
    void record.flush();
    record.dispose();
    undoBuffer.clear();
    if (visibilityListener.value) {
      document.removeEventListener('visibilitychange', visibilityListener.value);
    }
    document.removeEventListener('keydown', handleEscape);
  });

  return {
    widgetPolicy: CALENDAR_WIDGET_POLICY,
    storage,
    ready,
    retryStorage,
    undoEntry,
    undoLast: () => undoBuffer.undo(),
    dismissUndo: () => undoBuffer.clear(),
    year,
    monthName,
    dayLabels,
    cells,
    selectedDate,
    selectedDayEvents,
    selectedDateLabel,
    todayFormatted,
    agendaSubtitle,
    reminderOptions,
    composerOpen,
    editingEventId,
    draft,
    formError,
    activeReminders,
    prevMonth,
    nextMonth,
    selectDate,
    openComposer,
    closeComposer,
    saveEvent,
    removeEvent,
    reminderCopy,
    formatEventMoment,
    dismissReminder,
  };
}
