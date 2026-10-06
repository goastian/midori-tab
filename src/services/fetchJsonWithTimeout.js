export async function fetchJsonWithTimeout(url, {
  timeoutMs = 7000, signal, fetchFn = globalThis.fetch?.bind(globalThis),
  readBody = response => response.json(), ...options
} = {}) {
  if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  const controller = new AbortController();
  let timer;
  let rejectCancellation;
  const cancelled = new Promise((_, reject) => { rejectCancellation = reject; });
  const onAbort = () => {
    controller.abort();
    rejectCancellation(new DOMException('Request cancelled', 'AbortError'));
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      const error = new Error(`Request timed out after ${timeoutMs}ms`);
      error.isTimeout = true;
      reject(error);
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([
      (async () => {
        const response = await fetchFn(url, { ...options, signal: controller.signal });
        const payload = response.ok ? await readBody(response) : null;
        return { response, payload };
      })(),
      cancelled,
      timedOut,
    ]);
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export function fetchBlobWithTimeout(url, options = {}) {
  return fetchJsonWithTimeout(url, { ...options, readBody: response => response.blob() });
}
