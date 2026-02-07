import React, { useState, useEffect } from 'react';
import { useReviewerWorkload, useLastUpdatedFormat } from '../hooks/useApiQueries';

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
        const response = await fetch('/api/team/members');
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

  // Summary stats
  const summary = React.useMemo(() => {
    if (!data?.members) return null;
    
    const members = data.members;
    const totalPending = members.reduce((sum, m) => sum + m.pending, 0);
    const totalChangesRequested = members.reduce((sum, m) => sum + m.changesRequested, 0);
    const totalCommented = members.reduce((sum, m) => sum + m.commented, 0);
    const totalApproved = members.reduce((sum, m) => sum + m.approved, 0);
    const totalAll = totalPending + totalChangesRequested + totalCommented + totalApproved;
    
    // Find who has most pending (highest urgency)
    const mostPending = members.reduce((max, m) => 
      m.pending > max.pending ? m : max, members[0]);
    
    // Find who has least total (most available)
    const leastBusy = members.reduce((min, m) => 
      m.total < min.total ? m : min, members[0]);

    return {
      totalPending,
      totalChangesRequested,
      totalCommented,
      totalApproved,
      totalAll,
      mostPending: mostPending?.pending > 0 ? mostPending : null,
      leastBusy: leastBusy?.total < (mostPending?.total || Infinity) ? leastBusy : null,
      memberCount: members.length,
    };
  }, [data?.members]);

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

      {/* Summary Cards */}
      {summary && (
        <div className="workload-summary">
          <div className="summary-card pending">
            <div className="summary-value">{summary.totalPending}</div>
            <div className="summary-label">Pending Reviews</div>
            <div className="summary-hint">Awaiting first review</div>
          </div>
          <div className="summary-card changes-requested">
            <div className="summary-value">{summary.totalChangesRequested}</div>
            <div className="summary-label">Changes Requested</div>
            <div className="summary-hint">May need re-review</div>
          </div>
          <div className="summary-card commented">
            <div className="summary-value">{summary.totalCommented}</div>
            <div className="summary-label">Commented</div>
            <div className="summary-hint">Engaged, no decision</div>
          </div>
          <div className="summary-card approved">
            <div className="summary-value">{summary.totalApproved}</div>
            <div className="summary-label">Approved</div>
            <div className="summary-hint">Review complete</div>
          </div>
        </div>
      )}

      {/* Availability hints */}
      {summary && summary.leastBusy && (
        <div className="availability-hint">
          <span className="hint-icon">💡</span>
          <span className="hint-text">
            <strong>{summary.leastBusy.name}</strong> has the lightest load ({summary.leastBusy.total} total reviews)
            {summary.mostPending && summary.mostPending.name !== summary.leastBusy.name && (
              <span> • <strong>{summary.mostPending.name}</strong> has the most pending ({summary.mostPending.pending})</span>
            )}
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
            {data.members.map((member, index) => (
              <tr key={member.github} className={`${member.error ? 'has-error' : ''} ${index < 2 ? 'top-available' : ''}`}>
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
                <td className="num-col pending-col">{member.pending}</td>
                <td className="num-col changes-col">{member.changesRequested}</td>
                <td className="num-col commented-col">{member.commented}</td>
                <td className="num-col approved-col">{member.approved}</td>
                <td className="num-col total-col">{member.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReviewerWorkloadPanel;
