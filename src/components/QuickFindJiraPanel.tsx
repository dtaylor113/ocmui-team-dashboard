import React, { useEffect } from 'react';
import { useJiraTicket } from '../hooks/useApiQueries';
import JiraCard from './JiraCard';
import BasePanel from './BasePanel';
import jiraLogo from '../assets/jiraLogo.png';

interface QuickFindJiraPanelProps {
  jiraId: string;
  onTicketFound: (ticketKey: string | undefined) => void;
}

const QuickFindJiraPanel: React.FC<QuickFindJiraPanelProps> = ({ jiraId, onTicketFound }) => {
  const { data, isLoading, error } = useJiraTicket(jiraId);

  // Auto-select the ticket when found (to trigger Associated PRs)
  useEffect(() => {
    if (data?.success && data.ticket) {
      onTicketFound(data.ticket.key);
    } else {
      onTicketFound(undefined);
    }
  }, [data, onTicketFound]);

  if (isLoading) {
    return (
      <BasePanel 
        title={`Finding ${jiraId}`}
        icon={jiraLogo}
        iconAlt="JIRA"
        isLoading={true}
        loadingMessage={`Loading ${jiraId}...`}
      >
        <div>Loading...</div>
      </BasePanel>
    );
  }

  if (error) {
    return (
      <BasePanel 
        title="Quick Find - JIRA"
        icon={jiraLogo}
        iconAlt="JIRA"
        error={error as Error}
      >
        <div>Error loading ticket</div>
      </BasePanel>
    );
  }

  if (!data?.success || !data.ticket) {
    return (
      <div className="panel-content">
        <div className="panel-header">
          <h3><img src={jiraLogo} alt="JIRA" className="panel-icon" /> Quick Find - JIRA</h3>
        </div>
        <div className="panel-body">
          <div className="empty-state">
            <p>Ticket {jiraId} not found</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-content">
      <div className="panel-header">
        <h3><img src={jiraLogo} alt="JIRA" className="panel-icon" /> Quick Find Result</h3>
      </div>
      <div className="panel-body">
        <div className="jira-cards-container">
          <JiraCard 
            ticket={data.ticket}
            isSelected={true}
          />
        </div>
      </div>
    </div>
  );
};

export default QuickFindJiraPanel;
