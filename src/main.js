import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import persistedState from 'pinia-plugin-persistedstate';

import './styles/tokens.css'
import './styles/animations.css'
import './style.css'
import useI18nStore from './stores/useI18nStore.js'
import useTabStore from './stores/useTabStore.js'
import useThemeStore from './stores/useThemeStore.js'
import { getBrowserInfo } from './utils/browserInfo.js'

const app = createApp(App)
const pinia = createPinia();

pinia.use(persistedState)
app.use(pinia)

const i18n = useI18nStore(pinia)
i18n.ensureLocale()
document.documentElement.lang = i18n.locale

const browserInfo = getBrowserInfo()
document.documentElement.setAttribute('data-browser', browserInfo.id)

const tabStore = useTabStore(pinia)
const themeStore = useThemeStore(pinia)
const initialTheme = tabStore.resolveTheme()
document.documentElement.setAttribute('data-theme', initialTheme)
themeStore.applyTheme(initialTheme)

app.mount('#app')
