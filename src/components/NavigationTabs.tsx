import React from 'react';
import type { TabType } from '../App';

interface TabConfig {
  id: TabType;
  label: string;
  icon: string; // URL/path to image
}

interface NavigationTabsProps {
  tabConfig: TabConfig[];
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const NavigationTabs: React.FC<NavigationTabsProps> = ({
  tabConfig,
  currentTab,
  onTabChange
}) => {
  return (
    <nav className="navigation">
      {/* Single Row Navigation */}
      <div className="secondary-tabs">
        {tabConfig.map((tab) => (
          <button
            key={tab.id}
            className={`secondary-tab ${currentTab === tab.id ? 'active' : ''}`}
            onClick={() => onTabChange(tab.id)}
          >
            <img src={tab.icon} alt={tab.label} className="tab-icon" />
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default NavigationTabs;
