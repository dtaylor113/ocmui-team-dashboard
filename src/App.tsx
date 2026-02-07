import { useState, useEffect } from 'react';
import { QueryProvider } from './contexts/QueryProvider';
import { SettingsProvider } from './contexts/SettingsContext';
import Header from './components/Header';
import SplitPanel from './components/SplitPanel';
import SettingsModal from './components/SettingsModal';
import FirstRunIdentityModal from './components/FirstRunIdentityModal';
import jiraLogo from './assets/jiraLogo.png';
import githubIcon from './assets/githubIcon.png';
import unleashIcon from './assets/unleash.png';
import './styles/App.css';

// Tab types for the application
export type TabType = 'my-sprint-jiras' | 'my-code-reviews' | 'my-prs' | 'reviewers' | 'feature-flags' | 'doc-links' | 'epics';
export type PrimaryTabType = 'jira' | 'github' | 'other';

interface AppState {
  currentTab: TabType;
  primaryTab: PrimaryTabType;
}

const TAB_STORAGE_KEY = 'ocmui_current_tab';

// Generic "more" icon for Other tab (inline SVG as data URI)
const moreIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%239ca3af'%3E%3Ccircle cx='5' cy='12' r='2'/%3E%3Ccircle cx='12' cy='12' r='2'/%3E%3Ccircle cx='19' cy='12' r='2'/%3E%3C/svg%3E";

// Link/chain icon for Doc Links tab (scaled down with padding to match other icons)
const linkIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' fill='none' stroke='%239ca3af' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cg transform='translate(4,4) scale(1)'%3E%3Cpath d='M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'/%3E%3Cpath d='M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'/%3E%3C/g%3E%3C/svg%3E";

// Primary tab configuration
const primaryTabConfig = [
  { id: 'jira' as PrimaryTabType, label: 'JIRA', icon: jiraLogo },
  { id: 'github' as PrimaryTabType, label: 'GitHub', icon: githubIcon },
  { id: 'other' as PrimaryTabType, label: 'Other', icon: moreIcon }
];

// Secondary tabs grouped by primary
const secondaryTabConfig: Record<PrimaryTabType, Array<{ id: TabType; label: string; icon?: string }>> = {
  jira: [
    { id: 'my-sprint-jiras', label: 'My Sprint JIRAs' },
    { id: 'epics', label: 'Epics' }
  ],
  github: [
    { id: 'my-code-reviews', label: 'My Code Reviews' },
    { id: 'my-prs', label: 'My PRs' },
    { id: 'reviewers', label: 'Reviewers' }
  ],
  other: [
    { id: 'feature-flags', label: 'Feature Flags', icon: unleashIcon },
    { id: 'doc-links', label: 'Doc Links', icon: linkIcon }
  ]
};

// Helper to get primary tab from secondary tab
const getPrimaryFromSecondary = (tab: TabType): PrimaryTabType => {
  for (const [primary, tabs] of Object.entries(secondaryTabConfig)) {
    if (tabs.some(t => t.id === tab)) {
      return primary as PrimaryTabType;
    }
  }
  return 'jira'; // fallback
};

// All valid secondary tabs
const allSecondaryTabs = Object.values(secondaryTabConfig).flat();
const isValidTab = (value: string): value is TabType => {
  return allSecondaryTabs.some(t => t.id === value);
};

export default function App() {
  const [appState, setAppState] = useState<AppState>(() => {
    try {
      const stored = localStorage.getItem(TAB_STORAGE_KEY);
      if (stored && isValidTab(stored)) {
        const tab = stored as TabType;
        return { 
          currentTab: tab,
          primaryTab: getPrimaryFromSecondary(tab)
        };
      }
    } catch {
      // ignore storage errors and fall back to default
    }
    return { currentTab: 'my-sprint-jiras', primaryTab: 'jira' };
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

  // Handle primary tab change - switch to first secondary tab of that primary
  const handlePrimaryTabChange = (primary: PrimaryTabType) => {
    const firstSecondary = secondaryTabConfig[primary][0].id;
    setAppState({
      primaryTab: primary,
      currentTab: firstSecondary
    });
    try {
      localStorage.setItem(TAB_STORAGE_KEY, firstSecondary);
    } catch {
      // ignore storage errors
    }
  };

  // Handle secondary tab change
  const handleSecondaryTabChange = (tab: TabType) => {
    setAppState(prev => ({
      ...prev,
      currentTab: tab
    }));
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
            primaryTabConfig={primaryTabConfig}
            secondaryTabConfig={secondaryTabConfig}
            currentPrimaryTab={appState.primaryTab}
            currentSecondaryTab={appState.currentTab}
            onPrimaryTabChange={handlePrimaryTabChange}
            onSecondaryTabChange={handleSecondaryTabChange}
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
