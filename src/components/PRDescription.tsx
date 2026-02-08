import React, { useState, useEffect } from 'react';
import { usePRConversation } from '../hooks/useApiQueries';
import { parseGitHubMarkdownWithCaching } from '../utils/formatting';

interface PRDescriptionProps {
  repoName: string;
  prNumber: number;
  enabled?: boolean; // For lazy loading - only fetch when true
}

const PRDescription: React.FC<PRDescriptionProps> = ({ repoName, prNumber, enabled = true }) => {
  // Lazy loading: only fetch when enabled (section is expanded)
  const { data, isLoading, error } = usePRConversation(repoName, prNumber, { enabled });
  const [parsedDescription, setParsedDescription] = useState<string>('');
  const [parsingDescription, setParsingDescription] = useState(false);

  // Parse description when data changes
  useEffect(() => {
    if (data?.description) {
      setParsingDescription(true);
      // parseGitHubMarkdownWithCaching uses the 'marked' library and doesn't actually need the token
      parseGitHubMarkdownWithCaching(data.description)
        .then(html => {
          setParsedDescription(html);
          setParsingDescription(false);
        })
        .catch(error => {
          console.error('Error parsing PR description:', error);
          setParsedDescription(data.description.replace(/\n/g, '<br>'));
          setParsingDescription(false);
        });
    }
  }, [data?.description]);

  // Show loading spinner when first expanding (lazy loading)
  if (isLoading) {
    return (
      <div className="loading lazy-loading">
        <span className="loading-spinner"></span>
        Loading description...
      </div>
    );
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
