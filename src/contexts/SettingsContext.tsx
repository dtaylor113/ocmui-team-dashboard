import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { ApiTokens, UserPreferences } from '../types/settings';

interface SettingsContextType {
  apiTokens: ApiTokens;
  userPreferences: UserPreferences;
  isSettingsModalOpen: boolean;
  isConfigured: boolean;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;
  saveSettings: (tokens: ApiTokens) => void;
  updateUserPreferences: (preferences: Partial<UserPreferences>) => void;
  testGithubToken: (token: string) => Promise<{ success: boolean; message: string; username?: string }>;
  testJiraToken: (token: string) => Promise<{ success: boolean; message: string; userEmail?: string }>;
  resetIdentity: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [apiTokens, setApiTokens] = useState<ApiTokens>({
    github: '',
    githubUsername: '',
    jira: '',
    jiraUsername: ''
  });
  
  const [userPreferences, setUserPreferences] = useState<UserPreferences>({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone // Default to system timezone
  });
  
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Check if all required settings are configured
  // Note: Both GitHub and JIRA tokens are now server-side
  // Users only need to provide their usernames
  const isConfigured = !!(apiTokens.githubUsername && apiTokens.jiraUsername);

  // Load settings from localStorage on mount
  useEffect(() => {
    loadSettingsFromStorage();
    loadUserPreferencesFromStorage();
  }, []);

  const loadSettingsFromStorage = () => {
    try {
      const stored = localStorage.getItem('ocmui_api_tokens');
      if (stored) {
        const parsedTokens = JSON.parse(stored);
        setApiTokens(prev => ({ ...prev, ...parsedTokens }));
        console.log('📱 API tokens loaded from localStorage');
      }
    } catch (error) {
      console.error('❌ Error loading API tokens:', error);
    }
  };
  
  const loadUserPreferencesFromStorage = () => {
    try {
      const stored = localStorage.getItem('ocmui_user_preferences');
      if (stored) {
        const parsedPrefs = JSON.parse(stored);
        setUserPreferences(prev => ({ ...prev, ...parsedPrefs }));
        console.log('📱 User preferences loaded from localStorage');
      }
    } catch (error) {
      console.error('❌ Error loading user preferences:', error);
    }
  };

  const saveSettingsToStorage = (tokens: ApiTokens) => {
    try {
      localStorage.setItem('ocmui_api_tokens', JSON.stringify(tokens));
      console.log('💾 API tokens saved to localStorage');
    } catch (error) {
      console.error('❌ Error saving API tokens:', error);
    }
  };
  
  const saveUserPreferencesToStorage = (preferences: UserPreferences) => {
    try {
      localStorage.setItem('ocmui_user_preferences', JSON.stringify(preferences));
      console.log('💾 User preferences saved to localStorage');
    } catch (error) {
      console.error('❌ Error saving user preferences:', error);
    }
  };

  const openSettingsModal = () => {
    setIsSettingsModalOpen(true);
  };

  const closeSettingsModal = () => {
    setIsSettingsModalOpen(false);
  };

  const saveSettings = (newTokens: ApiTokens) => {
    setApiTokens(newTokens);
    saveSettingsToStorage(newTokens);
    closeSettingsModal();
    console.log('✅ API tokens saved successfully');
  };
  
  const updateUserPreferences = (newPreferences: Partial<UserPreferences>) => {
    const updatedPrefs = { ...userPreferences, ...newPreferences };
    setUserPreferences(updatedPrefs);
    saveUserPreferencesToStorage(updatedPrefs);
    console.log('✅ User preferences updated successfully');
  };

  // Test if server-side GitHub token is configured
  // Note: Users no longer need their own GitHub token - the server provides it
  const testGithubToken = async (_token?: string): Promise<{ success: boolean; message: string; username?: string }> => {
    try {
      const response = await fetch('/api/github/status');

      if (response.ok) {
        const data = await response.json();
        if (data.configured) {
          return { 
            success: true, 
            message: `GitHub connected via service account (${data.user})`,
            username: data.user 
          };
        } else {
          return { success: false, message: data.error || 'GitHub not configured on server' };
        }
      } else {
        return { success: false, message: 'Could not verify GitHub configuration' };
      }
    } catch (error) {
      console.error('GitHub status check error:', error);
      return { success: false, message: 'Network error - server may not be running' };
    }
  };

  // Test if server-side JIRA token is configured
  // Note: Users no longer need their own JIRA token - the server provides it
  const testJiraToken = async (_token?: string): Promise<{ success: boolean; message: string; userEmail?: string }> => {
    try {
      const response = await fetch('/api/jira/status');

      if (response.ok) {
        const data = await response.json();
        if (data.configured) {
          return { 
            success: true, 
            message: `JIRA connected via service account (${data.user})`,
            userEmail: data.email
          };
        } else {
          return { success: false, message: data.error || 'JIRA not configured on server' };
        }
      } else {
        return { success: false, message: 'Could not verify JIRA configuration' };
      }
    } catch (error) {
      console.error('JIRA status check error:', error);
      return { success: false, message: 'Network error - server may not be running' };
    }
  };

  // Reset all identity data and reload to trigger first-run flow
  const resetIdentity = () => {
    // Clear all dashboard-related localStorage items
    localStorage.removeItem('ocmui_api_tokens');
    localStorage.removeItem('ocmui_user_preferences');
    localStorage.removeItem('ocmui_selected_team_member');
    localStorage.removeItem('ocmui_identity_set');
    
    console.log('🔄 Identity reset - reloading page...');
    
    // Reload the page to trigger the first-run "Who are you?" flow
    window.location.reload();
  };

  const value: SettingsContextType = {
    apiTokens,
    userPreferences,
    isSettingsModalOpen,
    isConfigured,
    openSettingsModal,
    closeSettingsModal,
    saveSettings,
    updateUserPreferences,
    testGithubToken,
    testJiraToken,
    resetIdentity
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};
