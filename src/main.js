import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import persistedState from 'pinia-plugin-persistedstate';
import '@fontsource/inter/400.css';

import './style.css'
import 'zen-wdg/zen-wdg.css'
import "gridstack/dist/gridstack.css";

const app = createApp(App)
const pinia = createPinia();

pinia.use(persistedState)
app.use(pinia)

app.mount('#app')