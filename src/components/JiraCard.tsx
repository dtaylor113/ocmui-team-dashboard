import React, { useEffect } from 'react';
import CollapsibleSection from './CollapsibleSection';
import JiraDescription from './JiraDescription';
import JiraComments from './JiraComments';
import JiraChildIssues from './JiraChildIssues';
import { useJiraTicket } from '../hooks/useApiQueries';
import { useSettings } from '../contexts/SettingsContext';
import { formatJiraTimestamp } from '../utils/formatting';
import { 
  countNewJiraCommentsSinceLastViewed, 
  updateJiraCommentsLastViewed 
} from '../utils/jiraCommentNotifications';

interface JiraTicket {
  key: string;
  summary: string;
  description?: string;
  status: string;
  priority: string;
  assignee: string;
  reporter: string;
  type: string;
  created: string;
  updated: string;
  sprint?: string;
}

interface JiraCardProps {
  ticket: JiraTicket;
  onClick?: (ticket: JiraTicket) => void;
  expandMoreInfoByDefault?: boolean;
  isSelected?: boolean;
}

const JiraCard: React.FC<JiraCardProps> = ({ ticket, onClick, expandMoreInfoByDefault = false, isSelected = false }) => {
  // Get full ticket data to access comments count (only if ticket exists and has key)
  const { data: ticketData } = useJiraTicket(ticket?.key || '');
  const { userPreferences } = useSettings();
  useEffect(() => {
    // Lazy cleanup of old localStorage keys
    import('../utils/jiraCommentNotifications')
      .then(({ cleanupOldJiraCommentKeys }) => {
        cleanupOldJiraCommentKeys();
      })
      .catch(() => {});
  }, []);
  const newCommentsCount = ticketData?.success && ticketData?.ticket?.comments 
    ? countNewJiraCommentsSinceLastViewed(ticket.key, ticketData.ticket.comments)
    : 0;
  
  // Parent/Epic links (from full ticket data)
  const epicKey: string | undefined = ticketData?.ticket?.epicKey;
  const parentKey: string | undefined = ticketData?.ticket?.parentKey;
  const featureKey: string | undefined = ticketData?.ticket?.featureKey;
  const hasEpic = !!epicKey;
  const hasParent = !!parentKey;
  const hasFeature = !!featureKey;
  const issueTypeUpper = ticket.type?.toUpperCase();
  const isEpic = issueTypeUpper === 'EPIC';
  const isFeatureLike = issueTypeUpper === 'FEATURE' || issueTypeUpper === 'INITIATIVE';

  // Fetch summaries for tooltips (queries are disabled when key is falsy)
  const { data: epicData } = useJiraTicket(hasEpic ? epicKey! : '');
  const { data: parentData } = useJiraTicket(hasParent ? parentKey! : '');
  const { data: featureData } = useJiraTicket(hasFeature ? featureKey! : '');
  const epicTooltip = hasEpic ? `${epicKey}${epicData?.ticket?.summary ? `: ${epicData.ticket.summary}` : ''}` : undefined;
  const parentTooltip = hasParent ? `${parentKey}${parentData?.ticket?.summary ? `: ${parentData.ticket.summary}` : ''}` : undefined;
  const featureTooltip = hasFeature ? `${featureKey}${featureData?.ticket?.summary ? `: ${featureData.ticket.summary}` : ''}` : undefined;
  

  const getTypeColor = (type: string) => {
    switch (type.toUpperCase()) {
      case 'STORY': return '#22c55e'; // Green
      case 'TASK': return '#3b82f6'; // Blue  
      case 'BUG': return '#ef4444'; // Red
      case 'EPIC': return '#8b5cf6'; // Purple
      default: return '#6b7280'; // Gray
    }
  };

  const toTitleCase = (value: string) => {
    if (!value) return '';
    return value
      .toString()
      .replace(/[_-]+/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  const getTypeIcon = (type: string): string => {
    switch (type.toUpperCase()) {
      case 'STORY': return '🟩';
      case 'TASK': return '🟦';
      case 'BUG': return '🐞';
      case 'EPIC': return '🟪';
      default: return '⬡';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toUpperCase()) {
      case 'BLOCKER':
        return '#ef4444'; // Bright red
      case 'CRITICAL':
        return '#dc2626'; // Red
      case 'MAJOR':
        return '#ea580c'; // Orange
      case 'NORMAL':
        return '#d6a94f'; // Tan-like
      case 'MINOR':
        return '#3b82f6'; // Blue
      case 'UNDEFINED':
      case 'NONE':
        return '#9ca3af'; // Gray
      default:
        return '#6b7280'; // Gray fallback
    }
  };

  const renderPriorityIcon = (priority: string) => {
    const p = priority.toUpperCase();
    const color = getPriorityColor(priority);
    if (p === 'UNDEFINED' || p === 'NONE') {
      return <span className="jira-badge-circle" aria-hidden="true" style={{ borderColor: color }}></span>;
    }
    if (p === 'MINOR') {
      return <span className="jira-badge-triangle-down" aria-hidden="true" style={{ borderTopColor: color }}></span>;
    }
    if (p === 'NORMAL') {
      return <span className="jira-badge-equals" aria-hidden="true" style={{ color }}>≡</span>;
    }
    // Upward triangles for Major, Critical, Blocker
    return <span className="jira-badge-triangle" aria-hidden="true" style={{ borderBottomColor: color }}></span>;
  };

  const getStatusColor = (status: string) => {
    const normalizedStatus = status.toUpperCase().replace(/\s+/g, '_');
    switch (normalizedStatus) {
      case 'TO_DO':
      case 'TODO':
      case 'OPEN':
        return '#42526E'; // Jira To Do gray-blue
      case 'IN_PROGRESS':
      case 'IN PROGRESS':
        return '#0052CC'; // Jira blue
      case 'CODE_REVIEW':
      case 'IN_REVIEW':
      case 'REVIEW':
        return '#0052CC'; // Jira blue for review stages
      case 'DONE':
      case 'RESOLVED':
      case 'CLOSED':
        return '#00875A'; // Jira green
      case 'BLOCKED':
        return '#EF4444'; // Red for blocked
      default:
        return '#6b7280'; // Fallback gray
    }
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick(ticket);
    }
  };

  return (
    <div 
      className={`jira-card ${isSelected ? 'selected' : ''}`}
      onClick={handleCardClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="jira-card-title">
        <span className="jira-card-title-text">{ticket.key}: {ticket.summary}</span>
        <a 
          href={`https://issues.redhat.com/browse/${ticket.key}`} 
          target="_blank" 
          rel="noopener noreferrer"
          className="jira-external-link"
          onClick={(e) => e.stopPropagation()}
          title="Open JIRA ticket"
        >
          ↗
        </a>
      </div>
      
      <div className="jira-card-badges">
        <span 
          className="jira-badge jira-type" 
          style={{ borderColor: getTypeColor(ticket.type) }}
        >
          <span className="jira-badge-icon" aria-hidden="true">{getTypeIcon(ticket.type)}</span>
          {toTitleCase(ticket.type)}
        </span>
        <span 
          className="jira-badge jira-priority" 
          style={{ borderColor: getPriorityColor(ticket.priority) }}
        >
          {renderPriorityIcon(ticket.priority)}
          {toTitleCase(ticket.priority)}
        </span>
        <span 
          className="jira-badge jira-status" 
          style={{ backgroundColor: getStatusColor(ticket.status), borderColor: getStatusColor(ticket.status) }}
        >
          {ticket.status.toUpperCase()}
        </span>
      </div>
      
      <div className="jira-card-metadata">
        <div className="jira-metadata-row">
          <div className="jira-card-field">
            <span className="jira-field-label">Assignee:</span>
            <span className="jira-field-value">{ticket.assignee}</span>
          </div>
          <div className="jira-card-field">
            <span className="jira-field-label">Last Updated:</span>
            <span className="jira-field-value">{formatJiraTimestamp(ticket.updated, userPreferences.timezone)}</span>
          </div>
        </div>
        <div className="jira-metadata-row">
          <div className="jira-card-field">
            <span className="jira-field-label">Reporter:</span>
            <span className="jira-field-value">{ticket.reporter}</span>
          </div>
          <div className="jira-card-field">
            <span className="jira-field-label">Created:</span>
            <span className="jira-field-value">{formatJiraTimestamp(ticket.created, userPreferences.timezone)}</span>
          </div>
        </div>
        {hasEpic && (
          <div className="jira-link-row" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span className="jira-field-label">Epic Link:</span>
            <a
              href={`https://issues.redhat.com/browse/${epicKey}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={epicTooltip}
              className="jira-link-value"
              style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {epicKey}{epicData?.ticket?.summary ? `: ${epicData.ticket.summary}` : ''} ↗
            </a>
          </div>
        )}
        {hasParent && (
          <div className="jira-link-row" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span className="jira-field-label">Parent Link:</span>
            <a
              href={`https://issues.redhat.com/browse/${parentKey}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={parentTooltip}
              className="jira-link-value"
              style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {parentKey}{parentData?.ticket?.summary ? `: ${parentData.ticket.summary}` : ''} ↗
            </a>
          </div>
        )}
        {hasFeature && (
          <div className="jira-link-row" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <span className="jira-field-label">Feature Link:</span>
            <a
              href={`https://issues.redhat.com/browse/${featureKey}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={featureTooltip}
              className="jira-link-value"
              style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {featureKey}{featureData?.ticket?.summary ? `: ${featureData.ticket.summary}` : ''} ↗
            </a>
          </div>
        )}
      </div>

      {/* Description Section */}
      <CollapsibleSection 
        title="Description"
        isExpandedByDefault={expandMoreInfoByDefault}
        className="jira-description-section"
      >
        <JiraDescription jiraKey={ticket.key} />
      </CollapsibleSection>

      {/* Child Issues Section for Epic/Feature */}
      {(isEpic || isFeatureLike) && (
        <CollapsibleSection 
          title={isEpic ? 'Issues in epic' : 'Child issues'}
          isExpandedByDefault={false}
          className="jira-children-section"
        >
          <JiraChildIssues parentKey={ticket.key} />
        </CollapsibleSection>
      )}

      {/* Comments Section */}
      <CollapsibleSection 
        title={
          <>
            Comments
            {newCommentsCount > 0 && (
              <span className="notification-badge superscript-badge">{newCommentsCount}</span>
            )}
          </>
        }
        isExpandedByDefault={false}
        onToggle={(expanded) => {
          if (expanded) {
            updateJiraCommentsLastViewed(ticket.key);
          }
        }}
        className="jira-comments-section"
      >
        <JiraComments jiraKey={ticket.key} />
      </CollapsibleSection>
    </div>
  );
};

export default JiraCard;
