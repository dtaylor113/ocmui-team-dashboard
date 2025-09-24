import React from 'react';
import { useMyCodeReviews, useMyPRs, useLastUpdatedFormat } from '../hooks/useApiQueries';
import { useSettings } from '../contexts/SettingsContext';
import PRCard from './PRCard';
import BasePanel from './BasePanel';
import githubIcon from '../assets/githubIcon.png';

interface PRPanelProps {
  tabType: 'my-code-reviews' | 'my-prs';
  prStatus?: 'open' | 'closed';
  onPrStatusChange?: (status: 'open' | 'closed') => void;
  onPRSelect?: (pr: any) => void;
  selectedPR?: any;
  invalidJiraIds?: string[];
}

const PRPanel: React.FC<PRPanelProps> = ({ tabType, prStatus = 'open', onPrStatusChange, onPRSelect, selectedPR, invalidJiraIds }) => {
  const { isConfigured } = useSettings();
  
  // Use the appropriate query based on tab type
  const codeReviewsQuery = useMyCodeReviews();
  const myPRsQuery = useMyPRs(prStatus);
  
  const query = tabType === 'my-code-reviews' ? codeReviewsQuery : myPRsQuery;
  const lastUpdated = useLastUpdatedFormat(query.dataUpdatedAt);
  
  const { data, isLoading, error } = query;

  const handlePRClick = (pr: any) => {
    console.log('PR clicked:', pr);
    if (onPRSelect) {
      onPRSelect(pr);
    }
  };

  const getTitle = () => {
    const count = data?.total || 0;
    if (tabType === 'my-code-reviews') {
      return `I'm assigned to ${count} Code Reviews`;
    } else {
      const statusText = prStatus.charAt(0).toUpperCase() + prStatus.slice(1);
      return `I have ${count} ${statusText} PRs`;
    }
  };

  const getUpdateInterval = () => {
    return tabType === 'my-code-reviews' ? '2 minutes' : '4 minutes';
  };

  const getEmptyMessage = () => {
    if (tabType === 'my-code-reviews') {
      return '✅ No PRs awaiting your review';
    }
    return `No ${prStatus} PRs found`;
  };

  const getLoadingMessage = () => {
    return tabType === 'my-code-reviews' ? 'Loading code reviews...' : 'Loading your PRs...';
  };


  // Header controls for My PRs status toggle
  const headerControls = tabType === 'my-prs' && onPrStatusChange ? (
    <div className="pr-status-toggle">
      <label>
        <input 
          type="radio" 
          name="pr-status" 
          value="open" 
          checked={prStatus === 'open'}
          onChange={() => onPrStatusChange('open')}
        /> 
        Open
      </label>
      <label>
        <input 
          type="radio" 
          name="pr-status" 
          value="closed" 
          checked={prStatus === 'closed'}
          onChange={() => onPrStatusChange('closed')}
        /> 
        Closed
      </label>
    </div>
  ) : undefined;

  return (
    <BasePanel
      title={getTitle()}
      icon={githubIcon}
      iconAlt="GitHub"
      lastUpdated={lastUpdated}
      updateInterval={getUpdateInterval()}
      isConfigured={isConfigured}
      isLoading={isLoading}
      error={error}
      emptyMessage={getEmptyMessage()}
      loadingMessage={getLoadingMessage()}
      headerControls={headerControls}
    >
      {data?.pullRequests.length ? (
        <div className="pr-cards-container">
          {data.pullRequests.map((pr) => (
            <PRCard 
              key={pr.id} 
              pr={pr} 
              onClick={handlePRClick}
              isSelected={selectedPR?.id === pr.id}
              hasInvalidJiraIds={selectedPR?.id === pr.id && invalidJiraIds && invalidJiraIds.length > 0}
              invalidJiraIds={selectedPR?.id === pr.id ? invalidJiraIds : undefined}
            />
          ))}
        </div>
      ) : null}
    </BasePanel>
  );
};

export default PRPanel;
