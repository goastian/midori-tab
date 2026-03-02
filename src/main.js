import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import persistedState from 'pinia-plugin-persistedstate';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';

import './styles/tokens.css'
import './styles/animations.css'
import './style.css'
import 'zen-wdg/zen-wdg.css'

const app = createApp(App)
const pinia = createPinia();

pinia.use(persistedState)
app.use(pinia)

app.mount('#app')