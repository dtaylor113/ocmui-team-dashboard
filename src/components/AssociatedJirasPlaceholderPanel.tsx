import React from 'react';
import jiraLogo from '../assets/jiraLogo.png';

const AssociatedJirasPlaceholderPanel: React.FC = () => {
  return (
    <div className="panel-content">
      <div className="panel-header">
        <h3><img src={jiraLogo} alt="JIRA" className="panel-icon" /> Associated JIRAs</h3>
      </div>
      <div className="content-placeholder">
        <p>Click on a PR to see related JIRA tickets</p>
      </div>
    </div>
  );
};

export default AssociatedJirasPlaceholderPanel;
