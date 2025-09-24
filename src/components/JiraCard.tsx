import React from 'react';
import CollapsibleSection from './CollapsibleSection';
import JiraDescription from './JiraDescription';
import JiraComments from './JiraComments';
import { useJiraTicket } from '../hooks/useApiQueries';
import { useSettings } from '../contexts/SettingsContext';
import { formatJiraTimestamp } from '../utils/formatting';

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
  const commentsCount = ticketData?.success && ticketData?.ticket?.comments ? ticketData.ticket.comments.length : 0;
  

  const getTypeColor = (type: string) => {
    switch (type.toUpperCase()) {
      case 'STORY': return '#22c55e'; // Green
      case 'TASK': return '#3b82f6'; // Blue  
      case 'BUG': return '#ef4444'; // Red
      case 'EPIC': return '#8b5cf6'; // Purple
      default: return '#6b7280'; // Gray
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toUpperCase()) {
      case 'HIGHEST': return '#dc2626'; // Dark red
      case 'HIGH': return '#ea580c'; // Orange-red
      case 'MAJOR': return '#f59e0b'; // Orange
      case 'MEDIUM': return '#eab308'; // Yellow
      case 'LOW': return '#65a30d'; // Green
      case 'LOWEST': return '#16a34a'; // Dark green
      default: return '#6b7280'; // Gray
    }
  };

  const getStatusColor = (status: string) => {
    const normalizedStatus = status.toUpperCase().replace(/\s+/g, '_');
    switch (normalizedStatus) {
      case 'IN_PROGRESS':
      case 'IN PROGRESS': return '#3b82f6'; // Blue
      case 'DONE':
      case 'RESOLVED': return '#22c55e'; // Green
      case 'TO_DO':
      case 'TODO':
      case 'OPEN': return '#6b7280'; // Gray
      case 'BLOCKED': return '#ef4444'; // Red
      case 'IN_REVIEW':
      case 'REVIEW': return '#8b5cf6'; // Purple
      default: return '#6b7280'; // Gray
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
          style={{ backgroundColor: getTypeColor(ticket.type) }}
        >
          {ticket.type.toUpperCase()}
        </span>
        <span 
          className="jira-badge jira-priority" 
          style={{ backgroundColor: getPriorityColor(ticket.priority) }}
        >
          {ticket.priority.toUpperCase()}
        </span>
        <span 
          className="jira-badge jira-status" 
          style={{ backgroundColor: getStatusColor(ticket.status) }}
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
      </div>

      {/* Description Section */}
      <CollapsibleSection 
        title="Description"
        isExpandedByDefault={expandMoreInfoByDefault}
        className="jira-description-section"
      >
        <JiraDescription jiraKey={ticket.key} />
      </CollapsibleSection>

      {/* Comments Section */}
      <CollapsibleSection 
        title={`Comments (${commentsCount})`}
        isExpandedByDefault={false}
        className="jira-comments-section"
      >
        <JiraComments jiraKey={ticket.key} />
      </CollapsibleSection>
    </div>
  );
};

export default JiraCard;
