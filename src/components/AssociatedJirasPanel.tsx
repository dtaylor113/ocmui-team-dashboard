import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { useJiraTicket } from '../hooks/useApiQueries';
import JiraCard from './JiraCard';
import BasePanel from './BasePanel';
import jiraLogo from '../assets/jiraLogo.png';

interface GitHubPR {
  id: number;
  number: number;
  title: string;
  body?: string;
  html_url: string;
  repository_url?: string;
  url?: string;
}

interface AssociatedJirasPanelProps {
  selectedPR?: GitHubPR;
  onInvalidJiraIds?: (invalidIds: string[]) => void;
}

// Function to extract and validate JIRA IDs from text
const extractJiraIds = (text: string): { valid: string[], invalid: string[] } => {
  if (!text) return { valid: [], invalid: [] };
  
  // Common JIRA ID patterns: Look for uppercase letters followed by hyphen and numbers
  const jiraPattern = /\b[A-Z]+-\d+\b/g;
  const allMatches = text.match(jiraPattern) || [];
  
  // Define valid JIRA project prefixes for this organization
  const validPrefixes = ['OCMUI', 'OCM', 'JIRA', 'RHCLOUD', 'CONSOLE'];
  
  const valid: string[] = [];
  const invalid: string[] = [];
  
  // Remove duplicates and categorize
  [...new Set(allMatches)].forEach(match => {
    const prefix = match.split('-')[0];
    if (validPrefixes.includes(prefix)) {
      valid.push(match);
    } else {
      invalid.push(match);
    }
  });
  
  return { valid, invalid };
};

const AssociatedJirasPanel: React.FC<AssociatedJirasPanelProps> = ({ selectedPR, onInvalidJiraIds }) => {
  const [jiraIds, setJiraIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { isConfigured } = useSettings();

  console.log(`🎯 AssociatedJirasPanel received selectedPR:`, selectedPR ? `PR #${selectedPR.number}: ${selectedPR.title}` : 'null');

  useEffect(() => {
    console.log(`🎯 AssociatedJirasPanel: PR selection changed`, selectedPR ? `#${selectedPR.number}` : 'null');
    
    if (!selectedPR) {
      setJiraIds([]);
      setIsLoading(false);
      // Clear invalid JIRA IDs when no PR is selected
      if (onInvalidJiraIds) {
        onInvalidJiraIds([]);
      }
      return;
    }

    // Clear old JIRA IDs immediately to prevent stale data
    setJiraIds([]);
    setIsLoading(true);
    
    // Extract and validate JIRA IDs from PR title and description
    const titleExtraction = extractJiraIds(selectedPR.title || '');
    const descriptionExtraction = extractJiraIds(selectedPR.body || '');
    
    // Combine all valid JIRA IDs
    const allValidIds = [...new Set([...titleExtraction.valid, ...descriptionExtraction.valid])];
    
    // Combine all invalid JIRA IDs
    const allInvalidIds = [...new Set([...titleExtraction.invalid, ...descriptionExtraction.invalid])];
    
    console.log(`🔍 Extracted JIRA IDs from PR #${selectedPR.number}:`, { valid: allValidIds, invalid: allInvalidIds });
    
    // Always notify parent component about invalid JIRA IDs (even if empty array)
    if (onInvalidJiraIds) {
      onInvalidJiraIds(allInvalidIds);
    }
    
    // Add small delay only to show the loading state, not to delay processing
    const timer = setTimeout(() => {
      console.log(`✅ Setting valid JIRA IDs for PR #${selectedPR.number}:`, allValidIds);
      setJiraIds(allValidIds);
      setIsLoading(false);
    }, 300); // Reduced delay

    return () => {
      clearTimeout(timer);
    };
  }, [selectedPR]);

  const handleTicketClick = (ticket: any) => {
    // Could add ticket selection logic here in the future
    console.log('JIRA ticket clicked:', ticket);
  };


  return (
    <BasePanel
      title={selectedPR ? `JIRAs associated with PR #${selectedPR.number}` : 'Associated JIRAs'}
      icon={jiraLogo}
      iconAlt="JIRA"
      isConfigured={isConfigured}
      isLoading={isLoading}
      emptyMessage={selectedPR ? '🔍 No associated JIRAs found.\nNo JIRA IDs detected in PR title or description.' : 'Click on a PR to see related JIRA tickets'}
      loadingMessage="Extracting JIRA IDs..."
    >
      {jiraIds.length > 0 ? (
        <div className="jira-cards-container">
          {jiraIds.map((jiraId) => (
            <JiraTicketDisplay 
              key={`${selectedPR?.id || 'none'}-${jiraId}`} 
              jiraId={jiraId} 
              onClick={handleTicketClick} 
            />
          ))}
        </div>
      ) : null}
    </BasePanel>
  );
};

// Component to display a single JIRA ticket
interface JiraTicketDisplayProps {
  jiraId: string;
  onClick: (ticket: any) => void;
}

const JiraTicketDisplay: React.FC<JiraTicketDisplayProps> = React.memo(({ jiraId, onClick }) => {
  const jiraQuery = useJiraTicket(jiraId);
  const { data: jiraData, isLoading, error, isError } = jiraQuery;

  // Debug logging for development
  if (isError || (jiraData && !jiraData.success)) {
    console.log(`🎯 JiraTicketDisplay for ${jiraId}:`, {
      isLoading,
      isError,
      error: error?.message,
      dataSuccess: jiraData?.success,
      hasTicket: !!jiraData?.ticket,
      queryStatus: jiraQuery.status
    });
  }

  if (isLoading) {
    return (
      <div className="loading">
        Loading {jiraId}...
      </div>
    );
  }

  // Only show error if there's actually a network/API error
  if (isError && error) {
    console.error(`❌ Network error loading JIRA ticket ${jiraId}:`, error);
    return (
      <div className="jira-ticket-error">
        <p>❌ Could not load {jiraId}</p>
        <p><small>Network error: {error.message}</small></p>
      </div>
    );
  }

  // Only show error if data came back but was unsuccessful
  if (jiraData && !jiraData.success) {
    console.warn(`⚠️ JIRA API returned unsuccessful response for ${jiraId}:`, jiraData);
    return (
      <div className="jira-ticket-error">
        <p>❌ Could not load {jiraId}</p>
        <p><small>Ticket may not exist or you may not have access</small></p>
      </div>
    );
  }

  // If we have successful data, show the card
  if (jiraData?.success && jiraData.ticket) {
    return (
      <JiraCard
        ticket={jiraData.ticket}
        onClick={onClick}
        isSelected={false}
      />
    );
  }

  // Fallback - still loading or no data yet
  return (
    <div className="loading">
      Loading {jiraId}...
    </div>
  );
});

// Set display name for debugging
JiraTicketDisplay.displayName = 'JiraTicketDisplay';

export default AssociatedJirasPanel;
