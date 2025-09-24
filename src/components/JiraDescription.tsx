import React from 'react';
import { useJiraTicket } from '../hooks/useApiQueries';
import { parseJiraMarkdownSync } from '../utils/formatting';

interface JiraDescriptionProps {
  jiraKey: string;
}

const JiraDescription: React.FC<JiraDescriptionProps> = ({ jiraKey }) => {
  const { data, isLoading, error } = useJiraTicket(jiraKey);

  if (isLoading) {
    return <div className="loading">Loading description...</div>;
  }

  if (error) {
    return <div className="error-state">Failed to load description: {error.message}</div>;
  }

  if (!data || !data.success || !data.ticket) {
    return <div className="error-state">No description available</div>;
  }

  const ticket = data.ticket;

  return (
    <div className="scrollable-content description-content">
      {ticket.description ? (
        <div 
          className="markdown-container jira-description"
          dangerouslySetInnerHTML={{ 
            __html: parseJiraMarkdownSync(ticket.description, jiraKey, ticket.attachments)
          }}
        />
      ) : (
        <div className="no-content">No description provided</div>
      )}
    </div>
  );
};

export default JiraDescription;
