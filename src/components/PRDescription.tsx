import React, { useState, useEffect } from 'react';
import { usePRConversation } from '../hooks/useApiQueries';
import { parseGitHubMarkdownWithCaching } from '../utils/formatting';
import { useSettings } from '../contexts/SettingsContext';

interface PRDescriptionProps {
  repoName: string;
  prNumber: number;
}

const PRDescription: React.FC<PRDescriptionProps> = ({ repoName, prNumber }) => {
  const { data, isLoading, error } = usePRConversation(repoName, prNumber);
  const { apiTokens } = useSettings();
  const [parsedDescription, setParsedDescription] = useState<string>('');
  const [parsingDescription, setParsingDescription] = useState(false);

  // Parse description when data changes
  useEffect(() => {
    if (data?.description && apiTokens.github) {
      setParsingDescription(true);
      parseGitHubMarkdownWithCaching(data.description, apiTokens.github)
        .then(html => {
          setParsedDescription(html);
          setParsingDescription(false);
        })
        .catch(error => {
          console.error('Error parsing PR description:', error);
          setParsedDescription(data.description.replace(/\n/g, '<br>'));
          setParsingDescription(false);
        });
    } else if (data?.description) {
      // No token, use simple line break replacement
      setParsedDescription(data.description.replace(/\n/g, '<br>'));
    }
  }, [data?.description, apiTokens.github]);

  if (isLoading) {
    return <div className="loading">Loading description...</div>;
  }

  if (error) {
    return <div className="error-state">Failed to load description: {error.message}</div>;
  }

  if (!data) {
    return <div className="error-state">No description available</div>;
  }

  return (
    <div className="scrollable-content description-content">
      {data.description ? (
        parsingDescription ? (
          <div className="loading">Parsing description...</div>
        ) : (
          <div 
            className="markdown-container pr-description"
            dangerouslySetInnerHTML={{ 
              __html: parsedDescription
            }}
          />
        )
      ) : (
        <div className="no-content">No description provided</div>
      )}
    </div>
  );
};

export default PRDescription;
