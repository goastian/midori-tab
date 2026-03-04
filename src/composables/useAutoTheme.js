import useTabStore from '../stores/useTabStore.js';
import useThemeStore from '../stores/useThemeStore.js';

let intervalId = null;

export function useAutoTheme() {
  const tabStore = useTabStore();

  function getThemeForCurrentTime() {
    const hour = new Date().getHours();
    // Light: 7am - 7pm, Dark: 7pm - 7am
    return (hour >= 7 && hour < 19) ? 'light' : 'dark';
  }

  function applyAutoTheme() {
    const desired = getThemeForCurrentTime();
    if (tabStore.theme !== desired) {
      tabStore.theme = desired;
      document.documentElement.setAttribute('data-theme', desired);
    }
    // Always re-apply theme store vars for the current mode
    const themeStore = useThemeStore();
    themeStore.applyTheme(desired);
  }

  function start() {
    applyAutoTheme();
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(applyAutoTheme, 60_000);
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  return { start, stop, applyAutoTheme, getThemeForCurrentTime };
}
