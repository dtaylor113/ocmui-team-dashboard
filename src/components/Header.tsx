import React, { useState } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import NavigationTabs from './NavigationTabs';
import TimeboardModal from './TimeboardModal';
import type { TabType, PrimaryTabType } from '../App';
import ocmuiLogo from '../assets/icon48.png';

interface HeaderProps {
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

const Header: React.FC<HeaderProps> = ({ 
  primaryTabConfig, 
  secondaryTabConfig,
  currentPrimaryTab, 
  currentSecondaryTab,
  onPrimaryTabChange,
  onSecondaryTabChange
}) => {
  const { openSettingsModal, isConfigured } = useSettings();
  const [isTimeboardModalOpen, setIsTimeboardModalOpen] = useState(false);

  return (
    <>
      <div className="header">
        <div className="header-left">
          <div className="logo">
            <img src={ocmuiLogo} alt="OCMUI Logo" className="logo-icon" />
            <h1 className="logo-text">My OCMUI Dashboard</h1>
          </div>
        </div>
        
        <div className="header-center">
          <NavigationTabs
            primaryTabConfig={primaryTabConfig}
            secondaryTabConfig={secondaryTabConfig}
            currentPrimaryTab={currentPrimaryTab}
            currentSecondaryTab={currentSecondaryTab}
            onPrimaryTabChange={onPrimaryTabChange}
            onSecondaryTabChange={onSecondaryTabChange}
          />
        </div>
        
        <div className="header-right">
          <button 
            className="timeboard-btn"
            title="Team Timeboard"
            onClick={() => setIsTimeboardModalOpen(true)}
          >
            🌍
          </button>
          <button 
            className={`settings-btn ${!isConfigured ? 'settings-alert-active' : ''}`}
            title="Settings"
            onClick={openSettingsModal}
          >
            ⚙️
            {!isConfigured && <span className="settings-alert">!</span>}
          </button>
        </div>
      </div>
      
      {/* Timeboard Modal */}
      <TimeboardModal 
        isOpen={isTimeboardModalOpen}
        onClose={() => setIsTimeboardModalOpen(false)}
      />
    </>
  );
};

export default Header;
