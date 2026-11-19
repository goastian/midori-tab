const dialogs = [];
const focusableSelector = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

export function manageDialogFocus(element, { close, restoreTo } = {}) {
  if (!element) return () => {};
  const previous = document.activeElement;
  const app = document.getElementById('app');
  const entry = { element };
  dialogs.push(entry);
  if (app) app.inert = true;
  element.focus({ preventScroll: true });

  const keydown = event => {
    if (dialogs.at(-1) !== entry || event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close?.();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...element.querySelectorAll(focusableSelector)]
      .filter(node => node.tabIndex >= 0 && node.getClientRects().length && !node.closest('[inert]'));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first) { event.preventDefault(); element.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) {
      event.preventDefault(); first.focus();
    }
  };
  element.addEventListener('keydown', keydown);

  return () => {
    element.removeEventListener('keydown', keydown);
    const index = dialogs.indexOf(entry);
    if (index !== -1) dialogs.splice(index, 1);
    if (!dialogs.length && app) app.inert = false;
    queueMicrotask(() => {
      if (dialogs.length) return;
      const target = previous?.isConnected && !previous.closest('[inert]') ? previous : document.querySelector(restoreTo || '.top-btn:not(.hamburger-btn)');
      target?.focus({ preventScroll: true });
    });
  };
}
