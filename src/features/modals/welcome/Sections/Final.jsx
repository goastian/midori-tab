import variables from 'config/variables';
import languages from '@/i18n/languages.json';
import { Header } from '../components/Layout';

function Final(props) {
  return (
    <>
      <Header
        title={variables.getMessage('modals.welcome.sections.final.title')}
        subtitle={variables.getMessage('modals.welcome.sections.final.description')}
      />
      <span className="title">{variables.getMessage('modals.welcome.sections.final.changes')}</span>
      <span className="subtitle">
        {variables.getMessage('modals.welcome.sections.final.changes_description')}
      </span>
      <div className="themesToggleArea themesToggleAreaWelcome">
        <div className="toggle" onClick={() => props.switchTab(1)}>
          <span>
            {variables.getMessage('modals.main.settings.sections.language.title')}:{' '}
            {languages.find((i) => i.value === localStorage.getItem('language')).name}
          </span>
        </div>
        <div className="toggle" onClick={() => props.switchTab(3)}>
          <span>
            {variables.getMessage('modals.main.settings.sections.appearance.theme.title')}:{' '}
            {variables.getMessage(
              'modals.main.settings.sections.appearance.theme.' + localStorage.getItem('theme'),
            )}
          </span>
        </div>
        {/*}
        {this.state.importedSettings.length !== 0 && (
          <div className="toggle" onClick={() => this.props.switchTab(2)}>
            {variables.getMessage('modals.main.settings.sections.final.imported', {
              amount: this.state.importedSettings.length,
            })}{' '}
            {this.state.importedSettings.length}
          </div>
        )}*/}
      </div>
    </>
  );
}

export { Final as default, Final };
