import { stableId } from './itemIds.js';

/** Upgrades for data saved before ids and revisions existed. Content, order and dates are kept. */

const hasId = entry => typeof entry.id === 'string' && entry.id !== '';
const objects = raw => (Array.isArray(raw) ? raw : []).filter(entry => entry && typeof entry === 'object');

export function normalizeTodos(raw) {
  const seen = new Map();
  return objects(raw).map(entry => {
    const text = String(entry.text ?? '');
    return { ...entry, id: hasId(entry) ? entry.id : stableId('t', text, seen), text, done: Boolean(entry.done), rev: Number(entry.rev) || 1 };
  });
}

export const NOTE_ID = 'note-main';

export function emptyNote() {
  return { id: NOTE_ID, text: '', rev: 1, conflicts: [] };
}

/** The note used to be a bare string. */
export function normalizeNote(raw) {
  if (typeof raw === 'string') return { ...emptyNote(), text: raw };
  if (!raw || typeof raw !== 'object') return emptyNote();
  return {
    ...raw,
    id: hasId(raw) ? raw.id : NOTE_ID,
    text: String(raw.text ?? ''),
    rev: Number(raw.rev) || 1,
    conflicts: (Array.isArray(raw.conflicts) ? raw.conflicts : []).filter(copy => copy && typeof copy.text === 'string'),
  };
}

export function normalizeEvents(raw) {
  const seen = new Map();
  return objects(raw).filter(event => event.date).map(event => ({
    ...event,
    id: hasId(event) ? event.id : stableId('e', `${event.title}|${event.date}|${event.time}`, seen),
    title: event.title || '',
    time: event.time || '09:00',
    location: event.location || '',
    notes: event.notes || '',
    reminderMinutes: Number.isFinite(event.reminderMinutes) ? event.reminderMinutes : 15,
    notifiedAt: event.notifiedAt || null,
    rev: Number(event.rev) || 1,
  }));
}
