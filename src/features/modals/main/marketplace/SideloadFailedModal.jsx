import { memo } from 'react';
import variables from 'modules/variables';
import { MdClose } from 'react-icons/md';
import Tooltip from 'features/helpers/tooltip/Tooltip';

function SideloadFailedModal({ modalClose, reason }) {
  return (
    <div className="smallModal">
      <div className="shareHeader">
        <span className="title">{variables.getMessage('modals.main.error_boundary.title')}</span>
        <Tooltip
          title={variables.getMessage('modals.main.settings.sections.advanced.reset_modal.cancel')}
        >
          <div className="close" onClick={modalClose}>
            <MdClose />
          </div>
        </Tooltip>
      </div>
      <span>{variables.getMessage('modals.main.addons.sideload.failed')}</span>
      <span className="subtitle">{reason}</span>
    </div>
  );
}

export default memo(SideloadFailedModal);
