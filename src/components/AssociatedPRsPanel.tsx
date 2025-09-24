import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { enhancePRsWithReviewers } from '../hooks/useApiQueries';
import PRCard from './PRCard';
import githubIcon from '../assets/githubIcon.png';

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
  repository_url?: string;
}

interface AssociatedPRsPanelProps {
  selectedTicket?: string;
}

const AssociatedPRsPanel: React.FC<AssociatedPRsPanelProps> = ({ selectedTicket }) => {
  const [associatedPRs, setAssociatedPRs] = useState<GitHubPR[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { apiTokens, isConfigured } = useSettings();

  useEffect(() => {
    if (!selectedTicket || !isConfigured) {
      setAssociatedPRs([]);
      setError(null);
      return;
    }

    const searchForPRs = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // Search GitHub for PRs mentioning the JIRA ticket ID
        const query = `is:pr ${selectedTicket}`;
        const response = await fetch(
          `https://api.github.com/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=10`,
          {
            headers: {
              'Authorization': `Bearer ${apiTokens.github}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          }
        );

        if (!response.ok) {
          throw new Error(`GitHub API error: ${response.status}`);
        }

        const data = await response.json();
        const basePRs = data.items || [];
        
        // Debug: Log PR search results
        // console.log(`📋 AssociatedPRsPanel found ${basePRs.length} PRs for ticket ${selectedTicket}`);
        
        // Enhance PRs with reviewer data (same as main PR hooks)
        const enhancedPRs = await enhancePRsWithReviewers(basePRs, apiTokens.github, apiTokens.githubUsername);
        setAssociatedPRs(enhancedPRs);
      } catch (err) {
        console.error('Error searching for associated PRs:', err);
        setError(err instanceof Error ? err.message : 'Failed to search for PRs');
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(searchForPRs, 500); // Debounce search
    return () => clearTimeout(timeoutId);
  }, [selectedTicket, isConfigured, apiTokens.github]);

  const handlePRClick = (pr: GitHubPR) => {
    // Could add PR selection logic here in the future
    console.log('PR clicked:', pr);
  };

  return (
    <div className="panel-content">
      <div className="panel-header">
        <h3>
          <img src={githubIcon} alt="GitHub" className="panel-icon" /> 
          {selectedTicket ? `PRs associated with ${selectedTicket}` : 'Associated PRs'}
        </h3>
        <p className="pr-reviewers-help">* you can click on certain Reviewers badges to see comments</p>
      </div>
      
      <div className="panel-body">
        {!selectedTicket ? (
          <div className="empty-state">
            <p>Click on a JIRA ticket to see related PRs</p>
            <p><small>PRs are found by searching GitHub for mentions of the JIRA ticket ID</small></p>
          </div>
        ) : !isConfigured ? (
          <div className="empty-state">
            <p>⚙️ Configure GitHub tokens in Settings to view related PRs</p>
          </div>
        ) : isLoading ? (
          <div className="loading">
            <p>🔍 Searching for PRs related to {selectedTicket}...</p>
          </div>
        ) : error ? (
          <div className="error-state">
            <p>❌ Error searching for PRs: {error}</p>
          </div>
        ) : associatedPRs.length > 0 ? (
          <div className="pr-cards-container">
            {associatedPRs.map((pr) => (
              <PRCard
                key={pr.id}
                pr={pr}
                onClick={handlePRClick}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No PRs found mentioning {selectedTicket}</p>
            <p><small>Try checking GitHub manually or the ticket might not have associated PRs yet</small></p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssociatedPRsPanel;
