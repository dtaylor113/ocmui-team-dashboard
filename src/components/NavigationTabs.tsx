import React from 'react';
import type { TabType, PrimaryTabType } from '../App';

interface NavigationTabsProps {
  primaryTabConfig: Array<{
    id: PrimaryTabType;
    label: string;
    icon: string;
  }>;
  secondaryTabConfig: Record<PrimaryTabType, Array<{ id: TabType; label: string; icon?: string }>>;
  currentPrimaryTab: PrimaryTabType;
  currentSecondaryTab: TabType;
  onPrimaryTabChange: (tab: PrimaryTabType) => void;
  onSecondaryTabChange: (tab: TabType) => void;
}

const NavigationTabs: React.FC<NavigationTabsProps> = ({
  primaryTabConfig,
  secondaryTabConfig,
  currentPrimaryTab,
  currentSecondaryTab,
  onPrimaryTabChange,
  onSecondaryTabChange
}) => {
  return (
    <nav className="navigation navigation-inline">
      {primaryTabConfig.map((primary) => {
        const secondaryTabs = secondaryTabConfig[primary.id];
        const isActive = currentPrimaryTab === primary.id;
        
        return (
          <React.Fragment key={primary.id}>
            
            <div className="nav-group">
              {/* Primary tab button - always visible */}
              <button
                className={`nav-primary-tab ${isActive ? 'active' : ''}`}
                onClick={() => onPrimaryTabChange(primary.id)}
              >
                <img src={primary.icon} alt={primary.label} className="nav-group-icon" />
                {primary.label}
              </button>
              
              {/* Subtabs - only show for active primary tab */}
              {isActive && secondaryTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`nav-tab ${currentSecondaryTab === tab.id ? 'active' : ''}`}
                  onClick={() => onSecondaryTabChange(tab.id)}
                >
                  {tab.icon && <img src={tab.icon} alt="" className="nav-tab-icon" />}
                  {tab.label}
                </button>
              ))}
            </div>
          </React.Fragment>
        );
      })}
    </nav>
  );
};

export default NavigationTabs;
