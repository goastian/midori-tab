import useTabStore from '../stores/useTabStore.js';
import useThemeStore from '../stores/useThemeStore.js';

let mediaQuery = null;
let mediaQueryListener = null;

export function useAutoTheme() {
  const tabStore = useTabStore();

  function getThemeForCurrentSystem() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return tabStore.theme || 'light';
  }

  function applyAutoTheme() {
    const desired = getThemeForCurrentSystem();
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
    if (typeof window === 'undefined' || !window.matchMedia) return;

    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQueryListener = () => applyAutoTheme();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', mediaQueryListener);
    } else if (mediaQuery.addListener) {
      mediaQuery.addListener(mediaQueryListener);
    }
  }

  function stop() {
    if (mediaQuery && mediaQueryListener) {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', mediaQueryListener);
      } else if (mediaQuery.removeListener) {
        mediaQuery.removeListener(mediaQueryListener);
      }
    }
    mediaQuery = null;
    mediaQueryListener = null;
  }

  return { start, stop, applyAutoTheme, getThemeForCurrentSystem };
}
