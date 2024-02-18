import variables from 'config/variables';
import { MdOutlineOpenInNew } from 'react-icons/md';
import languages from '@/i18n/languages.json';

import { Radio } from 'components/Form/Settings';
import { Header } from '../components/Layout';

function ChooseLanguage() {
  return (
    <>
      <Header
        title={variables.getMessage('modals.welcome.sections.language.title')}
        subtitle={variables.getMessage('modals.welcome.sections.language.description')}
      />
      <a
        href={variables.constants.TRANSLATIONS_URL}
        className="link"
        target="_blank"
        rel="noopener noreferrer"
      >
        GitHub
        <MdOutlineOpenInNew />
      </a>
      <a
        href={variables.constants.WEBLATE_URL}
        className="link"
        target="_blank"
        rel="noopener noreferrer"
      >
        Weblate
        <MdOutlineOpenInNew />
      </a>
      <div className="languageSettings">
        <Radio name="language" options={languages} category="welcomeLanguage" />
      </div>
    </>
  );
}

export { ChooseLanguage as default, ChooseLanguage };
