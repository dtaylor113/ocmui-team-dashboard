import React from 'react';
import { useJiraTicket } from '../hooks/useApiQueries';
import { parseJiraMarkdownSync } from '../utils/formatting';


interface JiraCommentsProps {
  jiraKey: string;
}

const JiraComments: React.FC<JiraCommentsProps> = ({ jiraKey }) => {
  const { data, isLoading, error } = useJiraTicket(jiraKey);

  if (isLoading) {
    return <div className="loading">Loading comments...</div>;
  }

  if (error) {
    return <div className="error-state">Failed to load comments: {error.message}</div>;
  }

  if (!data || !data.success || !data.ticket) {
    return <div className="error-state">No comments available</div>;
  }

  const ticket = data.ticket;

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Sort comments by most recent first
  const sortedComments = [...(ticket.comments || [])].sort((a, b) => 
    new Date(b.created).getTime() - new Date(a.created).getTime()
  );

  return (
    <div className="scrollable-content comments-content" style={{ maxHeight: "250px" }}>
      {sortedComments.length > 0 ? (
        <div className="comments-list">
          {sortedComments.map((comment, index) => (
            <div key={index} className="jira-comment">
              <div className="comment-header">
                <span className="comment-author">{comment.author}</span>
                <span className="comment-date">{formatDate(comment.created)}</span>
              </div>
              <div 
                className="markdown-container comment-body"
                dangerouslySetInnerHTML={{ 
                  __html: parseJiraMarkdownSync(comment.body || '', jiraKey, ticket.attachments)
                }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="no-content">No comments available</div>
      )}
    </div>
  );
};

export default JiraComments;
