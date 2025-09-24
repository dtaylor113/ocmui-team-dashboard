import React, { useMemo, useState } from 'react';
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
  const [reviewFilter, setReviewFilter] = useState<'reviewing' | 'approved'>('reviewing');
  
  // Use the appropriate query based on tab type
  const codeReviewsQuery = useMyCodeReviews();
  const myPRsQuery = useMyPRs(prStatus);
  
  const query = tabType === 'my-code-reviews' ? codeReviewsQuery : myPRsQuery;
  const lastUpdated = useLastUpdatedFormat(query.dataUpdatedAt);
  
  const { data, isLoading, error } = query;

  // Prepare data for code reviews filtering and counts
  const allCodeReviewPRs = useMemo(() => (tabType === 'my-code-reviews' ? (data?.pullRequests || []) : []), [tabType, data]);

  const isApprovedByMe = (pr: any): boolean => {
    const reviewers = pr?.reviewers || [];
    return reviewers.some((r: any) => r?.isCurrentUser && r?.state === 'approved');
  };

  const approvedPRs = useMemo(() => allCodeReviewPRs.filter((pr: any) => isApprovedByMe(pr)), [allCodeReviewPRs]);
  const reviewingPRs = useMemo(() => allCodeReviewPRs.filter((pr: any) => !isApprovedByMe(pr)), [allCodeReviewPRs]);
  const filteredPRs = useMemo(() => (tabType === 'my-code-reviews'
    ? (reviewFilter === 'approved' ? approvedPRs : reviewingPRs)
    : (data?.pullRequests || [])), [tabType, reviewFilter, approvedPRs, reviewingPRs, data]);

  const handlePRClick = (pr: any) => {
    console.log('PR clicked:', pr);
    if (onPRSelect) {
      onPRSelect(pr);
    }
  };

  const getTitle = () => {
    const count = data?.total || 0;
    if (tabType === 'my-code-reviews') {
      const x = reviewingPRs.length;
      const X = approvedPRs.length;
      return (
        <span>
          I am 
          <label style={{ marginLeft: 6, marginRight: 6 }}>
            <input
              type="radio"
              name="review-filter-title"
              value="reviewing"
              checked={reviewFilter === 'reviewing'}
              onChange={() => setReviewFilter('reviewing')}
            />
            {' '}reviewing {x}
          </label>
          PRs, and have 
          <label style={{ marginLeft: 6 }}>
            <input
              type="radio"
              name="review-filter-title"
              value="approved"
              checked={reviewFilter === 'approved'}
              onChange={() => setReviewFilter('approved')}
            />
            {' '}approved {X}
          </label>
          {' '}PRs
        </span>
      );
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
      return reviewFilter === 'approved' ? 'No approved PRs found' : '✅ No PRs awaiting your review';
    }
    return `No ${prStatus} PRs found`;
  };

  const getLoadingMessage = () => {
    return tabType === 'my-code-reviews' ? 'Loading code reviews...' : 'Loading your PRs...';
  };


  // Header controls: My PRs status toggle (Code Reviews radios are embedded in title)
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
      {filteredPRs.length ? (
        <div className="pr-cards-container">
          {filteredPRs.map((pr) => (
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
