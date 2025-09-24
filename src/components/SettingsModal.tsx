import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../contexts/SettingsContext';
import type { ApiTokens } from '../types/settings';

const SettingsModal: React.FC = () => {
  const { 
    apiTokens, 
    isSettingsModalOpen, 
    closeSettingsModal, 
    saveSettings, 
    testGithubToken, 
    testJiraToken 
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
          {/* GitHub Token */}
          <div className="form-group">
            <label htmlFor="github-token">GitHub Token:</label>
            <div className="input-row">
              <input
                id="github-token"
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={formData.github}
                onChange={(e) => handleInputChange('github', e.target.value)}
              />
              <button 
                className={`test-btn ${testStates.github.result ? (testStates.github.result.success ? 'test-success' : 'test-failure') : ''}`}
                onClick={handleTestGithub}
                disabled={testStates.github.testing}
              >
                {testStates.github.testing 
                  ? 'Testing...' 
                  : testStates.github.result 
                    ? testStates.github.result.message 
                    : 'Test'}
              </button>
            </div>
            <div className="help-text">
              <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">
                Create GitHub Token →
              </a>
              <small>Required scopes: public_repo, repo:status, read:user</small>
            </div>
          </div>

          {/* GitHub Username */}
          <div className="form-group">
            <label htmlFor="github-username">GitHub Username:</label>
            <input
              id="github-username"
              type="text"
              placeholder="your-github-username"
              value={formData.githubUsername}
              onChange={(e) => handleInputChange('githubUsername', e.target.value)}
            />
            <div className="help-text">
              <small>Used for "Awaiting My Code Review" and "My PRs" tabs</small>
            </div>
          </div>

          {/* JIRA Token */}
          <div className="form-group">
            <label htmlFor="jira-token">JIRA Token:</label>
            <div className="input-row">
              <input
                id="jira-token"
                type="password"
                placeholder="Your JIRA API token"
                value={formData.jira}
                onChange={(e) => handleInputChange('jira', e.target.value)}
              />
              <button 
                className={`test-btn ${testStates.jira.result ? (testStates.jira.result.success ? 'test-success' : 'test-failure') : ''}`}
                onClick={handleTestJira}
                disabled={testStates.jira.testing}
              >
                {testStates.jira.testing 
                  ? 'Testing...' 
                  : testStates.jira.result 
                    ? testStates.jira.result.message 
                    : 'Test'}
              </button>
            </div>
            <div className="help-text">
              <a href="https://issues.redhat.com/secure/ViewProfile.jspa" target="_blank" rel="noopener noreferrer">
                Create JIRA Token →
              </a>
            </div>
          </div>

          {/* JIRA Username */}
          <div className="form-group">
            <label htmlFor="jira-username">JIRA Username:</label>
            <input
              id="jira-username"
              type="email"
              placeholder="your-email@redhat.com"
              value={formData.jiraUsername}
              onChange={(e) => handleInputChange('jiraUsername', e.target.value)}
            />
            <div className="help-text">
              <small>Your JIRA login email - used for "My Sprint JIRAs" to find tickets assigned to you</small>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={closeSettingsModal}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SettingsModal;
