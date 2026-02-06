import { useState, useEffect } from 'react';
import { QueryProvider } from './contexts/QueryProvider';
import { SettingsProvider } from './contexts/SettingsContext';
import Header from './components/Header';
import SplitPanel from './components/SplitPanel';
import SettingsModal from './components/SettingsModal';
import FirstRunIdentityModal from './components/FirstRunIdentityModal';
import jiraLogo from './assets/jiraLogo.png';
import githubIcon from './assets/githubIcon.png';
import './styles/App.css';

// Define our simplified single-row navigation structure
export type TabType = 'my-sprint-jiras' | 'my-code-reviews' | 'my-prs' | 'jira-lookup';

interface AppState {
  currentTab: TabType;
}

const TAB_STORAGE_KEY = 'ocmui_current_tab';

const isValidTab = (value: string): value is TabType => {
  return tabConfig.some(t => t.id === value);
};

const tabConfig = [
  { 
    id: 'my-sprint-jiras' as TabType, 
    label: 'My Sprint JIRAs', 
    icon: jiraLogo 
  },
  { 
    id: 'my-code-reviews' as TabType, 
    label: 'My Code Reviews', 
    icon: githubIcon 
  },
  { 
    id: 'my-prs' as TabType, 
    label: 'My PRs', 
    icon: githubIcon 
  },
  { 
    id: 'jira-lookup' as TabType, 
    label: 'JIRA Lookup', 
    icon: jiraLogo 
  }
];

export default function App() {
  const [appState, setAppState] = useState<AppState>(() => {
    try {
      const stored = localStorage.getItem(TAB_STORAGE_KEY);
      if (stored && isValidTab(stored)) {
        return { currentTab: stored as TabType };
      }
    } catch {
      // ignore storage errors and fall back to default
    }
    return { currentTab: 'my-sprint-jiras' };
  });

  // First-run identity check
  const [showFirstRun, setShowFirstRun] = useState(false);
  const [identityChecked, setIdentityChecked] = useState(false);

  useEffect(() => {
    // Check if user has selected their identity
    const storedIdentity = localStorage.getItem('ocmui_selected_team_member');
    if (!storedIdentity) {
      setShowFirstRun(true);
    }
    setIdentityChecked(true);
  }, []);

  const handleFirstRunComplete = () => {
    setShowFirstRun(false);
  };

  const handleTabChange = (tab: TabType) => {
    setAppState({
      currentTab: tab
    });
    try {
      localStorage.setItem(TAB_STORAGE_KEY, tab);
    } catch {
      // ignore storage errors
    }
  };

  // Don't render app until we've checked identity status
  if (!identityChecked) {
    return null;
  }

  return (
    <QueryProvider>
      <SettingsProvider>
        <div className="app">
          <Header 
            tabConfig={tabConfig}
            currentTab={appState.currentTab}
            onTabChange={handleTabChange}
          />
          
          <SplitPanel
            currentTab={appState.currentTab}
          />
          
          <SettingsModal />
          
          <FirstRunIdentityModal 
            isOpen={showFirstRun} 
            onComplete={handleFirstRunComplete} 
          />
        </div>
      </SettingsProvider>
    </QueryProvider>
  );
}
