export function handoffEarlySearch(component, ready) {
  const adopt = (snapshot = {}) => {
    const input = component.$refs.input;
    if (!input) return;
    component.query = snapshot.value || '';
    component.originalQuery = component.query;
    input.value = component.query;
    if (snapshot.focused) {
      input.focus({ preventScroll: true });
      input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd, snapshot.selectionDirection);
    } else if (snapshot.buttonFocused) {
      component.$refs.root.querySelector('.search-btn')?.focus({ preventScroll: true });
    }
    ready();
  };
  const early = window.__midoriEarlySearch;
  if (early?.handoff) early.handoff(adopt);
  else ready();
}
