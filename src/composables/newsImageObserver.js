const callbacks = new Map();
let observer = null;

export function observeNewsImage(element, callback) {
  if (typeof IntersectionObserver === 'undefined') {
    callback();
    return () => {};
  }
  if (!observer) {
    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const load = callbacks.get(entry.target);
        callbacks.delete(entry.target);
        observer.unobserve(entry.target);
        load?.();
      }
    }, { rootMargin: '240px 0px' });
  }
  callbacks.set(element, callback);
  observer.observe(element);
  return () => {
    callbacks.delete(element);
    observer?.unobserve(element);
    if (!callbacks.size) { observer?.disconnect(); observer = null; }
  };
}
