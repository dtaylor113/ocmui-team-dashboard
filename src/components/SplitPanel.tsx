import React, { useState, useCallback, useEffect } from 'react';
import type { TabType, QuickFindType } from '../App';
import JiraPanel from './JiraPanel';
import PRPanel from './PRPanel';
import AssociatedPRsPanel from './AssociatedPRsPanel';
import EmptyState from './EmptyState';
import AssociatedJirasPanel from './AssociatedJirasPanel';
import FeatureFlagsPanel from './FeatureFlagsPanel';
import DocLinksPanel from './DocLinksPanel';
import EpicsPanel from './EpicsPanel';
import ReviewerWorkloadPanel from './ReviewerWorkloadPanel';
import QuickFindJiraPanel from './QuickFindJiraPanel';
import QuickFindPRPanel from './QuickFindPRPanel';

interface QuickFindMode {
  type: QuickFindType;
  value: string;
}

interface SplitPanelProps {
  currentTab: TabType;
  quickFindMode?: QuickFindMode | null;
}

const SplitPanel: React.FC<SplitPanelProps> = ({ currentTab, quickFindMode }) => {
  const [leftWidth, setLeftWidth] = useState(50); // Percentage
  const [isDragging, setIsDragging] = useState(false);
  const [prStatus, setPrStatus] = useState<'open' | 'closed'>('open');
  const [selectedTicket, setSelectedTicket] = useState<string | undefined>();
  const [selectedPR, setSelectedPR] = useState<any | undefined>();
  const [invalidJiraIds, setInvalidJiraIds] = useState<string[]>([]);
  
  // Track quick find selections separately
  const [quickFindSelectedTicket, setQuickFindSelectedTicket] = useState<string | undefined>();
  const [quickFindSelectedPR, setQuickFindSelectedPR] = useState<any | undefined>();
  const [quickFindInvalidJiraIds, setQuickFindInvalidJiraIds] = useState<string[]>([]);

  const handleTicketSelect = (ticketKey: string) => {
    setSelectedTicket(ticketKey);
  };

  const handlePRSelect = (pr: any) => {
    console.log(`🔥 SplitPanel: PR selected #${pr.number}: ${pr.title}`);
    setSelectedPR(pr);
    setInvalidJiraIds([]); // Clear invalid JIRA IDs when selecting new PR
  };

  const handleInvalidJiraIds = (invalidIds: string[]) => {
    console.log(`⚠️ SplitPanel: Invalid JIRA IDs detected:`, invalidIds);
    setInvalidJiraIds(invalidIds);
  };

  // Clear selections when switching between different tab types
  useEffect(() => {
    if (currentTab === 'my-code-reviews' || currentTab === 'my-prs') {
      // Switching to GitHub tabs - clear PR selection and JIRA ticket selection
      setSelectedPR(undefined);
      setSelectedTicket(undefined); // Clear JIRA ticket selection
      setInvalidJiraIds([]); // Clear invalid JIRA IDs when switching tabs
    } else if (currentTab === 'my-sprint-jiras') {
      // Switching to JIRA tabs - clear PR selection AND JIRA ticket selection for clean slate
      setSelectedPR(undefined);
      setSelectedTicket(undefined); // Clear JIRA ticket selection to prevent stale Associated PRs
      setInvalidJiraIds([]); // Clear invalid JIRA IDs when switching tabs
    } else if (currentTab === 'feature-flags' || currentTab === 'doc-links' || currentTab === 'epics' || currentTab === 'reviewers') {
      // Feature flags, Doc Links, Epics, and Reviewers tabs - clear all selections
      setSelectedPR(undefined);
      setSelectedTicket(undefined);
      setInvalidJiraIds([]);
    }
  }, [currentTab]);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const container = e.currentTarget as HTMLElement;
    const rect = container.getBoundingClientRect();
    const newLeftWidth = ((e.clientX - rect.left) / rect.width) * 100;
    
    // Constrain between 20% and 80%
    const constrainedWidth = Math.min(Math.max(newLeftWidth, 20), 80);
    setLeftWidth(constrainedWidth);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Get content for current tab
  const getLeftPanelContent = () => {
    switch (currentTab) {
      case 'my-sprint-jiras':
        return <JiraPanel onTicketSelect={handleTicketSelect} selectedTicket={selectedTicket} />;

      case 'my-code-reviews':
        return <PRPanel tabType="my-code-reviews" onPRSelect={handlePRSelect} selectedPR={selectedPR} invalidJiraIds={invalidJiraIds} />;

      case 'my-prs':
        return (
          <PRPanel 
            tabType="my-prs" 
            prStatus={prStatus} 
            onPrStatusChange={setPrStatus} 
            onPRSelect={handlePRSelect}
            selectedPR={selectedPR}
            invalidJiraIds={invalidJiraIds}
          />
        );

      default:
        return <EmptyState message="Select a tab to view content" />;
    }
  };

  const getRightPanelContent = () => {
    // JIRA tabs show Associated PRs
    if (currentTab === 'my-sprint-jiras') {
      return <AssociatedPRsPanel selectedTicket={selectedTicket} />;
    }

    // GitHub tabs show Associated JIRAs
    if (currentTab === 'my-code-reviews' || currentTab === 'my-prs') {
      return <AssociatedJirasPanel selectedPR={selectedPR} onInvalidJiraIds={handleInvalidJiraIds} />;
    }

    return <EmptyState message="Right panel content" />;
  };

  // Quick Find mode - render special panels
  if (quickFindMode) {
    if (quickFindMode.type === 'jira') {
      return (
        <div 
          className={`split-panel ${isDragging ? 'dragging' : ''}`}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div className="panel left-panel" style={{ width: `${leftWidth}%` }}>
            <QuickFindJiraPanel 
              jiraId={quickFindMode.value} 
              onTicketFound={setQuickFindSelectedTicket}
            />
          </div>
          <div className="resize-handle" onMouseDown={handleMouseDown}>
            <div className="resize-handle-line"></div>
          </div>
          <div className="panel right-panel" style={{ width: `${100 - leftWidth}%` }}>
            <AssociatedPRsPanel selectedTicket={quickFindSelectedTicket} />
          </div>
        </div>
      );
    } else if (quickFindMode.type === 'pr') {
      return (
        <div 
          className={`split-panel ${isDragging ? 'dragging' : ''}`}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div className="panel left-panel" style={{ width: `${leftWidth}%` }}>
            <QuickFindPRPanel 
              prNumber={parseInt(quickFindMode.value, 10)} 
              onPRFound={setQuickFindSelectedPR}
              invalidJiraIds={quickFindInvalidJiraIds}
            />
          </div>
          <div className="resize-handle" onMouseDown={handleMouseDown}>
            <div className="resize-handle-line"></div>
          </div>
          <div className="panel right-panel" style={{ width: `${100 - leftWidth}%` }}>
            <AssociatedJirasPanel 
              selectedPR={quickFindSelectedPR} 
              onInvalidJiraIds={setQuickFindInvalidJiraIds} 
            />
          </div>
        </div>
      );
    }
  }

  // Feature Flags tab (full-width panel)
  if (currentTab === 'feature-flags') {
    return (
      <div className="full-panel">
        <FeatureFlagsPanel />
      </div>
    );
  }

  // Doc Links tab renders as full-width panel (no split)
  if (currentTab === 'doc-links') {
    return (
      <div className="full-panel">
        <DocLinksPanel />
      </div>
    );
  }

  // Epics tab renders as full-width panel (no split)
  if (currentTab === 'epics') {
    return (
      <div className="full-panel">
        <EpicsPanel />
      </div>
    );
  }

  // Reviewers tab renders as full-width panel (no split)
  if (currentTab === 'reviewers') {
    return (
      <div className="full-panel">
        <ReviewerWorkloadPanel />
      </div>
    );
  }

  return (
    <div 
      className={`split-panel ${isDragging ? 'dragging' : ''}`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Left Panel */}
      <div 
        className="panel left-panel"
        style={{ width: `${leftWidth}%` }}
      >
        {getLeftPanelContent()}
      </div>

      {/* Resize Handle */}
      <div 
        className="resize-handle"
        onMouseDown={handleMouseDown}
      >
        <div className="resize-handle-line"></div>
      </div>

      {/* Right Panel */}
      <div 
        className="panel right-panel"
        style={{ width: `${100 - leftWidth}%` }}
      >
        {getRightPanelContent()}
      </div>
    </div>
  );
};

export default SplitPanel;
