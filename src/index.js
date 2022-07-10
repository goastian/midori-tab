import { render } from 'react-dom';

import App from './App';
import variables from 'modules/variables';

import './scss/index.scss';
// the toast css is based on default so we need to import it
import 'react-toastify/dist/ReactToastify.min.css';

// local stats
import Stats from 'modules/helpers/stats';

// language
import I18n from '@eartharoid/i18n';
const languagecode = localStorage.getItem('language') || 'en_GB';

// we set things to window. so we avoid passing the translation strings as props to each component
variables.languagecode = languagecode.replace('-', '_');

if (languagecode === 'en') {
  variables.languagecode = 'en_GB';
}

variables.language = new I18n(variables.languagecode, {
  de_DE: require('./translations/de_DE.json'),
  en_GB: require('./translations/en_GB.json'),
  en_US: require('./translations/en_US.json'),
  es: require('./translations/es.json'),
  fr: require('./translations/fr.json'),
  nl: require('./translations/nl.json'),
  no: require('./translations/no.json'),
  ru: require('./translations/ru.json'),
  zh_CN: require('./translations/zh_CN.json'),
  id_ID: require('./translations/id_ID.json'),
  tr_TR: require('./translations/tr_TR.json')
});

// set html language tag
if (variables.languagecode !== 'en_GB' || variables.languagecode !== 'en_US') {
  document.documentElement.lang = variables.languagecode.split('_')[0];
}

if (localStorage.getItem('stats') === 'true') {
  variables.stats = Stats;
}

/*if (localStorage.getItem('keybindsEnabled') === 'true') {
  variables.keybinds = JSON.parse(localStorage.getItem('keybinds') || '{}');
}*/

render(
  <App/>,
  document.getElementById('root')
);
