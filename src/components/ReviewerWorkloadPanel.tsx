import React, { useState, useEffect } from 'react';
import { useReviewerWorkload, useLastUpdatedFormat } from '../hooks/useApiQueries';
import { auditFetch } from '../utils/auditFetch';

interface TeamMember {
  name: string;
  role: string;
  tz: string;
  github?: string;
  jira?: string;
}

const ReviewerWorkloadPanel: React.FC = () => {
  const { data, isLoading, error, dataUpdatedAt, refetch, isFetching } = useReviewerWorkload();
  const lastUpdated = useLastUpdatedFormat(dataUpdatedAt);
  
  // Fetch full team roster to show who's missing GitHub usernames
  const [membersWithoutGithub, setMembersWithoutGithub] = useState<TeamMember[]>([]);

  useEffect(() => {
    const fetchTeamRoster = async () => {
      try {
        const response = await auditFetch('/api/team/members');
        if (response.ok) {
          const result = await response.json();
          const members = result.members || [];
          // Filter to devs/leads without GitHub usernames (exclude managers, QE, etc. unless they review code)
          const devRoles = ['dev', 'team lead', 'architect', 'intern'];
          const missing = members.filter((m: TeamMember) => 
            !m.github && devRoles.some(role => m.role.toLowerCase().includes(role))
          );
          setMembersWithoutGithub(missing);
        }
      } catch (err) {
        console.error('Failed to fetch team roster:', err);
      }
    };
    fetchTeamRoster();
  }, []);

  if (isLoading) {
    return (
      <div className="reviewer-workload-panel">
        <div className="panel-header">
          <h2>Reviewer Workload</h2>
        </div>
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading reviewer workload data...</p>
          <p className="loading-hint">This may take a moment as we fetch data for all team members</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="reviewer-workload-panel">
        <div className="panel-header">
          <h2>Reviewer Workload</h2>
        </div>
        <div className="error-state">
          <p>❌ {error instanceof Error ? error.message : 'Failed to load reviewer workload'}</p>
          <button onClick={() => refetch()} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data?.members || data.members.length === 0) {
    return (
      <div className="reviewer-workload-panel">
        <div className="panel-header">
          <h2>Reviewer Workload</h2>
        </div>
        <div className="empty-state">
          <p>No team members with GitHub usernames configured.</p>
          <p className="hint">Add GitHub usernames in the team roster to see workload data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="reviewer-workload-panel">
      <div className="panel-header">
        <h2>Reviewer Workload</h2>
        <div className="header-actions">
          <span className="last-updated">
            Updated: {lastUpdated}
            {isFetching && <span className="refreshing"> (refreshing...)</span>}
          </span>
          <button 
            onClick={() => refetch()} 
            className="refresh-btn"
            disabled={isFetching}
            title="Refresh data"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Warning about missing GitHub usernames */}
      {membersWithoutGithub.length > 0 && (
        <div className="missing-github-warning">
          <span className="warning-icon">⚠️</span>
          <span className="warning-text">
            <strong>{membersWithoutGithub.length} dev{membersWithoutGithub.length > 1 ? 's' : ''}</strong> missing GitHub usernames: {' '}
            {membersWithoutGithub.map(m => m.name).join(', ')}
          </span>
          <span className="warning-hint">
            Add via Timeboard → Edit, or update <code>data/members.json</code>
          </span>
        </div>
      )}

      {/* Data Table */}
      <div className="workload-table-container">
        <table className="workload-table">
          <thead>
            <tr>
              <th>Team Member</th>
              <th>GitHub</th>
              <th className="num-col pending-col">Pending</th>
              <th className="num-col changes-col">Changes Req.</th>
              <th className="num-col commented-col">Commented</th>
              <th className="num-col approved-col">Approved</th>
              <th className="num-col total-col">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((member) => (
              <tr key={member.github} className={member.error ? 'has-error' : ''}>
                <td className="name-cell">{member.name}</td>
                <td className="github-cell">
                  <a 
                    href={`https://github.com/${member.github}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="github-link"
                  >
                    @{member.github}
                  </a>
                </td>
                <td className="num-col pending-col">
                  {member.pending > 0 ? (
                    <a
                      href={`https://github.com/RedHatInsights/uhc-portal/pulls?q=is:pr+is:open+review-requested:${member.github}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="pending-link"
                    >
                      {member.pending}
                    </a>
                  ) : ''}
                </td>
                <td className="num-col changes-col">{member.changesRequested > 0 ? member.changesRequested : ''}</td>
                <td className="num-col commented-col">{member.commented > 0 ? member.commented : ''}</td>
                <td className="num-col approved-col">{member.approved > 0 ? member.approved : ''}</td>
                <td className="num-col total-col">{member.total > 0 ? member.total : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReviewerWorkloadPanel;
