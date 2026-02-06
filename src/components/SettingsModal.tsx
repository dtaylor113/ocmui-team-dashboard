import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../contexts/SettingsContext';
import type { ApiTokens } from '../types/settings';
import slackIcon from '../assets/slack-dark-theme-icon.png';

const SettingsModal: React.FC = () => {
  const { 
    apiTokens, 
    isSettingsModalOpen, 
    closeSettingsModal, 
    saveSettings, 
    testGithubToken, 
    testJiraToken,
    resetIdentity
  } = useSettings();
  
  const [formData, setFormData] = useState<ApiTokens>(apiTokens);
  const [testStates, setTestStates] = useState({
    github: { testing: false, result: null as { success: boolean; message: string } | null },
    jira: { testing: false, result: null as { success: boolean; message: string } | null }
  });

  // Update form data when modal opens with current settings
  useEffect(() => {
    if (isSettingsModalOpen) {
      setFormData(apiTokens);
      // Clear any previous test results
      setTestStates({
        github: { testing: false, result: null },
        jira: { testing: false, result: null }
      });
    }
  }, [isSettingsModalOpen, apiTokens]);

  const handleInputChange = (field: keyof ApiTokens, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    saveSettings(formData);
  };

  const handleTestGithub = async () => {
    setTestStates(prev => ({ 
      ...prev, 
      github: { testing: true, result: null } 
    }));

    const result = await testGithubToken(formData.github);
    
    // Auto-fill GitHub username if test succeeded and we got a username
    if (result.success && result.username) {
      setFormData(prev => ({ ...prev, githubUsername: result.username! }));
    }
    
    setTestStates(prev => ({ 
      ...prev, 
      github: { testing: false, result } 
    }));

    // Clear result after 3 seconds
    setTimeout(() => {
      setTestStates(prev => ({ 
        ...prev, 
        github: { testing: false, result: null } 
      }));
    }, 3000);
  };

  const handleTestJira = async () => {
    setTestStates(prev => ({ 
      ...prev, 
      jira: { testing: true, result: null } 
    }));

    const result = await testJiraToken(formData.jira);
    
    // Auto-fill JIRA username (email) if test succeeded and we got an email
    if (result.success && result.userEmail) {
      setFormData(prev => ({ ...prev, jiraUsername: result.userEmail! }));
    }
    
    setTestStates(prev => ({ 
      ...prev, 
      jira: { testing: false, result } 
    }));

    // Clear result after 3 seconds
    setTimeout(() => {
      setTestStates(prev => ({ 
        ...prev, 
        jira: { testing: false, result: null } 
      }));
    }, 3000);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      closeSettingsModal();
    }
  };

  if (!isSettingsModalOpen) {
    return null;
  }

  return createPortal(
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content">
        <div className="modal-header">
          <h2>⚙️ Settings</h2>
          <button className="modal-close" onClick={closeSettingsModal}>
            &times;
          </button>
        </div>
        
        <div className="modal-body">
          {/* GitHub Service Account Status */}
          <div className="form-group">
            <label>GitHub Connection:</label>
            <div className="input-row">
              <div className="service-account-info">
                {testStates.github.result 
                  ? (testStates.github.result.success 
                      ? `✅ ${testStates.github.result.message}` 
                      : `❌ ${testStates.github.result.message}`)
                  : '🔗 GitHub access provided by server (no personal token needed)'}
              </div>
              <button 
                className={`test-btn ${testStates.github.result ? (testStates.github.result.success ? 'test-success' : 'test-failure') : ''}`}
                onClick={handleTestGithub}
                disabled={testStates.github.testing}
              >
                {testStates.github.testing 
                  ? 'Checking...' 
                  : 'Check Status'}
              </button>
            </div>
            <div className="help-text">
              <small>GitHub API access is handled by the server - you only need to provide your username below</small>
            </div>
          </div>

          {/* GitHub Username */}
          <div className="form-group">
            <label htmlFor="github-username">Your GitHub Username:</label>
            <input
              id="github-username"
              type="text"
              placeholder="your-github-username"
              value={formData.githubUsername}
              onChange={(e) => handleInputChange('githubUsername', e.target.value)}
            />
            <div className="help-text">
              <small>Your GitHub username - used to filter PRs and code reviews for you</small>
            </div>
          </div>

          {/* JIRA Service Account Status */}
          <div className="form-group">
            <label>JIRA Connection:</label>
            <div className="input-row">
              <div className="service-account-info">
                {testStates.jira.result 
                  ? (testStates.jira.result.success 
                      ? `✅ ${testStates.jira.result.message}` 
                      : `❌ ${testStates.jira.result.message}`)
                  : '🔗 JIRA access provided by server (no personal token needed)'}
              </div>
              <button 
                className={`test-btn ${testStates.jira.result ? (testStates.jira.result.success ? 'test-success' : 'test-failure') : ''}`}
                onClick={handleTestJira}
                disabled={testStates.jira.testing}
              >
                {testStates.jira.testing 
                  ? 'Checking...' 
                  : 'Check Status'}
              </button>
            </div>
            <div className="help-text">
              <small>JIRA API access is handled by the server - you only need to provide your email below</small>
            </div>
          </div>

          {/* JIRA Username (Email) */}
          <div className="form-group">
            <label htmlFor="jira-username">Your JIRA Email:</label>
            <input
              id="jira-username"
              type="email"
              placeholder="your-email@redhat.com"
              value={formData.jiraUsername}
              onChange={(e) => handleInputChange('jiraUsername', e.target.value)}
            />
            <div className="help-text">
              <small>Your Red Hat email - used to find JIRA tickets assigned to you</small>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <div className="modal-footer-left">
            <button 
              className="btn btn-danger" 
              onClick={() => {
                if (window.confirm('This will clear your identity and settings. You will need to set up again. Continue?')) {
                  resetIdentity();
                }
              }}
              title="Clear all settings and restart the 'Who are you?' setup"
            >
              🚪 Log Out
            </button>
            <a 
              className="btn btn-feedback" 
              href="https://redhat-internal.slack.com/app_redirect?channel=UA0LKKEMU" 
              target="_blank" 
              rel="noopener noreferrer"
              title="Open Slack web to DM dtaylor"
            >
              <img src={slackIcon} alt="Slack" className="btn-icon" />
              Feedback
            </a>
          </div>
          <div className="modal-footer-right">
            <button className="btn btn-secondary" onClick={closeSettingsModal}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SettingsModal;
