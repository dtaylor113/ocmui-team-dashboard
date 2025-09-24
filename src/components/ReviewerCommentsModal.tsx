import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSettings } from '../contexts/SettingsContext';
import { parseGitHubMarkdownWithCaching } from '../utils/formatting';

interface ReviewerComment {
  body: string;
  submitted_at: string;
  state: string;
  type: 'review' | 'comment';
}

interface ReviewerCommentsModalProps {
  reviewer: string;
  repoName: string;
  prNumber: number;
  isOpen: boolean;
  onClose: () => void;
}

const ReviewerCommentsModal: React.FC<ReviewerCommentsModalProps> = ({
  reviewer,
  repoName,
  prNumber,
  isOpen,
  onClose
}) => {
  const [comments, setComments] = useState<ReviewerComment[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedComments, setParsedComments] = useState<Record<string, string>>({});
  const [parsingComments, setParsingComments] = useState(false);
  const { apiTokens } = useSettings();

  useEffect(() => {
    if (!isOpen || !reviewer || !repoName || !prNumber) return;

    const fetchComments = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const headers = {
          'Authorization': `Bearer ${apiTokens.github}`,
          'Accept': 'application/vnd.github.v3+json'
        };

        // Fetch reviews, general comments, and inline review comments in parallel
        const [reviewsResponse, commentsResponse, reviewCommentsResponse] = await Promise.all([
          fetch(`https://api.github.com/repos/${repoName}/pulls/${prNumber}/reviews`, { headers }),
          fetch(`https://api.github.com/repos/${repoName}/issues/${prNumber}/comments`, { headers }),
          fetch(`https://api.github.com/repos/${repoName}/pulls/${prNumber}/comments`, { headers }) // Inline review comments
        ]);

        if (!reviewsResponse.ok || !commentsResponse.ok || !reviewCommentsResponse.ok) {
          throw new Error(`GitHub API error: reviews=${reviewsResponse.status}, comments=${commentsResponse.status}, reviewComments=${reviewCommentsResponse.status}`);
        }

        const [reviews, generalComments, reviewComments] = await Promise.all([
          reviewsResponse.json(),
          commentsResponse.json(),
          reviewCommentsResponse.json()
        ]);

        // Combine review comments and general comments for this reviewer
        const allComments: ReviewerComment[] = [];

        // Add review comments
        reviews
          .filter((review: any) => review.user?.login === reviewer && review.body && review.body.trim())
          .forEach((review: any) => {
            allComments.push({
              body: review.body,
              submitted_at: review.submitted_at,
              state: review.state,
              type: 'review'
            });
          });

        // Add general PR comments  
        generalComments
          .filter((comment: any) => comment.user?.login === reviewer && comment.body && comment.body.trim())
          .forEach((comment: any) => {
            allComments.push({
              body: comment.body,
              submitted_at: comment.created_at,
              state: 'commented', // General comments don't have review states
              type: 'comment'
            });
          });

        // Add inline review comments (threaded comments on specific code lines)
        reviewComments
          .filter((comment: any) => comment.user?.login === reviewer && comment.body && comment.body.trim())
          .forEach((comment: any) => {
            // Add context about which file/line this comment is on
            const contextInfo = comment.path ? ` (${comment.path}:${comment.line || comment.original_line})` : '';
            allComments.push({
              body: comment.body + (contextInfo ? `\n\n*On file: \`${comment.path}\`*` : ''),
              submitted_at: comment.created_at,
              state: 'inline_comment', // Mark as inline review comment
              type: 'comment'
            });
          });

        // Sort by date (newest first)
        allComments.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

        setComments(allComments);
        
      } catch (err) {
        console.error('Error fetching reviewer comments:', err);
        setError(err instanceof Error ? err.message : 'Failed to load comments');
      } finally {
        setIsLoading(false);
      }
    };

    fetchComments();
  }, [isOpen, reviewer, repoName, prNumber, apiTokens.github]);

  // Parse comments after they're fetched
  useEffect(() => {
    if (comments.length > 0 && apiTokens.github) {
      setParsingComments(true);
      const parseCommentsAsync = async () => {
        const parsed: Record<string, string> = {};
        
        for (let i = 0; i < comments.length; i++) {
          const comment = comments[i];
          if (comment.body) {
            try {
              const html = await parseGitHubMarkdownWithCaching(comment.body, apiTokens.github);
              parsed[i.toString()] = html;
            } catch (error) {
              console.error(`Error parsing reviewer comment ${i}:`, error);
              parsed[i.toString()] = comment.body.replace(/\n/g, '<br>');
            }
          }
        }
        
        setParsedComments(parsed);
        setParsingComments(false);
      };
      
      parseCommentsAsync();
    } else if (comments.length > 0) {
      // No token, use simple line break replacement
      const parsed: Record<string, string> = {};
      comments.forEach((comment, i) => {
        parsed[i.toString()] = comment.body?.replace(/\n/g, '<br>') || '';
      });
      setParsedComments(parsed);
    }
  }, [comments, apiTokens.github]);

  const getReviewerStateIcon = (state: string): string => {
    const stateIcons: Record<string, string> = {
      'approved': '✅',
      'changes_requested': '❌',
      'commented': '💬',
      'inline_comment': '📝',
      'review_requested': '?',
      'dismissed': '⏸️'
    };
    return stateIcons[state] || '💬';
  };

  const getReviewerStateText = (state: string): string => {
    const stateTexts: Record<string, string> = {
      'approved': 'Approved',
      'changes_requested': 'Changes Requested',
      'commented': 'Comment',
      'inline_comment': 'Code Review Comment',
      'review_requested': 'Review Requested',
      'dismissed': 'Dismissed'
    };
    return stateTexts[state] || 'Comment';
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  };

  // GitHub markdown parsing is now handled asynchronously with state management

  if (!isOpen) return null;

  return createPortal(
    <div className="reviewer-comments-modal">
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal-content reviewer-comments-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h3>Comments by {reviewer}</h3>
            <button className="modal-close" onClick={onClose}>&times;</button>
          </div>
          
          <div className="modal-body">
            {isLoading ? (
              <div className="loading">Loading comments...</div>
            ) : error ? (
              <div className="error">Failed to load comments: {error}</div>
            ) : comments.length === 0 ? (
              <div className="no-comments">No comments found for {reviewer}</div>
            ) : parsingComments ? (
              <div className="loading">Parsing comments...</div>
            ) : (
              <div className="comments-list">
                {comments.map((comment, index) => (
                  <div key={index} className="reviewer-comment">
                    <div className="comment-header">
                      <span className="comment-meta">
                        {getReviewerStateIcon(comment.state)} {getReviewerStateText(comment.state)} • {formatDate(comment.submitted_at)}
                      </span>
                    </div>
                    <div 
                      className="comment-body"
                      dangerouslySetInnerHTML={{ 
                        __html: parsedComments[index.toString()] || comment.body?.replace(/\n/g, '<br>') || ''
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ReviewerCommentsModal;
