import React, { useEffect } from 'react';
import { usePRByNumber } from '../hooks/useApiQueries';
import PRCard from './PRCard';
import BasePanel from './BasePanel';
import githubIcon from '../assets/githubIcon.png';

interface QuickFindPRPanelProps {
  prNumber: number;
  onPRFound: (pr: any | undefined) => void;
  invalidJiraIds?: string[];
}

const QuickFindPRPanel: React.FC<QuickFindPRPanelProps> = ({ prNumber, onPRFound, invalidJiraIds = [] }) => {
  const { data: pr, isLoading, error } = usePRByNumber(prNumber);

  // Auto-select the PR when found (to trigger Associated JIRAs)
  useEffect(() => {
    if (pr) {
      onPRFound(pr);
    } else {
      onPRFound(undefined);
    }
  }, [pr, onPRFound]);

  if (isLoading) {
    return (
      <BasePanel 
        title={`Finding PR #${prNumber}`}
        icon={githubIcon}
        iconAlt="GitHub"
        isLoading={true}
        loadingMessage={`Loading PR #${prNumber}...`}
      >
        <div>Loading...</div>
      </BasePanel>
    );
  }

  if (error) {
    return (
      <BasePanel 
        title="Quick Find - PR"
        icon={githubIcon}
        iconAlt="GitHub"
        error={error as Error}
      >
        <div>Error loading PR</div>
      </BasePanel>
    );
  }

  if (!pr) {
    return (
      <div className="panel-content">
        <div className="panel-header">
          <h3><img src={githubIcon} alt="GitHub" className="panel-icon" /> Quick Find - PR</h3>
        </div>
        <div className="panel-body">
          <div className="empty-state">
            <p>PR #{prNumber} not found in uhc-portal</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-content">
      <div className="panel-header">
        <h3><img src={githubIcon} alt="GitHub" className="panel-icon" /> Quick Find Result</h3>
      </div>
      <div className="panel-body">
        <div className="pr-cards-container">
          <PRCard 
            pr={pr}
            isSelected={true}
            invalidJiraIds={invalidJiraIds}
          />
        </div>
      </div>
    </div>
  );
};

export default QuickFindPRPanel;
