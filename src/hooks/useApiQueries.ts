import { useQuery } from '@tanstack/react-query';
import { useSettings } from '../contexts/SettingsContext';

// Query keys for different data types
export const queryKeys = {
  mySprintJiras: ['jira', 'sprint-tickets'] as const,
  jiraTicket: (jiraId: string) => ['jira', 'ticket', jiraId] as const,
  myCodeReviews: ['github', 'code-reviews'] as const,
  myPRs: (status: 'open' | 'closed') => ['github', 'my-prs', status] as const,
  prConversation: (repoName: string, prNumber: number) => ['github', 'pr-conversation', repoName, prNumber] as const,
};

// Types for our API responses
interface JiraTicket {
  key: string;
  summary: string;
  description: string;
  status: string;
  priority: string;
  assignee: string;
  reporter: string;
  type: string;
  created: string;
  updated: string;
  sprint?: string;
}

export interface GitHubReviewer {
  username: string;
  state: 'approved' | 'changes_requested' | 'commented' | 'review_requested' | 'dismissed';
  hasComments: boolean;
  date?: string;
  isCurrentUser?: boolean;
  isStale?: boolean;  // For indicating stale approvals like GitHub web UI
}

interface GitHubPR {
  id: number;
  number: number;
  title: string;
  state: string;
  url: string;
  html_url: string;  // Web page URL for GitHub PR
  created_at: string;
  updated_at: string;
  user: {
    login: string;
    avatar_url: string;
  };
  head?: {
    ref: string;
  };
  base?: {
    ref: string;
  };
  // Enhanced data from detailed PR fetch
  reviewers?: GitHubReviewer[];
  repository_url?: string;
}

interface SprintJirasResponse {
  success: boolean;
  tickets: JiraTicket[];
  total: number;
  sprintName?: string;
  jqlQuery: string;
}

interface CodeReviewsResponse {
  success: boolean;
  pullRequests: GitHubPR[];
  total: number;
}

interface MyPRsResponse {
  success: boolean;
  pullRequests: GitHubPR[];
  total: number;
  page?: number;
  perPage?: number;
  hasMore?: boolean;
}

// Legacy interface - kept for backward compatibility but replaced by EnhancedPRConversationResponse
// interface PRConversationResponse {
//   description: string;
//   comments: GitHubComment[];
// }

// API fetch functions
const fetchSprintJiras = async (jiraUsername: string, jiraToken: string): Promise<SprintJirasResponse> => {
  const response = await fetch('http://localhost:3017/api/jira-sprint-tickets', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jiraUsername,
      token: jiraToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch sprint JIRAs: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

const fetchJiraTicket = async (jiraId: string, jiraToken: string) => {
  const response = await fetch('http://localhost:3017/api/jira-ticket', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jiraId,
      token: jiraToken,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch JIRA ticket: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

// Filter PRs to only those where the user is a reviewer (not author)
const filterPRsForReviewerRole = async (prs: GitHubPR[], githubToken: string, githubUsername: string): Promise<GitHubPR[]> => {
  const reviewerPRs: GitHubPR[] = [];
  
  for (const pr of prs) {
    try {
      // Skip if the user is the author
      if (pr.user?.login === githubUsername) {
        continue;
      }
      
      // Get the repository name from the PR URL
      const repoMatch = pr.repository_url?.match(/github\.com\/repos\/([^/]+)\/([^/]+)/);
      if (!repoMatch) {
        console.warn(`Could not extract repo name from: ${pr.repository_url}`);
        continue;
      }
      
      const repoName = `${repoMatch[1]}/${repoMatch[2]}`;
      
      // Fetch PR details and reviews to check if user is a reviewer
      const [prResponse, reviewsResponse] = await Promise.all([
        fetch(`https://api.github.com/repos/${repoName}/pulls/${pr.number}`, {
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        }),
        fetch(`https://api.github.com/repos/${repoName}/pulls/${pr.number}/reviews`, {
          headers: {
            'Authorization': `Bearer ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        })
      ]);
      
      if (!prResponse.ok || !reviewsResponse.ok) {
        console.warn(`Failed to fetch details for PR #${pr.number} in ${repoName}`);
        continue;
      }
      
      const [prDetails, reviews] = await Promise.all([
        prResponse.json(),
        reviewsResponse.json()
      ]);
      
      // Check if user is a requested reviewer or has reviewed
      const isRequestedReviewer = prDetails.requested_reviewers?.some((reviewer: any) => reviewer.login === githubUsername);
      const hasUserReviewed = reviews.some((review: any) => review.user?.login === githubUsername);
      
      // Include PR if user is involved as a reviewer
      if (isRequestedReviewer || hasUserReviewed) {
        reviewerPRs.push(pr);
      }
      
    } catch (error) {
      console.error(`Error checking reviewer role for PR #${pr.number}:`, error);
      // Continue processing other PRs
    }
  }
  
  return reviewerPRs;
};

const fetchMyCodeReviews = async (githubUsername: string, githubToken: string): Promise<CodeReviewsResponse> => {
  console.log(`🔍 fetchMyCodeReviews starting for user: ${githubUsername}`);
  
  // Use broader search to find PRs involving the user, then filter for reviewer role (same as Plain JS version)
  const query = `is:pr is:open involves:${githubUsername}`;
  const response = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100`, {
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('GitHub access denied. Please check your GitHub token permissions or try refreshing the page.');
    } else if (response.status === 401) {
      throw new Error('GitHub authentication failed. Please check your GitHub token in Settings.');
    } else if (response.status === 422) {
      throw new Error('GitHub search query limit reached. Please try again in a few minutes.');
    } else {
      throw new Error(`Unable to load code reviews from GitHub (${response.status}). Please try again later.`);
    }
  }

  const data = await response.json();
  const allPRs = data.items || [];
  
  console.log(`📋 fetchMyCodeReviews found ${allPRs.length} PRs involving user, filtering for reviewer role...`);
  
  // Filter PRs to only those where the user is a reviewer (not author)
  const reviewerPRs = await filterPRsForReviewerRole(allPRs, githubToken, githubUsername);
  
  console.log(`📋 After filtering: ${reviewerPRs.length} PRs where user is a reviewer`);
  
  // Enhance PRs with reviewer data (limit to first 20 for better coverage)
  const enhancedPRs = await enhancePRsWithReviewers(reviewerPRs.slice(0, 20), githubToken, githubUsername);
  
  console.log(`✅ fetchMyCodeReviews completed, returning ${enhancedPRs.length} enhanced PRs`);
  
  return {
    success: true,
    pullRequests: enhancedPRs,
    total: reviewerPRs.length
  };
};

const fetchMyPRs = async (githubUsername: string, githubToken: string, status: 'open' | 'closed', page: number = 1): Promise<MyPRsResponse> => {
  console.log(`🔍 fetchMyPRs starting for user: ${githubUsername}, status: ${status}, page: ${page}`);
  
  const perPage = status === 'closed' ? 10 : 20; // Smaller page size for closed PRs to enable pagination
  
  // GitHub search for user's own PRs
  const query = `is:pr author:${githubUsername} is:${status}`;
  const response = await fetch(`https://api.github.com/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=${perPage}&page=${page}`, {
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  if (!response.ok) {
    if (response.status === 403) {
      throw new Error('GitHub access denied. Please check your GitHub token permissions or try refreshing the page.');
    } else if (response.status === 401) {
      throw new Error('GitHub authentication failed. Please check your GitHub token in Settings.');
    } else if (response.status === 422) {
      throw new Error('GitHub search query limit reached. Please try again in a few minutes.');
    } else {
      throw new Error(`Unable to load PRs from GitHub (${response.status}). Please try again later.`);
    }
  }

  const data = await response.json();
  const basePRs = data.items || [];
  
  console.log(`📋 fetchMyPRs found ${basePRs.length} ${status} PRs (page ${page}), enhancing all...`);
  
  // Enhance PRs with reviewer data (enhance all PRs on the page)
  const enhancedPRs = await enhancePRsWithReviewers(basePRs, githubToken, githubUsername);
  
  console.log(`✅ fetchMyPRs completed, returning ${enhancedPRs.length} enhanced PRs`);
  
  return {
    success: true,
    pullRequests: enhancedPRs,
    total: data.total_count || 0,
    page,
    perPage,
    hasMore: basePRs.length === perPage && (page * perPage) < (data.total_count || 0)
  };
};

// Function to fetch detailed PR information including reviewers and comments
const fetchPRDetails = async (repoUrl: string, prNumber: number, githubToken: string, currentUser: string): Promise<GitHubReviewer[]> => {
  // Extract owner/repo from GitHub API URL
  // URLs are in format: https://api.github.com/repos/owner/repo/issues/123
  const repoMatch = repoUrl.match(/github\.com\/repos\/([^/]+)\/([^/]+)/);
  if (!repoMatch) {
    throw new Error(`Invalid repository URL: ${repoUrl}`);
  }
  
  const [, owner, repo] = repoMatch;
  const repoName = `${owner}/${repo}`;

  const headers = {
    'Authorization': `Bearer ${githubToken}`,
    'Accept': 'application/vnd.github.v3+json'
  };

  // Debug: Log PR processing
  // console.log(`🚀 Starting fetchPRDetails for PR #${prNumber}`);

  try {
    // Fetch reviews, comments, PR details, AND additional reviewer endpoints in parallel
    const [reviewsResponse, commentsResponse, prDetailsResponse, requestedReviewersResponse] = await Promise.all([
      fetch(`https://api.github.com/repos/${repoName}/pulls/${prNumber}/reviews`, { headers }),
      fetch(`https://api.github.com/repos/${repoName}/issues/${prNumber}/comments`, { headers }),
      fetch(`https://api.github.com/repos/${repoName}/pulls/${prNumber}`, { headers }),
      fetch(`https://api.github.com/repos/${repoName}/pulls/${prNumber}/requested_reviewers`, { headers }) // Additional endpoint
    ]);
    
    // Debug: Log API response status
    // console.log(`📞 API Responses for PR #${prNumber}:`, {...});

    if (!reviewsResponse.ok || !commentsResponse.ok || !prDetailsResponse.ok) {
      const errorDetails = {
        reviews: { status: reviewsResponse.status, statusText: reviewsResponse.statusText },
        comments: { status: commentsResponse.status, statusText: commentsResponse.statusText },
        prDetails: { status: prDetailsResponse.status, statusText: prDetailsResponse.statusText },
        requestedReviewers: { status: requestedReviewersResponse.status, statusText: requestedReviewersResponse.statusText }
      };
      console.error(`❌ GitHub API Error for PR #${prNumber}:`, errorDetails);
      throw new Error(`Failed to fetch PR details for #${prNumber}: reviews=${reviewsResponse.status}, comments=${commentsResponse.status}, prDetails=${prDetailsResponse.status}`);
    }

    const [reviews, generalComments, prDetails, requestedReviewersData] = await Promise.all([
      reviewsResponse.json(),
      commentsResponse.json(),
      prDetailsResponse.json(),
      requestedReviewersResponse.ok ? requestedReviewersResponse.json() : { users: [], teams: [] }
    ]);

    // Debug: Basic PR data (simplified logging)
    if (reviews.length === 0 && (prDetails?.requested_reviewers || []).length === 0) {
      console.log(`📊 PR #${prNumber}: No reviews or reviewers found`);
    }

    // Process reviewers (based on processReviewers from old JS app)
    const reviewerMap = new Map<string, GitHubReviewer>();
    const reviewerComments = new Map<string, any[]>();
    
    // First, process requested reviewers from multiple sources
    const requestedReviewers = prDetails?.requested_reviewers || [];
    const additionalRequestedUsers = requestedReviewersData?.users || [];
    
    // Process standard requested reviewers (preserve existing approvals like GitHub web UI)
    requestedReviewers.forEach((reviewer: any) => {
      if (reviewer?.login) {
        const existingReviewer = reviewerMap.get(reviewer.login);
        // Don't overwrite existing approvals/change requests with review requests
        if (!existingReviewer || (existingReviewer.state !== 'approved' && existingReviewer.state !== 'changes_requested')) {
          reviewerMap.set(reviewer.login, {
            username: reviewer.login,
            state: 'review_requested',
            hasComments: false,
            date: undefined,
            isCurrentUser: reviewer.login === currentUser
          });
        }
      }
    });
    
    // Process additional requested users from /requested_reviewers endpoint
    additionalRequestedUsers.forEach((reviewer: any) => {
      if (reviewer?.login && !reviewerMap.has(reviewer.login)) {
        reviewerMap.set(reviewer.login, {
          username: reviewer.login,
          state: 'review_requested',
          hasComments: false,
          date: undefined,
          isCurrentUser: reviewer.login === currentUser
        });
      }
    });
    
    // Log team reviewers for debugging (teams require different handling)
    const additionalRequestedTeams = requestedReviewersData?.teams || [];
    if (additionalRequestedTeams.length > 0) {
      console.log(`🗃️ Found ${additionalRequestedTeams.length} team reviewers:`, additionalRequestedTeams.map((t: any) => t.name || t.slug));
    }

    // Helper function to map GitHub API review states to our interface
    const mapReviewState = (apiState: string): GitHubReviewer['state'] => {
      switch (apiState.toUpperCase()) {
        case 'APPROVED': return 'approved';
        case 'CHANGES_REQUESTED': return 'changes_requested';
        case 'COMMENTED': return 'commented';
        case 'DISMISSED': return 'dismissed';
        case 'PENDING': return 'review_requested'; // Handle pending reviews
        default: 
          console.error(`❌ Unknown review state from GitHub API: '${apiState}' - this may cause reviewer data issues`);
          return 'commented'; // Default fallback
      }
    };

    // Process completed reviews
    reviews.forEach((review: any, index: number) => {
      const reviewer = review.user?.login;
      if (!reviewer) {
        console.warn(`⚠️ Review ${index} missing user.login:`, { reviewId: review.id, user: review.user });
        return;
      }

      const hasCommentBody = review.body && review.body.trim().length > 0;
      const mappedState = mapReviewState(review.state);
      
      // Track review comments for this reviewer
      if (hasCommentBody) {
        if (!reviewerComments.has(reviewer)) {
          reviewerComments.set(reviewer, []);
        }
        reviewerComments.get(reviewer)!.push({
          body: review.body,
          submitted_at: review.submitted_at,
          state: review.state,
          type: 'review'
        });
      }

      // Track reviewer state (GitHub web UI mirroring: preserve important states like approvals)
      const existingReviewer = reviewerMap.get(reviewer);
      const reviewDate = new Date(review.submitted_at);
      
      // Priority order: APPROVED > CHANGES_REQUESTED > others (matches GitHub web behavior)
      const shouldUpdateReviewer = () => {
        if (!existingReviewer) return true;  // First review for this person
        
        // Always preserve APPROVED state (like GitHub web UI)
        if (existingReviewer.state === 'approved' && mappedState !== 'approved') {
          return false;  // Don't overwrite approval with lesser states
        }
        
        // Always preserve CHANGES_REQUESTED state  
        if (existingReviewer.state === 'changes_requested' && mappedState !== 'approved' && mappedState !== 'changes_requested') {
          return false;  // Don't overwrite change requests with comments
        }
        
        // For other states, use latest review
        return !existingReviewer.date || new Date(existingReviewer.date) < reviewDate;
      };
      
      if (shouldUpdateReviewer()) {
        reviewerMap.set(reviewer, {
          username: reviewer,
          state: mappedState,
          hasComments: hasCommentBody,
          date: review.submitted_at,
          isCurrentUser: reviewer === currentUser,
          // Track if this is potentially stale (for future stale indicators)
          isStale: mappedState === 'approved' && existingReviewer?.state === 'approved'
        });
      }
    });

    // Process general PR comments
    generalComments.forEach((comment: any) => {
      const commenter = comment.user?.login;
      if (!commenter) return;

      // Track general comments for this user
      if (!reviewerComments.has(commenter)) {
        reviewerComments.set(commenter, []);
      }
      reviewerComments.get(commenter)!.push({
        body: comment.body,
        submitted_at: comment.created_at,
        state: 'commented',
        type: 'comment'
      });

      // If this user isn't already tracked as a reviewer, add them as a commenter
      if (!reviewerMap.has(commenter)) {
        reviewerMap.set(commenter, {
          username: commenter,
          state: 'commented',
          hasComments: true,
          date: comment.created_at,
          isCurrentUser: commenter === currentUser
        });
      } else {
        // Update hasComments flag for existing reviewers
        const existing = reviewerMap.get(commenter)!;
        existing.hasComments = true;
        reviewerMap.set(commenter, existing);
      }
    });

    // Update hasComments flag for all reviewers who have comments
    reviewerComments.forEach((_, reviewer) => {
      if (reviewerMap.has(reviewer)) {
        const existing = reviewerMap.get(reviewer)!;
        existing.hasComments = true;
        reviewerMap.set(reviewer, existing);
      }
    });

    // Sort reviewers to put current user first
    const sortedReviewers = Array.from(reviewerMap.values()).sort((a, b) => {
      if (currentUser) {
        if (a.isCurrentUser) return -1;
        if (b.isCurrentUser) return 1;
      }
      return a.username.localeCompare(b.username);
    });

    // Final debug summary for troubleshooting missing reviewers
    console.log(`✅ PR #${prNumber} final reviewer summary:`, {
      totalReviewers: sortedReviewers.length,
      reviewers: sortedReviewers.map(r => `${r.username}:${r.state}${r.hasComments ? '(has-comments)' : ''}`),
      rawReviewsFound: reviews.length,
      requestedReviewersFound: (prDetails?.requested_reviewers || []).length
    });
    
    // 🔍 CRITICAL DEBUG: Check if zherman0 data was processed
    const hasZherman0 = sortedReviewers.find(r => r.username === 'zherman0');
    if (!hasZherman0) {
      console.error(`❌ MISSING REVIEWER: zherman0 not found in final reviewer list for PR #${prNumber}`);
      
      // Simplified logging for missing reviewers (investigation complete)
      console.log(`⚠️ Expected reviewer not found in PR #${prNumber} API data. This may be due to:`);
      console.log(`   - Review was dismissed when new commits were pushed`);
      console.log(`   - Reviewer never submitted a review for this PR`);
      console.log(`   - Enterprise GitHub reviewer limitations`);
      
      // Show reviews with missing user.login
      const reviewsWithoutUser = reviews.filter((r: any) => !r.user?.login);
      if (reviewsWithoutUser.length > 0) {
        console.log(`⚠️ Reviews without user.login (${reviewsWithoutUser.length}):`, reviewsWithoutUser.map((r: any) => ({
          id: r.id,
          state: r.state,
          user: r.user,
          submitted_at: r.submitted_at
        })));
      }
    } else {
      console.log(`✅ zherman0 found with state: ${hasZherman0.state}`);
    }
    
    return sortedReviewers;
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Critical Error fetching PR #${prNumber} details:`, {
      error: errorMessage,
      repoUrl,
      prNumber,
      currentUser
    });
    // Instead of returning empty array, return partial data or throw to surface the issue
    throw error; // Let the caller handle the error appropriately
  }
};

// Function to enhance PRs with reviewer data
export const enhancePRsWithReviewers = async (prs: GitHubPR[], githubToken: string, currentUser: string): Promise<GitHubPR[]> => {
  console.log(`🚀 enhancePRsWithReviewers starting with ${prs.length} PRs for user: ${currentUser}`);
  
  if (prs.length === 0) {
    console.log(`⚠️ No PRs to enhance, returning empty array`);
    return [];
  }
  
  const enhanced = await Promise.all(
    prs.map(async (pr, index) => {
      try {
        const url = pr.repository_url || pr.url;
        console.log(`🔄 Processing PR ${index + 1}/${prs.length}: #${pr.number} (${pr.title?.substring(0, 50)}...)`);
        const reviewers = await fetchPRDetails(url, pr.number, githubToken, currentUser);
        console.log(`✅ Enhanced PR #${pr.number} with ${reviewers.length} reviewers`);
        return { ...pr, reviewers };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed to fetch reviewers for PR #${pr.number}:`, {
          error: errorMessage,
          pr: { number: pr.number, title: pr.title?.substring(0, 50), url: pr.repository_url || pr.url }
        });
        // Return PR with empty reviewers but log the issue for debugging
        return { ...pr, reviewers: [], _reviewerFetchError: errorMessage };
      }
    })
  );
  
  console.log(`🎯 enhancePRsWithReviewers completed: ${enhanced.length} PRs enhanced`);
  
  return enhanced;
};

// Enhanced conversation data types for threading support
export interface ConversationThread {
  id: string;
  type: 'review_thread' | 'general_thread';
  path?: string;
  line?: number;
  side?: string;
  comments: any[];
  isResolved?: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  created_at: string;
  updated_at: string;
}

export interface EnhancedPRConversationResponse {
  description: string;
  comments: any[];
  threads: ConversationThread[];
}

const fetchPRConversation = async (repoName: string, prNumber: number, githubToken: string): Promise<EnhancedPRConversationResponse> => {
  console.log(`🔍 fetchPRConversation starting for ${repoName}#${prNumber}`);
  
  const headers = {
    'Authorization': `Bearer ${githubToken}`,
    'Accept': 'application/vnd.github+json', // Updated to v4 API for better threading support
    'User-Agent': 'OCMUI-Team-Dashboard'
  };
  
  try {
    // Fetch ALL comment types: PR details, reviews, general comments, and inline review comments
    const [prResponse, reviewsResponse, commentsResponse, reviewCommentsResponse] = await Promise.all([
      fetch(`https://api.github.com/repos/${repoName}/pulls/${prNumber}`, { headers }),
      fetch(`https://api.github.com/repos/${repoName}/pulls/${prNumber}/reviews`, { headers }),
      fetch(`https://api.github.com/repos/${repoName}/issues/${prNumber}/comments`, { headers }),
      fetch(`https://api.github.com/repos/${repoName}/pulls/${prNumber}/comments`, { headers })
    ]);
    
    if (!prResponse.ok || !reviewsResponse.ok || !commentsResponse.ok || !reviewCommentsResponse.ok) {
      throw new Error(`Failed to fetch PR conversation: ${prResponse.status}/${reviewsResponse.status}/${commentsResponse.status}/${reviewCommentsResponse.status}`);
    }
    
    const prData = await prResponse.json();
    const reviews = await reviewsResponse.json();
    const generalComments = await commentsResponse.json();
    const reviewComments = await reviewCommentsResponse.json();
    
    // Create conversation threads for better organization
    const threads: ConversationThread[] = [];
    
    // 1. Process ONLY review events that have actual comment text (like GitHub does)
    const reviewEvents = reviews
      .filter((review: any) => review.body && review.body.trim()) // Only reviews with content
      .map((review: any) => ({
        ...review,
        comment_type: 'review',
        created_at: review.submitted_at,
        body: `**${review.state.toUpperCase()} Review by @${review.user?.login}**\n\n${review.body}`,
        user: review.user,
        id: `review-${review.id}`,
        has_body: true
      }));
    
    // 2. Process general PR comments (main conversation thread)
    const generalThreadComments = generalComments.map((comment: any) => ({
      ...comment,
      comment_type: 'general',
      body: `**@${comment.user?.login}** commented:\n\n${comment.body}`,
      thread_id: 'main-conversation'
    }));
    
    // 3. Group inline review comments by conversation threads
    const reviewThreads = new Map<string, ConversationThread>();
    
    reviewComments.forEach((comment: any) => {
      // Create thread key based on file path and line - this groups related comments
      const threadKey = comment.in_reply_to_id ? 
        `reply-${comment.in_reply_to_id}` : 
        `${comment.path}:${comment.line || comment.original_line}:${comment.side || 'RIGHT'}`;
      
      if (!reviewThreads.has(threadKey)) {
        reviewThreads.set(threadKey, {
          id: threadKey,
          type: 'review_thread',
          path: comment.path,
          line: comment.line || comment.original_line,
          side: comment.side || 'RIGHT',
          comments: [],
          isResolved: false, // TODO: Add resolved state detection logic
          created_at: comment.created_at,
          updated_at: comment.updated_at
        });
      }
      
      const processedComment = {
        ...comment,
        comment_type: 'inline',
        thread_id: threadKey,
        body: `**@${comment.user?.login}** commented on code:\n\n${comment.body}` + 
              (comment.path ? `\n\n*📄 File: \`${comment.path}\`${comment.line ? ` (Line ${comment.line})` : ''}*` : ''),
        is_reply: !!comment.in_reply_to_id
      };
      
      reviewThreads.get(threadKey)!.comments.push(processedComment);
    });
    
    // Convert review threads to array and sort comments within each thread (most recent first)
    reviewThreads.forEach(thread => {
      thread.comments.sort((a: any, b: any) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA; // Most recent first within each thread
      });
      thread.updated_at = thread.comments[thread.comments.length - 1]?.created_at || thread.created_at;
      threads.push(thread);
    });
    
    // Create main conversation thread for general comments and review events
    const mainConversationComments = [...reviewEvents, ...generalThreadComments];
    if (mainConversationComments.length > 0) {
      // Sort main conversation comments by date (most recent first)
      mainConversationComments.sort((a: any, b: any) => {
        const dateA = new Date(a.created_at || a.submitted_at).getTime();
        const dateB = new Date(b.created_at || b.submitted_at).getTime();
        return dateB - dateA; // Most recent first
      });
      
      threads.push({
        id: 'main-conversation',
        type: 'general_thread',
        comments: mainConversationComments,
        created_at: mainConversationComments[mainConversationComments.length - 1]?.created_at || mainConversationComments[mainConversationComments.length - 1]?.submitted_at,
        updated_at: mainConversationComments[0]?.created_at || mainConversationComments[0]?.submitted_at
      });
    }
    
    // Sort threads by most recent activity (for threaded view)
    threads.sort((a, b) => {
      const dateA = new Date(a.updated_at).getTime();
      const dateB = new Date(b.updated_at).getTime();
      return dateB - dateA; // Most recently active threads first
    });
    
    // Combine all comments for backward compatibility (flat chronological view)
    const allComments = [
      ...reviewEvents,
      ...generalThreadComments,
      ...Array.from(reviewThreads.values()).flatMap(thread => thread.comments)
    ];
    
    // Sort all comments chronologically (most recent first for chronological view)
    allComments.sort((a: any, b: any) => {
      const dateA = new Date(a.created_at || a.submitted_at).getTime();
      const dateB = new Date(b.created_at || b.submitted_at).getTime();
      return dateB - dateA; // Most recent first
    });
    
    console.log(`✅ fetchPRConversation completed for ${repoName}#${prNumber}: ${threads.length} conversation threads, ${allComments.length} total comments`);
    
    return {
      description: prData.body || '',
      comments: allComments,
      threads: threads
    };
    
  } catch (error) {
    console.error(`❌ Error fetching PR conversation for ${repoName}#${prNumber}:`, error);
    throw error;
  }
};

// Custom hooks for each query
export const useMySprintJiras = () => {
  const { apiTokens, isConfigured } = useSettings();

  return useQuery({
    queryKey: queryKeys.mySprintJiras,
    queryFn: () => fetchSprintJiras(apiTokens.jiraUsername, apiTokens.jira),
    enabled: isConfigured && !!apiTokens.jiraUsername && !!apiTokens.jira,
    refetchInterval: 5 * 60 * 1000, // Every 5 minutes
    refetchIntervalInBackground: true, // Continue refreshing when window not focused
    retry: 3, // Retry failed requests
  });
};

export const useJiraTicket = (jiraId: string) => {
  const { apiTokens } = useSettings();

  return useQuery({
    queryKey: queryKeys.jiraTicket(jiraId),
    queryFn: () => fetchJiraTicket(jiraId, apiTokens.jira),
    enabled: !!jiraId && !!apiTokens.jira,
    staleTime: 2 * 60 * 1000, // 2 minutes for individual tickets
    retry: false, // Don't retry failed requests to prevent delayed error messages
  });
};

export const useMyCodeReviews = () => {
  const { apiTokens, isConfigured } = useSettings();
  
  console.log(`🔍 useMyCodeReviews hook called:`, {
    isConfigured,
    hasGithubUsername: !!apiTokens.githubUsername,
    hasGithubToken: !!apiTokens.github,
    githubUsername: apiTokens.githubUsername,
    enabled: isConfigured && !!apiTokens.githubUsername && !!apiTokens.github
  });

  return useQuery({
    queryKey: queryKeys.myCodeReviews,
    queryFn: () => fetchMyCodeReviews(apiTokens.githubUsername, apiTokens.github),
    enabled: isConfigured && !!apiTokens.githubUsername && !!apiTokens.github,
    refetchInterval: 2 * 60 * 1000, // Every 2 minutes
    refetchIntervalInBackground: true, // Continue refreshing when window not focused
    retry: 3, // Retry failed requests
  });
};

export const useMyPRs = (status: 'open' | 'closed' = 'open') => {
  const { apiTokens, isConfigured } = useSettings();
  
  console.log(`🔍 useMyPRs hook called:`, {
    status,
    isConfigured,
    hasGithubUsername: !!apiTokens.githubUsername,
    hasGithubToken: !!apiTokens.github,
    githubUsername: apiTokens.githubUsername,
    enabled: isConfigured && !!apiTokens.githubUsername && !!apiTokens.github
  });

  return useQuery({
    queryKey: queryKeys.myPRs(status),
    queryFn: () => fetchMyPRs(apiTokens.githubUsername, apiTokens.github, status),
    enabled: isConfigured && !!apiTokens.githubUsername && !!apiTokens.github,
    refetchInterval: 4 * 60 * 1000, // Every 4 minutes
    refetchIntervalInBackground: true, // Continue refreshing when window not focused
    retry: 3, // Retry failed requests
  });
};

export const usePRConversation = (repoName: string, prNumber: number) => {
  const { apiTokens } = useSettings();
  
  console.log(`🔍 usePRConversation hook called:`, {
    repoName,
    prNumber,
    hasGithubToken: !!apiTokens.github,
    enabled: !!repoName && !!prNumber && !!apiTokens.github
  });

  return useQuery<EnhancedPRConversationResponse>({
    queryKey: queryKeys.prConversation(repoName, prNumber),
    queryFn: () => fetchPRConversation(repoName, prNumber, apiTokens.github),
    enabled: !!repoName && !!prNumber && !!apiTokens.github,
    staleTime: 2 * 60 * 1000, // 2 minutes for PR conversation data
    refetchInterval: 3 * 60 * 1000, // Auto-refresh every 3 minutes to pick up new comments
    refetchIntervalInBackground: true, // Continue refreshing when window not focused
  });
};

// Helper hook to format last updated timestamp
export const useLastUpdatedFormat = (dataUpdatedAt?: number) => {
  if (!dataUpdatedAt) return 'Never';

  const now = Date.now();
  const diffMs = now - dataUpdatedAt;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);

  if (diffSeconds < 60) return `${diffSeconds}s ago`;
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return new Date(dataUpdatedAt).toLocaleDateString();
};
