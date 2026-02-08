import React, { useState, useEffect } from 'react';
import { usePRConversation } from '../hooks/useApiQueries';
import { parseGitHubMarkdownWithCaching, formatCommentTimestamp } from '../utils/formatting';
import { useSettings } from '../contexts/SettingsContext';

interface PRConversationProps {
  repoName: string;
  prNumber: number;
  enabled?: boolean; // For lazy loading - only fetch when true
}

const PRConversation: React.FC<PRConversationProps> = ({ repoName, prNumber, enabled = true }) => {
  // Lazy loading: only fetch when enabled (section is expanded)
  const { data, isLoading, error } = usePRConversation(repoName, prNumber, { enabled });
  const { apiTokens, userPreferences } = useSettings();
  const [parsedComments, setParsedComments] = useState<Record<string, string>>({});
  const [parsingComments, setParsingComments] = useState(false);
  const [sortMode, setSortMode] = useState<'github_default' | 'most_recent'>('github_default');

  // Process comments based on sort mode - MUST be called before any early returns (Rules of Hooks)
  const processedComments = React.useMemo(() => {
    if (!data?.comments) return [];
    
    // Filter out bot comments (e.g., jira-linking[bot])
    const filteredComments = data.comments.filter(
      (comment: any) => !comment.user?.login?.includes('[bot]')
    );
    
    if (sortMode === 'github_default') {
      // GitHub Default: Light threading with recency weighting
      // Group inline comments by file/line, sort groups by most recent activity
      const commentGroups = new Map<string, any[]>();
      const standaloneComments: any[] = [];
      
      filteredComments.forEach(comment => {
        if (comment.comment_type === 'inline' && comment.path && comment.line) {
          const groupKey = `${comment.path}:${comment.line}`;
          if (!commentGroups.has(groupKey)) {
            commentGroups.set(groupKey, []);
          }
          commentGroups.get(groupKey)!.push(comment);
        } else {
          standaloneComments.push(comment);
        }
      });
      
      // Sort comments within each group (oldest first)
      commentGroups.forEach(group => {
        group.sort((a, b) => new Date(a.created_at || a.submitted_at).getTime() - new Date(b.created_at || b.submitted_at).getTime());
      });
      
      // Sort standalone comments (oldest first)
      standaloneComments.sort((a, b) => new Date(a.created_at || a.submitted_at).getTime() - new Date(b.created_at || b.submitted_at).getTime());
      
      // Merge groups and standalone comments by most recent activity
      const allItems: any[] = [];
      
      // Add standalone comments as individual items
      standaloneComments.forEach(comment => {
        allItems.push({
          type: 'comment',
          comment,
          lastActivity: new Date(comment.created_at || comment.submitted_at).getTime()
        });
      });
      
      // Add comment groups
      commentGroups.forEach(group => {
        const lastActivity = Math.max(...group.map(c => new Date(c.created_at || c.submitted_at).getTime()));
        allItems.push({
          type: 'group',
          comments: group,
          lastActivity
        });
      });
      
      // Sort all items by last activity (oldest first - GitHub style)
      allItems.sort((a, b) => a.lastActivity - b.lastActivity);
      
      // Flatten back to comment list
      const result: any[] = [];
      allItems.forEach(item => {
        if (item.type === 'comment') {
          result.push(item.comment);
        } else {
          result.push(...item.comments);
        }
      });
      
      return result;
    } else {
      // Most Recent: Simple reverse chronological
      return [...filteredComments].sort((a, b) => {
        const dateA = new Date(a.created_at || a.submitted_at).getTime();
        const dateB = new Date(b.created_at || b.submitted_at).getTime();
        return dateB - dateA; // Most recent first
      });
    }
  }, [data?.comments, sortMode]);

  // Parse comments when data changes
  useEffect(() => {
    if (data?.comments && data.comments.length > 0) {
      setParsingComments(true);
      const parseCommentsAsync = async () => {
        const parsed: Record<string, string> = {};
        
        for (const comment of data.comments) {
          if (comment.body) {
            try {
              const html = await parseGitHubMarkdownWithCaching(comment.body, apiTokens.github);
              parsed[comment.id.toString()] = html;
            } catch (error) {
              console.error(`Error parsing comment ${comment.id}:`, error);
              parsed[comment.id.toString()] = comment.body.replace(/\n/g, '<br>');
            }
          }
        }
        
        setParsedComments(parsed);
        setParsingComments(false);
      };
      
      parseCommentsAsync();
    }
  }, [data?.comments, apiTokens.github]);

  // Early returns AFTER all hooks have been called (Rules of Hooks)
  // Show loading spinner when first expanding (lazy loading)
  if (isLoading) {
    return (
      <div className="loading lazy-loading">
        <span className="loading-spinner"></span>
        Loading conversation...
      </div>
    );
  }

  if (error) {
    return <div className="error-state">Failed to load conversation: {error.message}</div>;
  }

  if (!data) {
    return <div className="error-state">No conversation available</div>;
  }

  return (
    <div className="scrollable-content" style={{ maxHeight: "250px" }}>
      {/* Conversation Controls */}
      <div className="conversation-controls">
        <div className="view-toggle">
          <button 
            className={`toggle-btn ${sortMode === 'github_default' ? 'active' : ''}`}
            onClick={() => setSortMode('github_default')}
            title="GitHub's default conversation sorting (light threading)"
          >
            🐙 GitHub Default ({processedComments.length} comments)
          </button>
          <button 
            className={`toggle-btn ${sortMode === 'most_recent' ? 'active' : ''}`}
            onClick={() => setSortMode('most_recent')}
            title="Simple reverse chronological order (newest first)"
          >
            ⏰ Most Recent ({processedComments.length} comments)
          </button>
        </div>
      </div>

      {/* Content */}
      {processedComments.length > 0 ? (
        parsingComments ? (
          <div className="loading">Parsing comments...</div>
        ) : (
          <div className="comments-list conversation-timeline">
            {processedComments.map((comment, index) => {
              const isInlineGroup = comment.comment_type === 'inline' && 
                                   index > 0 && 
                                   processedComments[index - 1].comment_type === 'inline' &&
                                   processedComments[index - 1].path === comment.path &&
                                   processedComments[index - 1].line === comment.line;
              
              return (
                <div 
                  key={comment.id} 
                  className={`github-comment ${comment.comment_type ? `comment-${comment.comment_type}` : ''} ${isInlineGroup ? 'grouped-inline-comment' : ''}`}
                >
                  <div className="comment-header">
                    <span className="comment-meta">
                      <span className="comment-author">{comment.user?.login || 'Unknown'}</span>
                      {comment.comment_type === 'review' && comment.state && (
                        <span className={`review-state review-state-${comment.state.toLowerCase().replace('_', '-')}`}>
                          {comment.state === 'approved' ? '✅' : 
                           comment.state === 'changes_requested' ? '❌' : 
                           comment.state === 'commented' ? '💬' : '📝'}
                        </span>
                      )}
                      {comment.comment_type === 'inline' && !isInlineGroup && (
                        <span className="inline-comment-indicator">📄</span>
                      )}
                    </span>
                    <span className="comment-date">
                      {formatCommentTimestamp(comment.created_at || comment.submitted_at || '', userPreferences.timezone)}
                    </span>
                  </div>
                  <div 
                    className="markdown-container comment-body"
                    dangerouslySetInnerHTML={{ 
                      __html: parsedComments[comment.id.toString()] || comment.body?.replace(/\n/g, '<br>') || ''
                    }}
                  />
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="no-content">No comments yet</div>
      )}
    </div>
  );
};

export default PRConversation;
