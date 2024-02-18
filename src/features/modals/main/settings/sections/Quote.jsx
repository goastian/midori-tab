import variables from 'config/variables';
import React, { PureComponent } from 'react';
import { MdCancel, MdAdd, MdSource, MdOutlineFormatQuote } from 'react-icons/md';
import TextareaAutosize from '@mui/material/TextareaAutosize';

import { Header } from 'components/Layout/Settings';
import Checkbox from '../../../../../components/Form/Settings/Checkbox/Checkbox';
import Dropdown from '../../../../../components/Form/Settings/Dropdown/Dropdown';

import { Row, Content, Action } from '../../../../../components/Layout/Settings/Item/SettingsItem';
import Section from '../../../../../components/Layout/Settings/Section/Section';
import PreferencesWrapper from '../../../../../components/Layout/Settings/PreferencesWrapper/PreferencesWrapper';

import { toast } from 'react-toastify';
import EventBus from 'modules/helpers/eventbus';

export default class QuoteSettings extends PureComponent {
  constructor() {
    super();
    this.state = {
      quoteType: localStorage.getItem('quoteType') || 'api',
      customQuote: this.getCustom(),
      sourceSection: false,
    };
  }

  resetCustom = () => {
    localStorage.setItem('customQuote', '[{"quote": "", "author": ""}]');
    this.setState({
      customQuote: [
        {
          quote: '',
          author: '',
        },
      ],
    });
    toast(variables.getMessage('toasts.reset'));
    EventBus.emit('refresh', 'background');
  };

  customQuote(e, text, index, type) {
    const result = text === true ? e.target.value : e.target.result;

    const customQuote = this.state.customQuote;
    customQuote[index][type] = result;
    this.setState({
      customQuote,
    });
    this.forceUpdate();

    localStorage.setItem('customQuote', JSON.stringify(customQuote));
    document.querySelector('.reminder-info').style.display = 'flex';
    localStorage.setItem('showReminder', true);
  }

  modifyCustomQuote(type, index) {
    const customQuote = this.state.customQuote;
    if (type === 'add') {
      customQuote.push({
        quote: '',
        author: '',
      });
    } else {
      customQuote.splice(index, 1);
    }

    this.setState({
      customQuote,
    });
    this.forceUpdate();

    localStorage.setItem('customQuote', JSON.stringify(customQuote));
  }

  getCustom() {
    let data = JSON.parse(localStorage.getItem('customQuote'));
    if (data === null) {
      data = [];
    }
    return data;
  }

  render() {
    const QUOTE_SECTION = 'modals.main.settings.sections.quote';

    const ButtonOptions = () => {
      return (
        <Row>
          <Content
            title={variables.getMessage(`${QUOTE_SECTION}.buttons.title`)}
            subtitle={variables.getMessage('modals.main.settings.sections.quote.buttons.subtitle')}
          />
          <Action>
            <Checkbox
              name="copyButton"
              text={variables.getMessage(`${QUOTE_SECTION}.buttons.copy`)}
              category="quote"
            />
            <Checkbox
              name="quoteShareButton"
              text={variables.getMessage('widgets.quote.share')}
              category="quote"
            />
            <Checkbox
              name="favouriteQuoteEnabled"
              text={variables.getMessage(`${QUOTE_SECTION}.buttons.favourite`)}
              category="quote"
            />
          </Action>
        </Row>
      );
    };

    const SourceDropdown = () => {
      return (
        <Dropdown
          name="quoteType"
          label={variables.getMessage('modals.main.settings.sections.background.type.title')}
          onChange={(value) => this.setState({ quoteType: value })}
          category="quote"
          items={[
            localStorage.getItem('quote_packs') && {
              value: 'quote_pack',
              text: variables.getMessage('modals.main.navbar.marketplace'),
            },
            { value: 'quote_pack', text: variables.getMessage('modals.main.navbar.marketplace') },
            {
              value: 'api',
              text: variables.getMessage('modals.main.settings.sections.background.type.api'),
            },
            { value: 'custom', text: variables.getMessage(`${QUOTE_SECTION}.custom`) },
          ]}
        />
      );
    };

    const AdditionalOptions = () => {
      return (
        <Row final={true}>
          <Content
            title={variables.getMessage('modals.main.settings.additional_settings')}
            subtitle={variables.getMessage(`${QUOTE_SECTION}.additional`)}
          />
          <Action>
            <Checkbox
              name="authorLink"
              text={variables.getMessage(`${QUOTE_SECTION}.author_link`)}
              element=".other"
            />
            <Checkbox
              name="authorImg"
              text={variables.getMessage(`${QUOTE_SECTION}.author_img`)}
              element=".other"
            />
          </Action>
        </Row>
      );
    };

    let customSettings;
    if (this.state.quoteType === 'custom' && this.state.sourceSection === true) {
      customSettings = (
        <>
          <Row final={true}>
            <Content
              title={variables.getMessage(`${QUOTE_SECTION}.custom`)}
              subtitle={variables.getMessage(`${QUOTE_SECTION}.custom_subtitle`)}
            />
            <Action>
              <button onClick={() => this.modifyCustomQuote('add')}>
                {variables.getMessage(`${QUOTE_SECTION}.add`)} <MdAdd />
              </button>
            </Action>
          </Row>

          {this.state.customQuote.length !== 0 ? (
            <div className="messagesContainer">
              {this.state.customQuote.map((_url, index) => (
                <div className="messageMap">
                  <div className="icon">
                    <MdOutlineFormatQuote />
                  </div>
                  <div className="messageText">
                    <TextareaAutosize
                      value={this.state.customQuote[index].quote}
                      placeholder={variables.getMessage(
                        'modals.main.settings.sections.quote.title',
                      )}
                      onChange={(e) => this.customQuote(e, true, index, 'quote')}
                      varient="outlined"
                      style={{ fontSize: '22px', fontWeight: 'bold' }}
                    />
                    <TextareaAutosize
                      value={this.state.customQuote[index].author}
                      placeholder={variables.getMessage(
                        'modals.main.settings.sections.quote.author',
                      )}
                      className="subtitle"
                      onChange={(e) => this.customQuote(e, true, index, 'author')}
                      varient="outlined"
                    />
                  </div>
                  <div>
                    <div className="messageAction">
                      <button
                        className="deleteButton"
                        onClick={() => this.modifyCustomQuote('remove', index)}
                        style={{}}
                      >
                        {variables.getMessage('modals.main.marketplace.product.buttons.remove')}
                        <MdCancel />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="photosEmpty">
              <div className="emptyNewMessage">
                <MdOutlineFormatQuote />
                <span className="title">{variables.getMessage(`${QUOTE_SECTION}.no_quotes`)}</span>
                <span className="subtitle">
                  {variables.getMessage('modals.main.settings.sections.message.add_some')}
                </span>
                <button onClick={() => this.modifyCustomQuote('add')}>
                  {variables.getMessage(`${QUOTE_SECTION}.add`)} <MdAdd />
                </button>
              </div>
            </div>
          )}
        </>
      );
    } else {
      // api
      customSettings = <></>;
    }

    return (
      <>
        {this.state.sourceSection ? (
          <Header
            title={variables.getMessage(`${QUOTE_SECTION}.title`)}
            secondaryTitle={variables.getMessage(
              'modals.main.settings.sections.background.source.title',
            )}
            goBack={() => this.setState({ sourceSection: false })}
            report={false}
          />
        ) : (
          <Header
            title={variables.getMessage(`${QUOTE_SECTION}.title`)}
            setting="quote"
            category="quote"
            element=".quotediv"
            zoomSetting="zoomQuote"
            visibilityToggle={true}
          />
        )}
        {this.state.sourceSection && (
          <Row final={true}>
            <Content
              title={variables.getMessage('modals.main.settings.sections.background.source.title')}
              subtitle={variables.getMessage(`${QUOTE_SECTION}.source_subtitle`)}
            />
            <Action>
              <SourceDropdown />
            </Action>
          </Row>
        )}
        {!this.state.sourceSection && (
          <PreferencesWrapper setting="quote" zoomSetting="zoomQuote" visibilityToggle={true}>
            <Section
              icon={<MdSource />}
              title={variables.getMessage('modals.main.settings.sections.background.source.title')}
              subtitle={variables.getMessage(`${QUOTE_SECTION}.source_subtitle`)}
              onClick={() => this.setState({ sourceSection: true })}
            >
              <SourceDropdown />
            </Section>
            <ButtonOptions />
            <AdditionalOptions />
          </PreferencesWrapper>
        )}
        {customSettings}
      </>
    );
  }
}
