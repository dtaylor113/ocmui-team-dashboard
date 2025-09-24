import { useState } from 'react';
import { QueryProvider } from './contexts/QueryProvider';
import { SettingsProvider } from './contexts/SettingsContext';
import Header from './components/Header';
import SplitPanel from './components/SplitPanel';
import SettingsModal from './components/SettingsModal';
import jiraLogo from './assets/jiraLogo.png';
import githubIcon from './assets/githubIcon.png';
import './styles/App.css';

// Define our simplified single-row navigation structure
export type TabType = 'my-sprint-jiras' | 'my-code-reviews' | 'my-prs' | 'jira-lookup';

interface AppState {
  currentTab: TabType;
}

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
  const [appState, setAppState] = useState<AppState>({
    currentTab: 'my-sprint-jiras'
  });

  const handleTabChange = (tab: TabType) => {
    setAppState({
      currentTab: tab
    });
  };

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
        </div>
      </SettingsProvider>
    </QueryProvider>
  );
}
