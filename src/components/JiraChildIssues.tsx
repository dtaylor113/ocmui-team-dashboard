import React from 'react';
import { useJiraChildIssues } from '../hooks/useApiQueries';

interface JiraChildIssuesProps {
  parentKey: string;
}

const JiraChildIssues: React.FC<JiraChildIssuesProps> = ({ parentKey }) => {
  const { data, isLoading, error } = useJiraChildIssues(parentKey);

  if (isLoading) return <div className="loading">Loading child issues...</div>;
  if (error) return <div className="error-state">Failed to load child issues</div>;
  if (!data?.success) return <div className="no-content">No child issues</div>;

  const issues = data.issues || [];

  if (issues.length === 0) {
    return <div className="no-content">No child issues</div>;
  }

  return (
    <div className="scrollable-content" style={{ maxHeight: '220px', overflowX: 'auto' }}>
      <table className="jira-child-issues-table" style={{ width: '100%', minWidth: 760, borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr>
            <th className="jira-field-label" style={{ textAlign: 'left', padding: '4px 8px' }}>Issue</th>
            <th className="jira-field-label" style={{ textAlign: 'left', padding: '4px 8px' }}>Status</th>
            <th className="jira-field-label" style={{ textAlign: 'left', padding: '4px 8px' }}>Type</th>
            <th className="jira-field-label" style={{ textAlign: 'left', padding: '4px 8px' }}>Assignee</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((issue: any) => {
            const typeName = String(issue.type || '').toUpperCase();
            const typeColor = getTypeColor(typeName);
            const typeIcon = getTypeIcon(typeName);
            const statusText = (issue.status || '').toUpperCase();
            return (
              <tr key={issue.key}>
                <td style={{ padding: '4px 8px', maxWidth: 420 }}>
                  <a
                    href={`https://issues.redhat.com/browse/${issue.key}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="jira-link-value"
                    title={`${issue.key}: ${issue.summary}`}
                    style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {issue.key}: {issue.summary} ↗
                  </a>
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <span className="jira-badge jira-status" style={{ backgroundColor: getStatusColor(statusText), borderColor: getStatusColor(statusText) }}>{statusText}</span>
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <span className="jira-badge jira-type" style={{ borderColor: typeColor }}>
                    <span className="jira-badge-icon" aria-hidden="true">{typeIcon}</span>
                    {toTitleCase(typeName)}
                  </span>
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <span className="jira-field-value" style={{ color: '#9ca3af' }}>{issue.assignee}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// Utilities copied to keep badges matching JiraCard
const toTitleCase = (value: string) => {
  if (!value) return '';
  return value.toString().replace(/[_-]+/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
};

const getTypeColor = (type: string) => {
  switch (type.toUpperCase()) {
    case 'STORY': return '#22c55e';
    case 'TASK': return '#3b82f6';
    case 'BUG': return '#ef4444';
    case 'EPIC': return '#8b5cf6';
    default: return '#6b7280';
  }
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

const getStatusColor = (status: string) => {
  const normalizedStatus = status.toUpperCase().replace(/\s+/g, '_');
  switch (normalizedStatus) {
    case 'TO_DO':
    case 'TODO':
    case 'OPEN':
      return '#42526E';
    case 'IN_PROGRESS':
    case 'IN PROGRESS':
      return '#0052CC';
    case 'CODE_REVIEW':
    case 'IN_REVIEW':
    case 'REVIEW':
      return '#0052CC';
    case 'DONE':
    case 'RESOLVED':
    case 'CLOSED':
      return '#00875A';
    case 'BLOCKED':
      return '#EF4444';
    default:
      return '#6b7280';
  }
};

export default JiraChildIssues;


