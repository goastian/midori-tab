<template>
  <div class="calendar-widget">
    <div class="cal-header">
      <button class="cal-nav" @click="prevMonth">‹</button>
      <span class="cal-month">{{ monthName }} {{ year }}</span>
      <button class="cal-nav" @click="nextMonth">›</button>
    </div>
    <div class="cal-grid">
      <span v-for="d in dayLabels" :key="d" class="cal-day-label">{{ d }}</span>
      <span
        v-for="(cell, i) in cells"
        :key="i"
        :class="['cal-cell', {
          today: cell.isToday,
          other: cell.otherMonth,
          empty: !cell.day
        }]"
      >{{ cell.day || '' }}</span>
    </div>
    <div class="cal-today-bar">
      <span class="cal-today-label">{{ todayFormatted }}</span>
    </div>
  </div>
</template>

<script>
/**
 * Lightweight calendar widget showing the current month grid
 * with today highlighted. No external dependencies.
 */
export default {
  name: 'CalendarWidget',

  data() {
    const now = new Date();
    return {
      viewMonth: now.getMonth(),
      viewYear: now.getFullYear(),
    };
  },

  computed: {
    year() { return this.viewYear; },
    monthName() {
      return new Date(this.viewYear, this.viewMonth).toLocaleString(undefined, { month: 'long' });
    },
    dayLabels() {
      return ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];
    },
    /** Generates the 6×7 grid cells for the viewed month. */
    cells() {
      const first = new Date(this.viewYear, this.viewMonth, 1);
      let startDay = first.getDay() - 1;
      if (startDay < 0) startDay = 6;
      const daysInMonth = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
      const daysInPrev = new Date(this.viewYear, this.viewMonth, 0).getDate();
      const now = new Date();
      const todayDate = now.getDate();
      const todayMonth = now.getMonth();
      const todayYear = now.getFullYear();
      const cells = [];

      // Previous month fill
      for (let i = startDay - 1; i >= 0; i--) {
        cells.push({ day: daysInPrev - i, otherMonth: true, isToday: false });
      }
      // Current month
      for (let d = 1; d <= daysInMonth; d++) {
        cells.push({
          day: d,
          otherMonth: false,
          isToday: d === todayDate && this.viewMonth === todayMonth && this.viewYear === todayYear,
        });
      }
      // Next month fill
      const remaining = 42 - cells.length;
      for (let d = 1; d <= remaining; d++) {
        cells.push({ day: d, otherMonth: true, isToday: false });
      }
      return cells;
    },
    todayFormatted() {
      return new Date().toLocaleDateString(undefined, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
    },
  },

  methods: {
    prevMonth() {
      if (this.viewMonth === 0) { this.viewMonth = 11; this.viewYear--; }
      else { this.viewMonth--; }
    },
    nextMonth() {
      if (this.viewMonth === 11) { this.viewMonth = 0; this.viewYear++; }
      else { this.viewMonth++; }
    },
  },
};
</script>

<style scoped>
.calendar-widget {
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  padding: 0.75rem;
  width: 100%;
}

.cal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.cal-month {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--color-text, #C4F0E0);
  text-transform: capitalize;
}

.cal-nav {
  background: none;
  border: none;
  color: var(--color-text-muted, #5A9A82);
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0.2rem 0.5rem;
  border-radius: var(--radius-sm, 6px);
  transition: background var(--transition-fast, 0.1s ease);
}

.cal-nav:hover {
  background: var(--color-accent-bg, rgba(4,164,105,0.08));
  color: var(--color-text, #C4F0E0);
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  text-align: center;
}

.cal-day-label {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--color-text-muted, #5A9A82);
  padding: 0.2rem 0;
}

.cal-cell {
  font-size: 0.75rem;
  padding: 0.3rem 0;
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text, #C4F0E0);
  cursor: default;
}

.cal-cell.other {
  color: var(--color-text-dim, #3A5B4D);
}

.cal-cell.today {
  background: var(--color-primary, #04A469);
  color: white;
  font-weight: 700;
}

.cal-today-bar {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border, rgba(126,196,168,0.1));
  text-align: center;
}

.cal-today-label {
  font-size: 0.75rem;
  color: var(--color-text-secondary, #7EC4A8);
  text-transform: capitalize;
}
</style>
