import variables from 'config/variables';
import { PureComponent } from 'react';
import { toast } from 'react-toastify';
import { TextField } from '@mui/material';
import { MdRefresh } from 'react-icons/md';

import EventBus from 'modules/helpers/eventbus';

class Text extends PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      value: localStorage.getItem(this.props.name) || '',
    };
  }

  handleChange = (e) => {
    let { value } = e.target;

    // Alex wanted font to work with montserrat and Montserrat, so I made it work
    if (this.props.upperCaseFirst === true) {
      value = value.charAt(0).toUpperCase() + value.slice(1);
    }

    localStorage.setItem(this.props.name, value);
    this.setState({
      value,
    });

    if (this.props.element) {
      if (!document.querySelector(this.props.element)) {
        document.querySelector('.reminder-info').style.display = 'flex';
        return localStorage.setItem('showReminder', true);
      }
    }

    EventBus.emit('refresh', this.props.category);
  };

  resetItem = () => {
    this.handleChange({
      target: {
        value: this.props.default || '',
      },
    });
    toast(variables.getMessage('toasts.reset'));
  };

  render() {
    return (
      <>
        {this.props.textarea === true ? (
          <TextField
            label={this.props.title}
            value={this.state.value}
            onChange={this.handleChange}
            varient="outlined"
            className={this.props.customcss ? 'customcss' : ''}
            multiline
            spellCheck={false}
            minRows={4}
            maxRows={10}
            InputLabelProps={{ shrink: true }}
          />
        ) : (
          <TextField
            label={this.props.title}
            value={this.state.value}
            onChange={this.handleChange}
            varient="outlined"
            InputLabelProps={{ shrink: true }}
            placeholder={this.props.placeholder || ''}
          />
        )}
        <span className="link" onClick={this.resetItem}>
          <MdRefresh />
          {variables.getMessage('modals.main.settings.buttons.reset')}
        </span>
      </>
    );
  }
}

export default Text;
