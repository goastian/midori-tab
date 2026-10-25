export class RemoteHttpError extends Error {
  constructor(label, status) {
    super(`${label} request failed: ${status}`);
    this.name = 'RemoteHttpError';
    this.status = status;
  }
}

/** Maps any failure of a remote widget request to a key of the `remoteStatus` copy. */
export function classifyRemoteError(error, online = globalThis.navigator?.onLine) {
  if (online === false) return 'offline';
  if (error?.isTimeout) return 'timeout';
  const status = Number(error?.status);
  if (status === 429) return 'rateLimited';
  if (Number.isFinite(status) && status > 0) return 'unavailable';
  if (error?.code === 'not-configured') return 'notConfigured';
  if (error instanceof TypeError) return 'network';
  return 'unavailable';
}

export function formatAge(timestamp, locale = 'en', now = Date.now()) {
  const time = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
  if (!Number.isFinite(time)) return '';
  const minutes = Math.max(0, Math.round((now - time) / 60_000));
  const [value, unit] = minutes < 60 ? [minutes, 'minute']
    : minutes < 48 * 60 ? [Math.round(minutes / 60), 'hour'] : [Math.round(minutes / 1440), 'day'];
  try {
    return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-value, unit);
  } catch {
    return '';
  }
}

/** "{reason} Showing saved data from {age}." when a snapshot exists, otherwise only the reason. */
export function describeRemoteState(copy, kind, { fetchedAt = null, locale = 'en', now = Date.now() } = {}) {
  const reason = copy[kind] || copy.unavailable;
  const age = fetchedAt ? formatAge(fetchedAt, locale, now) : '';
  return age ? `${reason} ${copy.savedFrom.replace('{age}', age)}` : reason;
}
