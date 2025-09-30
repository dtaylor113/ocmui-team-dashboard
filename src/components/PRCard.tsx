import React, { useState, useEffect } from 'react';
import type { GitHubReviewer } from '../hooks/useApiQueries';
import { usePRConversation } from '../hooks/useApiQueries';
import { useSettings } from '../contexts/SettingsContext';
import { formatRelativeDateInTimezone } from '../utils/formatting';
import { 
  initializeReviewerTimestamps, 
  getNotificationInfo, 
  updateLastClickedTime,
  cleanupOldNotifications 
} from '../utils/reviewerNotifications';
import { setupNotificationDebugTools } from '../utils/debugNotifications';
import ReviewerCommentsModal from './ReviewerCommentsModal';
import CollapsibleSection from './CollapsibleSection';
import PRDescription from './PRDescription';
import PRConversation from './PRConversation';

// Use the GitHubPR interface from useApiQueries (via props)
interface GitHubPR {
  id: number;
  number: number;
  title: string;
  state: string;
  url: string;
  html_url: string;  // Web page URL for GitHub PR
  created_at: string;
  updated_at: string;
  user?: {
    login: string;
    avatar_url: string;
  };
  head?: {
    ref: string;
  };
  base?: {
    ref: string;
  };
  // Enhanced data from detailed PR fetch
  reviewers?: GitHubReviewer[];
  repository_url?: string;
  // Mergeability details
  mergeable_state?: string;
  needsRebase?: boolean;
  // Checks status
  checksState?: 'success' | 'failure' | 'pending' | 'error';
  checksSummary?: string;
  checksTotal?: number;
  checksSucceeded?: number;
}

// Helper function to extract repository name from PR object
const getRepoName = (pr: GitHubPR): string => {
  // URLs are in format: https://api.github.com/repos/owner/repo/issues/123
  const repoMatch = pr.repository_url?.match(/github\.com\/repos\/([^/]+)\/([^/]+)/);
  if (repoMatch) return `${repoMatch[1]}/${repoMatch[2]}`;
  
  const urlMatch = pr.url?.match(/github\.com\/repos\/([^/]+)\/([^/]+)/);
  return urlMatch ? `${urlMatch[1]}/${urlMatch[2]}` : 'unknown/repo';
};

interface PRCardProps {
  pr: GitHubPR;
  onClick?: (pr: GitHubPR) => void;
  isSelected?: boolean;
  hasInvalidJiraIds?: boolean;
  invalidJiraIds?: string[];
}

const PRCard: React.FC<PRCardProps> = ({ pr, onClick, isSelected = false, hasInvalidJiraIds = false, invalidJiraIds = [] }) => {
  const { userPreferences } = useSettings();
  const [selectedReviewer, setSelectedReviewer] = useState<string | null>(null);
  const [showJiraWarning, setShowJiraWarning] = useState(false);
  
  // Initialize notification system and cleanup old data
  useEffect(() => {
    if (pr.reviewers && pr.reviewers.length > 0) {
      // Initialize timestamps for fresh start approach
      const reviewerUsernames = pr.reviewers.map(r => r.username);
      initializeReviewerTimestamps(getRepoName(pr), pr.number, reviewerUsernames);
    }
    
    // Periodic cleanup of old notification data (once per session)
    cleanupOldNotifications();
    
    // Setup debug tools (once per session)
    setupNotificationDebugTools();
  }, [pr.reviewers, pr.number]);

  // Debug: Only log when there are unexpected reviewer issues
  useEffect(() => {
    if (pr.reviewers?.length === 0) {
      console.log(`📊 PRCard #${pr.number}: No reviewers found`);
    }
  }, [pr.number, pr.reviewers]);
  
  // Get PR conversation data to access comments count
  const repoName = getRepoName(pr);
  const { data: conversationData } = usePRConversation(repoName, pr.number);
  const conversationCount = conversationData?.comments ? conversationData.comments.length : 0;

  const handleReviewerClick = (e: React.MouseEvent, reviewer: string) => {
    e.stopPropagation(); // Prevent PR card click
    setSelectedReviewer(reviewer);
    
    // Update last clicked timestamp to clear notification for this reviewer
    updateLastClickedTime(getRepoName(pr), pr.number, reviewer);
  };

  const closeReviewerModal = () => {
    setSelectedReviewer(null);
  };


  const getStateColor = (state: string) => {
    switch (state.toLowerCase()) {
      case 'open': return '#10b981';
      case 'closed': return '#ef4444';
      case 'merged': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  // Helper functions for reviewer badges (based on old JS app)
  const getReviewerBadgeClass = (reviewer: GitHubReviewer): string => {
    const baseClass = reviewer.isCurrentUser ? 'reviewer-you' : 
                      reviewer.username.includes('[bot]') ? 'reviewer-bot' : 'reviewer-other';
    
    const stateClasses: Record<GitHubReviewer['state'], string> = {
      'approved': 'reviewer-approved',
      'changes_requested': 'reviewer-changes-requested', 
      'commented': 'reviewer-commented',
      'review_requested': 'reviewer-pending',
      'dismissed': 'reviewer-dismissed'
    };

    const stateClass = stateClasses[reviewer.state] || 'reviewer-commented'; // Fallback to commented
    return `${baseClass} ${stateClass}`;
  };

  const getReviewerStateText = (state: GitHubReviewer['state']): string => {
    const stateTexts: Record<GitHubReviewer['state'], string> = {
      'approved': 'Approved',
      'changes_requested': 'Changes Requested',
      'commented': 'Commented', 
      'review_requested': 'Review Requested',
      'dismissed': 'Dismissed'
    };
    return stateTexts[state] || 'Commented'; // Fallback to "Commented"
  };

  const getReviewerStateIcon = (state: GitHubReviewer['state']): string => {
    const stateIcons: Record<GitHubReviewer['state'], string> = {
      'approved': '✅',
      'changes_requested': '❌',
      'commented': '💬',
      'review_requested': '?',
      'dismissed': '⏸️'
    };
    return stateIcons[state] || '💬'; // Fallback to comment icon
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick(pr);
    }
  };

  return (
    <div className={`pr-card ${isSelected ? 'selected' : ''}`} onClick={handleCardClick}>
      {/* PR Title with external link and warning icon */}
      <div className="pr-card-title-section">
        <span style={{ flex: 1, minWidth: 0 }}>
          <a 
            href={pr.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="pr-card-title-text"
            title={`Open PR #${pr.number}`}
            onClick={(e) => e.stopPropagation()}
          >
            #{pr.number} {pr.title}
          </a>
        </span>
        <div className="pr-card-actions">
          <a 
            href={pr.html_url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="pr-external-link"
            onClick={(e) => e.stopPropagation()}
            title="Open PR on GitHub"
          >
            ↗
          </a>
          {hasInvalidJiraIds && (
            <button
              className="jira-warning-icon"
              onClick={(e) => {
                e.stopPropagation();
                setShowJiraWarning(true);
              }}
              title="Invalid JIRA IDs detected"
            >
              ⚠️
            </button>
          )}
        </div>
      </div>
      
      {/* Status Badges */}
      <div className="pr-card-badges">
        <span 
          className="pr-badge pr-state" 
          style={{ borderColor: getStateColor(pr.state) }}
        >
          {pr.state.toUpperCase()}
        </span>
        {/* Ready to Merge badge (3+ approvals, no rebase needed, checks passed) */}
        {(() => {
          const approvals = (pr.reviewers || []).filter(r => r.state === 'approved').length;
          const checksPassed = pr.checksState === 'success';
          const readyToMerge = approvals >= 3 && !pr.needsRebase && checksPassed;
          if (readyToMerge) {
            return (
              <span className="pr-badge pr-ready-merge" title={pr.checksSummary || '3+ approvals, checks passed, up-to-date with base'}>
                Ready to Merge
              </span>
            );
          }
          return (
            <span className={`pr-badge pr-checks ${pr.checksState === 'success' ? 'passed' : (pr.checksState === 'failure' || pr.checksState === 'error') ? 'failed' : ''}`} title={pr.checksSummary || 'Checks status unknown'}>
              Checks: <span className="check-value">{pr.checksState ? (pr.checksState === 'success' ? 'Passed' : pr.checksState.charAt(0).toUpperCase() + pr.checksState.slice(1)) : 'Unknown'}</span>
            </span>
          );
        })()}
        {pr.needsRebase && (
          <span className="pr-badge pr-needs-rebase" title={pr.mergeable_state === 'dirty' ? 'Merge conflicts with base branch' : 'This branch is out-of-date with the base branch'}>
            Needs Rebase
          </span>
        )}
        {/* Author and date info */}
        <span className="pr-card-author-info">
          By {pr.user?.login || 'Unknown user'} • Created: {formatRelativeDateInTimezone(pr.created_at, userPreferences.timezone)} • Last Updated: {formatRelativeDateInTimezone(pr.updated_at, userPreferences.timezone)}
        </span>
      </div>
      
      {/* Reviewers section */}
      <div className="pr-card-reviewers">
        <span className="pr-reviewers-label">Reviewers:</span>
        {pr.reviewers && pr.reviewers.length > 0 ? (
          pr.reviewers.map((reviewer) => {
            // Get notification info including count and age-based urgency
            const notificationInfo = reviewer.hasComments && conversationData?.comments ? 
              getNotificationInfo(getRepoName(pr), pr.number, reviewer.username, conversationData.comments) : 
              { count: 0, urgency: 'none' as const, newestCommentAge: 0 };
            
            const { count: newCommentsCount, urgency } = notificationInfo;
            
            // Debug: Log notification badge rendering for this reviewer
            if (reviewer.hasComments && conversationData?.comments) {
              console.log(`🎯 PRCard rendering reviewer ${reviewer.username} for PR #${pr.number}:`, {
                hasComments: reviewer.hasComments,
                commentsAvailable: conversationData.comments.length,
                notificationInfo,
                willShowBadge: newCommentsCount > 0
              });
            }
            
            return (
              <span 
                key={reviewer.username}
                className={`reviewer-badge ${getReviewerBadgeClass(reviewer)} ${reviewer.hasComments ? 'clickable-reviewer' : ''}`} 
                onClick={reviewer.hasComments ? (e) => handleReviewerClick(e, reviewer.username) : undefined}
                title={`${reviewer.username}${reviewer.isCurrentUser ? ' (You)' : ''}: ${getReviewerStateText(reviewer.state)}${reviewer.hasComments ? ' - Click to view comments' : ''}${newCommentsCount > 0 ? ` • ${newCommentsCount} new comment${newCommentsCount > 1 ? 's' : ''}!` : ''}`}
              >
                {getReviewerStateIcon(reviewer.state)} {reviewer.username}{reviewer.isCurrentUser ? ' (You)' : ''}
                {newCommentsCount > 0 && (
                  <span className={`notification-badge notification-${urgency}`}>
                    {newCommentsCount}
                  </span>
                )}
              </span>
            );
          })
        ) : (
          <span className="reviewer-badge reviewer-none">No reviewers assigned</span>
        )}
      </div>
      
      {/* Description Section */}
      <CollapsibleSection 
        title="Description"
        isExpandedByDefault={false}
        className="pr-description-section"
      >
        <PRDescription repoName={repoName} prNumber={pr.number} />
      </CollapsibleSection>

      {/* Conversation Section */}
      <CollapsibleSection 
        title={`Conversation (${conversationCount})`}
        isExpandedByDefault={false}
        className="pr-conversation-section"
      >
        <PRConversation repoName={repoName} prNumber={pr.number} />
      </CollapsibleSection>
      
      {/* Reviewer Comments Modal */}
      {selectedReviewer && (
        <ReviewerCommentsModal
          reviewer={selectedReviewer}
          repoName={repoName}
          prNumber={pr.number}
          isOpen={!!selectedReviewer}
          onClose={closeReviewerModal}
        />
      )}

      {/* JIRA Warning Modal */}
      {showJiraWarning && (
        <div className="modal-backdrop" onClick={() => setShowJiraWarning(false)}>
          <div className="modal-content jira-warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚠️ Invalid JIRA IDs Detected</h3>
              <button className="modal-close" onClick={() => setShowJiraWarning(false)}>×</button>
            </div>
            <div className="modal-body">
              <p><strong>The following JIRA IDs were found but may be invalid:</strong></p>
              <ul className="invalid-jira-list">
                {invalidJiraIds.map((jiraId) => (
                  <li key={jiraId} className="invalid-jira-item">
                    <code>{jiraId}</code>
                  </li>
                ))}
              </ul>
              <p><strong>Possible issues:</strong></p>
              <ul>
                <li>Typos in JIRA project prefix (e.g., "OCMU" instead of "OCMUI")</li>
                <li>Incorrect JIRA project reference</li>
                <li>Ticket may not exist or you may not have access</li>
              </ul>
              <p><em>Please check the PR title and description for correct JIRA ID formatting.</em></p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setShowJiraWarning(false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PRCard;
