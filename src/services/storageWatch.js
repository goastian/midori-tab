import { WRITER_ID } from './StorageService.js';

const subscribers = new Map();
const delivered = new Map();
let bound = false;
let onChanged = null;

function api() {
  return typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
}

/** The newest payload of `key` written by any New Tab, read synchronously from the local mirror. */
export function mirrorPayload(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

export function mirrorTimestamp(key) {
  return Number(mirrorPayload(key)?.updatedAt) || 0;
}

function deliver(key, payload) {
  const handlers = subscribers.get(key);
  if (!handlers || !payload || typeof payload !== 'object' || !('value' in payload)) return;
  if (payload.origin === WRITER_ID) return;
  const id = `${payload.origin}:${payload.updatedAt}`;
  // Older than the mirror means a newer write already happened here or in another tab.
  if (delivered.get(key) === id || Number(payload.updatedAt) < mirrorTimestamp(key)) return;
  delivered.set(key, id);
  for (const handler of [...handlers]) handler(payload.value, payload);
}

function handleStorageEvent(event) {
  if (event.storageArea !== localStorage || !subscribers.has(event.key) || !event.newValue) return;
  try { deliver(event.key, JSON.parse(event.newValue)); } catch { /* Not a payload written by this extension. */ }
}

function bind() {
  if (bound) return;
  bound = true;
  window.addEventListener('storage', handleStorageEvent);
  const events = api()?.storage?.onChanged;
  if (!events?.addListener) return;
  onChanged = (changes, area) => {
    if (area !== 'local') return;
    for (const key of Object.keys(changes)) if (subscribers.has(key)) deliver(key, changes[key].newValue);
  };
  events.addListener(onChanged);
}

function unbind() {
  if (!bound || subscribers.size) return;
  bound = false;
  window.removeEventListener('storage', handleStorageEvent);
  if (onChanged) api()?.storage?.onChanged?.removeListener(onChanged);
  onChanged = null;
}

/**
 * Calls handler(value, payload) when another document writes `key`. One shared pair of listeners
 * serves every subscriber; both disappear when the last one unsubscribes.
 */
export function watchJson(key, handler) {
  if (!subscribers.has(key)) subscribers.set(key, new Set());
  subscribers.get(key).add(handler);
  bind();
  return () => {
    const handlers = subscribers.get(key);
    handlers?.delete(handler);
    if (handlers && !handlers.size) { subscribers.delete(key); delivered.delete(key); }
    unbind();
  };
}
