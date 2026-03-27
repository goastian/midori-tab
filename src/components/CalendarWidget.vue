<template>
  <div class="calendar-widget">
    <div class="cal-header">
      <button class="cal-nav" type="button" @click="prevMonth">‹</button>
      <span class="cal-month">{{ monthName }} {{ year }}</span>
      <button class="cal-nav" type="button" @click="nextMonth">›</button>
    </div>

    <div class="cal-grid">
      <span v-for="d in dayLabels" :key="d" class="cal-day-label">{{ d }}</span>
      <button
        v-for="cell in cells"
        :key="cell.dateKey"
        type="button"
        :class="['cal-cell', {
          today: cell.isToday,
          other: cell.otherMonth,
          selected: cell.isSelected,
          'has-events': cell.eventCount > 0,
        }]"
        @click="selectDate(cell)"
      >
        <span class="cal-cell-day">{{ cell.day }}</span>
        <span v-if="cell.eventCount" class="cal-cell-count">{{ cell.eventCount }}</span>
      </button>
    </div>

    <!-- Agenda / Form — toggled inline inside the widget -->
    <Transition name="cal-view" mode="out-in">
      <div v-if="!composerOpen" key="agenda" class="cal-agenda">
        <div class="cal-agenda-header">
          <div>
            <div class="cal-agenda-title">{{ selectedDateLabel }}</div>
            <div class="cal-agenda-subtitle">{{ agendaSubtitle }}</div>
          </div>
          <button class="cal-primary-btn" type="button" @click="openComposer(selectedDate)">
            + {{ i18n.t.calendar.newEvent }}
          </button>
        </div>

        <div v-if="selectedDayEvents.length" class="cal-event-list">
          <article v-for="event in selectedDayEvents" :key="event.id" class="cal-event-card">
            <div class="cal-event-top">
              <div class="cal-event-info">
                <div class="cal-event-title">{{ event.title }}</div>
                <div class="cal-event-meta">
                  <span>{{ event.time || i18n.t.calendar.noTime }}</span>
                  <span v-if="event.location">· {{ event.location }}</span>
                </div>
              </div>
              <div class="cal-event-actions">
                <button class="cal-ghost-btn" type="button" @click="openComposer(event.date, event)">{{ i18n.t.calendar.edit }}</button>
                <button class="cal-ghost-btn danger" type="button" @click="removeEvent(event.id)">{{ i18n.t.calendar.delete }}</button>
              </div>
            </div>
            <p v-if="event.notes" class="cal-event-notes">{{ event.notes }}</p>
            <div class="cal-event-reminder">{{ reminderCopy(event.reminderMinutes) }}</div>
          </article>
        </div>
        <p v-else class="cal-empty-state">{{ i18n.t.calendar.noEventsHint }}</p>
      </div>

      <div v-else key="form" class="cal-form-panel" role="form" :aria-label="i18n.t.calendar.newEvent">
        <div class="cal-form-panel-header">
          <button class="cal-back-btn" type="button" @click="closeComposer">‹</button>
          <span class="cal-form-panel-title">{{ editingEventId ? i18n.t.calendar.editEvent : i18n.t.calendar.newEvent }}</span>
          <button class="cal-close-btn" type="button" @click="closeComposer">✕</button>
        </div>

        <div class="cal-form-grid">
          <label class="cal-field cal-field-full">
            <span class="cal-label">{{ i18n.t.calendar.fieldTitle }}</span>
            <input v-model.trim="draft.title" class="cal-input" type="text" :placeholder="i18n.t.calendar.fieldTitlePlaceholder" />
          </label>

          <label class="cal-field">
            <span class="cal-label">{{ i18n.t.calendar.fieldDate }}</span>
            <input v-model="draft.date" class="cal-input" type="date" />
          </label>

          <label class="cal-field">
            <span class="cal-label">{{ i18n.t.calendar.fieldTime }}</span>
            <input v-model="draft.time" class="cal-input" type="time" />
          </label>

          <label class="cal-field cal-field-full">
            <span class="cal-label">{{ i18n.t.calendar.fieldLocation }}</span>
            <input v-model.trim="draft.location" class="cal-input" type="text" :placeholder="i18n.t.calendar.fieldLocationPlaceholder" />
          </label>

          <label class="cal-field cal-field-full">
            <span class="cal-label">{{ i18n.t.calendar.fieldReminder }}</span>
            <select v-model.number="draft.reminderMinutes" class="cal-input cal-select">
              <option v-for="option in reminderOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>

          <label class="cal-field cal-field-full">
            <span class="cal-label">{{ i18n.t.calendar.fieldNotes }}</span>
            <textarea v-model.trim="draft.notes" class="cal-input cal-textarea" rows="3" :placeholder="i18n.t.calendar.fieldNotesPlaceholder"></textarea>
          </label>
        </div>

        <p v-if="formError" class="cal-form-error">{{ formError }}</p>

        <div class="cal-form-actions">
          <button class="cal-ghost-btn" type="button" @click="closeComposer">{{ i18n.t.calendar.cancel }}</button>
          <button class="cal-primary-btn" type="button" @click="saveEvent">
            {{ editingEventId ? i18n.t.calendar.saveChanges : i18n.t.calendar.createEvent }}
          </button>
        </div>
      </div>
    </Transition>

    <div class="cal-today-bar">
      <span class="cal-today-label">{{ todayFormatted }}</span>
    </div>
  </div>

  <!-- Reminder notifications: bottom-right corner ONLY -->
  <Teleport to="body">
    <TransitionGroup name="cal-reminder-stack" tag="div" class="cal-reminder-stack">
      <aside v-for="reminder in activeReminders" :key="reminder.id" class="cal-reminder-popup">
        <div class="cal-reminder-header">
          <span class="cal-reminder-badge">{{ i18n.t.calendar.reminderBadge }}</span>
          <button class="cal-reminder-close" type="button" @click="dismissReminder(reminder.id)">✕</button>
        </div>
        <div class="cal-reminder-title">{{ reminder.title }}</div>
        <div class="cal-reminder-meta">{{ formatEventMoment(reminder) }}</div>
        <div v-if="reminder.location" class="cal-reminder-location">{{ reminder.location }}</div>
        <p v-if="reminder.notes" class="cal-reminder-notes">{{ reminder.notes }}</p>
      </aside>
    </TransitionGroup>
  </Teleport>
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';

const STORAGE_KEY = 'midori_calendar_events';
const REMINDER_CHECK_INTERVAL = 30000;

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
  return {
    id: event.id,
    title: event.title || '',
    date: event.date,
    time: event.time || '09:00',
    location: event.location || '',
    notes: event.notes || '',
    reminderMinutes: Number.isFinite(event.reminderMinutes) ? event.reminderMinutes : 15,
    notifiedAt: event.notifiedAt || null,
  };
}

function createEventId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `evt_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function sortEvents(events) {
  return [...events].sort((left, right) => {
    const leftDate = parseEventDateTime(left.date, left.time)?.getTime() || 0;
    const rightDate = parseEventDateTime(right.date, right.time)?.getTime() || 0;
    return leftDate - rightDate;
  });
}

export default {
  name: 'CalendarWidget',

  data() {
    const now = new Date();
    const selectedDate = formatDateKey(now);
    let savedEvents = [];

    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(raw)) {
        savedEvents = sortEvents(raw.map(normalizeEvent).filter(event => event.date && event.id));
      }
    } catch {
      savedEvents = [];
    }

    return {
      i18n: useI18nStore(),
      viewMonth: now.getMonth(),
      viewYear: now.getFullYear(),
      selectedDate,
      events: savedEvents,
      composerOpen: false,
      editingEventId: null,
      draft: createDraft(selectedDate),
      formError: '',
      activeReminders: [],
      reminderTimer: null,
    };
  },

  computed: {
    currentLocale() {
      return this.i18n.locale || undefined;
    },
    year() {
      return this.viewYear;
    },
    monthName() {
      return new Date(this.viewYear, this.viewMonth).toLocaleString(this.currentLocale, { month: 'long' });
    },
    dayLabels() {
      const formatter = new Intl.DateTimeFormat(this.currentLocale, { weekday: 'short' });
      const baseMonday = new Date(Date.UTC(2024, 0, 1));

      return Array.from({ length: 7 }, (_, index) => {
        const day = new Date(baseMonday);
        day.setUTCDate(baseMonday.getUTCDate() + index);
        const label = formatter.format(day).replace('.', '');
        return label.charAt(0).toUpperCase() + label.slice(1);
      });
    },
    cells() {
      const first = new Date(this.viewYear, this.viewMonth, 1);
      let startDay = first.getDay() - 1;
      if (startDay < 0) startDay = 6;

      const cells = [];
      const firstCellDate = new Date(this.viewYear, this.viewMonth, 1 - startDay);
      const todayKey = formatDateKey(new Date());

      for (let index = 0; index < 42; index++) {
        const cellDate = new Date(firstCellDate);
        cellDate.setDate(firstCellDate.getDate() + index);
        const dateKey = formatDateKey(cellDate);
        const eventCount = this.events.filter(event => event.date === dateKey).length;

        cells.push({
          day: cellDate.getDate(),
          dateKey,
          eventCount,
          otherMonth: cellDate.getMonth() !== this.viewMonth,
          isToday: dateKey === todayKey,
          isSelected: dateKey === this.selectedDate,
          month: cellDate.getMonth(),
          year: cellDate.getFullYear(),
        });
      }

      return cells;
    },
    selectedDayEvents() {
      return sortEvents(this.events.filter(event => event.date === this.selectedDate));
    },
    selectedDateLabel() {
      const date = parseEventDateTime(this.selectedDate, '12:00');
      return date
        ? date.toLocaleDateString(this.currentLocale, {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })
        : (this.i18n.t.calendar.dateInvalid || '');
    },
    todayFormatted() {
      return new Date().toLocaleDateString(this.currentLocale, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
    },
    agendaSubtitle() {
      const c = this.i18n.t.calendar;
      if (!this.selectedDayEvents.length) return c.noEvents;
      return c.eventsCount.replace('{n}', this.selectedDayEvents.length);
    },
    reminderOptions() {
      const c = this.i18n.t.calendar;
      return [
        { value: 0, label: c.reminderNone },
        { value: 5, label: c.reminder5 },
        { value: 15, label: c.reminder15 },
        { value: 30, label: c.reminder30 },
        { value: 60, label: c.reminder60 },
        { value: 1440, label: c.reminder1440 },
      ];
    },
  },

  mounted() {
    this.checkReminders();
    this.reminderTimer = window.setInterval(() => this.checkReminders(), REMINDER_CHECK_INTERVAL);
    document.addEventListener('keydown', this.handleEscape);
  },

  beforeUnmount() {
    if (this.reminderTimer) {
      window.clearInterval(this.reminderTimer);
    }
    document.removeEventListener('keydown', this.handleEscape);
  },

  methods: {
    persistEvents() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.events));
    },

    prevMonth() {
      if (this.viewMonth === 0) {
        this.viewMonth = 11;
        this.viewYear -= 1;
        return;
      }
      this.viewMonth -= 1;
    },

    nextMonth() {
      if (this.viewMonth === 11) {
        this.viewMonth = 0;
        this.viewYear += 1;
        return;
      }
      this.viewMonth += 1;
    },

    selectDate(cell) {
      this.selectedDate = cell.dateKey;
      if (cell.otherMonth) {
        this.viewMonth = cell.month;
        this.viewYear = cell.year;
      }
    },

    openComposer(dateKey = this.selectedDate, event = null) {
      this.selectedDate = dateKey;
      this.editingEventId = event?.id || null;
      this.draft = createDraft(dateKey, event);
      this.formError = '';
      this.composerOpen = true;
    },

    closeComposer() {
      this.composerOpen = false;
      this.editingEventId = null;
      this.formError = '';
      this.draft = createDraft(this.selectedDate);
    },

    saveEvent() {
      const title = this.draft.title.trim();
      if (!title) {
        this.formError = this.i18n.t.calendar.errorTitleRequired;
        return;
      }
      if (!this.draft.date) {
        this.formError = this.i18n.t.calendar.errorDateRequired;
        return;
      }

      const existingIndex = this.events.findIndex(event => event.id === this.editingEventId);
      const existingEvent = existingIndex >= 0 ? this.events[existingIndex] : null;
      const reminderMinutes = Number(this.draft.reminderMinutes) || 0;

      const nextEvent = normalizeEvent({
        id: existingEvent?.id || createEventId(),
        title,
        date: this.draft.date,
        time: this.draft.time || '09:00',
        location: this.draft.location.trim(),
        notes: this.draft.notes.trim(),
        reminderMinutes,
        notifiedAt: existingEvent?.notifiedAt || null,
      });

      if (
        !existingEvent ||
        existingEvent.date !== nextEvent.date ||
        existingEvent.time !== nextEvent.time ||
        existingEvent.reminderMinutes !== nextEvent.reminderMinutes
      ) {
        nextEvent.notifiedAt = null;
      }

      if (existingIndex >= 0) {
        this.events.splice(existingIndex, 1, nextEvent);
      } else {
        this.events.push(nextEvent);
      }

      this.events = sortEvents(this.events);
      this.selectedDate = nextEvent.date;
      this.persistEvents();
      this.closeComposer();
      this.checkReminders();
    },

    removeEvent(eventId) {
      this.events = this.events.filter(event => event.id !== eventId);
      this.activeReminders = this.activeReminders.filter(reminder => reminder.id !== eventId);
      this.persistEvents();
    },

    reminderCopy(minutes) {
      const c = this.i18n.t.calendar;
      if (!minutes) return c.reminderNone;
      if (minutes < 60) return c.remindMinutes.replace('{n}', minutes);
      if (minutes === 60) return c.remindHour;
      if (minutes % 1440 === 0) {
        const days = minutes / 1440;
        return days === 1 ? c.remindDay : c.remindDays.replace('{n}', days);
      }
      return c.remindHours.replace('{n}', Math.round(minutes / 60));
    },

    formatEventMoment(event) {
      const date = parseEventDateTime(event.date, event.time);
      if (!date) return this.i18n.t.calendar.dateUnavailable;
      return date.toLocaleString(this.currentLocale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    },

    dismissReminder(eventId) {
      this.activeReminders = this.activeReminders.filter(reminder => reminder.id !== eventId);
    },

    checkReminders() {
      const now = Date.now();
      const pendingReminders = [];
      let touchedEvents = false;

      this.events = this.events.map(event => {
        if (!event.reminderMinutes || event.notifiedAt) {
          return event;
        }

        const eventStart = parseEventDateTime(event.date, event.time);
        if (!eventStart) {
          return event;
        }

        const reminderAt = eventStart.getTime() - (event.reminderMinutes * 60 * 1000);
        if (reminderAt > now) {
          return event;
        }

        pendingReminders.push(event);
        touchedEvents = true;
        return {
          ...event,
          notifiedAt: new Date(now).toISOString(),
        };
      });

      if (pendingReminders.length) {
        const knownIds = new Set(this.activeReminders.map(reminder => reminder.id));
        const nextReminders = [...this.activeReminders];

        pendingReminders.forEach(event => {
          if (!knownIds.has(event.id)) {
            nextReminders.push(event);
          }
        });

        this.activeReminders = sortEvents(nextReminders);
      }

      if (touchedEvents) {
        this.persistEvents();
      }
    },

    handleEscape(event) {
      if (event.key === 'Escape' && this.composerOpen) {
        this.closeComposer();
      }
    },
  },
};
</script>

<style scoped>
.calendar-widget {
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  padding: 0.8rem;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.cal-header,
.cal-agenda-header,
.cal-event-top,
.cal-form-actions,
.cal-reminder-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.cal-month,
.cal-agenda-title,
.cal-event-title,
.cal-form-panel-title,
.cal-reminder-title {
  color: var(--color-text, #C4F0E0);
}

.cal-month {
  font-weight: 600;
  font-size: 0.85rem;
  text-transform: capitalize;
}

.cal-nav,
.cal-ghost-btn,
.cal-primary-btn,
.cal-close-btn,
.cal-cell {
  border: none;
  cursor: pointer;
}

.cal-nav {
  background: none;
  color: var(--color-text-muted, #5A9A82);
  font-size: 1.1rem;
  padding: 0.2rem 0.5rem;
  border-radius: var(--radius-sm, 6px);
  transition: background var(--transition-fast, 0.1s ease), color var(--transition-fast, 0.1s ease);
}

.cal-nav:hover,
.cal-ghost-btn:hover,
.cal-close-btn:hover {
  background: var(--color-accent-bg, rgba(4,164,105,0.08));
  color: var(--color-text, #C4F0E0);
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.cal-day-label {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--color-text-muted, #5A9A82);
  padding: 0.2rem 0;
  text-align: center;
}

.cal-cell {
  min-height: 42px;
  background: transparent;
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text, #C4F0E0);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-start;
  padding: 0.35rem;
  transition: background var(--transition-fast, 0.1s ease), transform var(--transition-fast, 0.1s ease);
}

.cal-cell:hover {
  background: var(--color-accent-bg);
  transform: translateY(-1px);
}

.cal-cell.other {
  color: var(--color-text-dim, #3A5B4D);
}

.cal-cell.today {
  background: var(--color-accent-bg);
}

.cal-cell.selected {
  outline: 1px solid var(--color-border-hover);
  background: var(--color-accent-bg);
}

.cal-cell-day {
  font-size: 0.78rem;
  font-weight: 600;
}

.cal-cell-count {
  min-width: 1.25rem;
  padding: 0.05rem 0.35rem;
  border-radius: 999px;
  background: var(--color-primary, #04A469);
  color: white;
  font-size: 0.65rem;
  font-weight: 700;
}

.cal-agenda {
  background: var(--surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.cal-agenda-title,
.cal-form-panel-title,
.cal-reminder-title {
  font-size: 0.92rem;
  font-weight: 700;
  text-transform: capitalize;
}

.cal-agenda-subtitle,
.cal-event-meta,
.cal-event-reminder,
.cal-reminder-meta,
.cal-reminder-location,
.cal-today-label,
.cal-label {
  color: var(--color-text-muted, #5A9A82);
}

.cal-agenda-subtitle,
.cal-event-meta,
.cal-event-reminder,
.cal-reminder-meta,
.cal-reminder-location,
.cal-today-label {
  font-size: 0.72rem;
}

.cal-primary-btn,
.cal-ghost-btn,
.cal-close-btn {
  border-radius: var(--radius-sm, 6px);
  font-size: 0.75rem;
  font-weight: 600;
}

.cal-primary-btn {
  background: var(--color-primary, #04A469);
  color: white;
  padding: 0.45rem 0.8rem;
}

.cal-primary-btn:hover {
  background: var(--color-primary-hover, #4de0b2);
}

.cal-ghost-btn,
.cal-close-btn {
  background: var(--surface-overlay);
  color: var(--color-text-muted, #5A9A82);
  padding: 0.35rem 0.65rem;
}

.cal-ghost-btn.danger:hover {
  background: rgba(225, 112, 85, 0.14);
  color: #f7b0a0;
}

.cal-close-btn {
  width: 34px;
  height: 34px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.cal-close-btn.small {
  width: 28px;
  height: 28px;
}

.cal-event-list {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  max-height: 220px;
  overflow-y: auto;
}

.cal-event-card {
  padding: 0.55rem;
  border-radius: 10px;
  background: var(--surface-raised);
  border: 1px solid var(--color-border);
}

.cal-event-info {
  flex: 1;
  min-width: 0;
}

.cal-event-actions {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
}

.cal-event-notes,
.cal-empty-state,
.cal-reminder-notes,
.cal-form-error {
  margin: 0;
  font-size: 0.76rem;
  line-height: 1.5;
}

.cal-event-notes,
.cal-empty-state,
.cal-reminder-notes {
  color: var(--color-text-secondary, #7EC4A8);
}

.cal-empty-state {
  text-align: center;
  padding: 0.75rem 0.35rem;
}

.cal-today-bar {
  padding-top: 0.15rem;
  border-top: 1px solid var(--color-border, rgba(126,196,168,0.1));
  text-align: center;
}

/* ===== Inline Form Panel ===== */
.cal-form-panel {
  background: var(--surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 0.65rem;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.cal-form-panel-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.cal-back-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--color-text-muted, #5A9A82);
  font-size: 1.1rem;
  padding: 0.2rem 0.4rem;
  border-radius: var(--radius-sm, 6px);
  transition: background var(--transition-fast, 0.1s ease), color var(--transition-fast, 0.1s ease);
}

.cal-back-btn:hover {
  background: var(--color-accent-bg, rgba(4,164,105,0.08));
  color: var(--color-text, #C4F0E0);
}

.cal-form-panel-title {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text, #C4F0E0);
}

.cal-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.cal-form-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

/* ===== View transition ===== */
.cal-view-enter-active,
.cal-view-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.cal-view-enter-from {
  opacity: 0;
  transform: translateX(6px);
}

.cal-view-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}

.cal-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.cal-field-full {
  grid-column: 1 / -1;
}

.cal-label {
  font-size: 0.72rem;
  font-weight: 600;
}

.cal-input {
  width: 100%;
  background: var(--surface-sunken);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  color: var(--color-text, #C4F0E0);
  font-size: 0.82rem;
  padding: 0.62rem 0.7rem;
  outline: none;
  font-family: inherit;
}

.cal-input:focus {
  border-color: var(--color-primary, #04A469);
}

.cal-select {
  appearance: none;
}

.cal-textarea {
  resize: vertical;
  min-height: 92px;
}

.cal-form-error {
  color: #f7b0a0;
  margin-top: 0;
}

.cal-reminder-stack {
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  pointer-events: none;
}

.cal-reminder-popup {
  width: min(340px, calc(100vw - 2rem));
  border-radius: 14px;
  border: 1px solid var(--color-border);
  background: var(--surface-base);
  backdrop-filter: blur(16px);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.28);
  padding: 0.85rem;
  pointer-events: auto;
}

.cal-reminder-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.45rem;
  border-radius: 999px;
  background: var(--color-accent-bg);
  color: var(--color-text);
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.cal-reminder-close {
  border: none;
  background: transparent;
  color: var(--color-text-muted, #5A9A82);
  cursor: pointer;
  width: 28px;
  height: 28px;
  border-radius: 999px;
}

.cal-reminder-close:hover {
  background: var(--surface-overlay);
  color: var(--color-text, #C4F0E0);
}

.cal-reminder-notes {
  margin-top: 0.45rem;
}

.cal-reminder-stack-enter-active,
.cal-reminder-stack-leave-active {
  transition: all 0.18s ease;
}

.cal-reminder-stack-enter-from,
.cal-reminder-stack-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@media (max-width: 640px) {
  .cal-form-grid {
    grid-template-columns: 1fr;
  }

  .cal-reminder-stack {
    right: 0.75rem;
    left: 0.75rem;
  }

  .cal-reminder-popup {
    width: 100%;
  }

  .cal-event-top,
  .cal-agenda-header,
  .cal-form-actions {
    align-items: flex-start;
    flex-direction: column;
  }

  .cal-event-actions {
    width: 100%;
  }
}
</style>
