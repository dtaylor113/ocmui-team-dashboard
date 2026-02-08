import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSettings } from '../contexts/SettingsContext';

// Query keys for different data types
export const queryKeys = {
  mySprintJiras: ['jira', 'sprint-tickets'] as const,
  jiraTicket: (jiraId: string) => ['jira', 'ticket', jiraId] as const,
  jiraChildIssues: (parentKey: string) => ['jira', 'child-issues', parentKey] as const,
  epics: (filter: 'in-progress' | 'planning' | 'all' | 'blocked') => ['jira', 'epics', filter] as const,
  myCodeReviews: ['github', 'code-reviews'] as const,
  myPRs: (status: 'open' | 'closed') => ['github', 'my-prs', status] as const,
  prByNumber: (repoName: string, prNumber: number) => ['github', 'pr', repoName, prNumber] as const,
  prConversation: (repoName: string, prNumber: number) => ['github', 'pr-conversation', repoName, prNumber] as const,
  reviewerWorkload: ['github', 'reviewer-workload'] as const,
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
  lastUpdatedBy?: string | null;
  duedate?: string | null;
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
  // Mergeability
  mergeable_state?: string;
  needsRebase?: boolean;
  // Checks/Statuses
  checksState?: 'success' | 'failure' | 'pending' | 'error';
  checksSummary?: string;
  checksTotal?: number;
  checksSucceeded?: number;
  // Pre-fetched data for notification badges (avoids duplicate API calls)
  description?: string;
  comments?: PRCommentForNotification[];
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
  const response = await fetch('/api/jira-sprint-tickets', {
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
  const response = await fetch('/api/jira-ticket', {
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

// Fetch child issues for an epic/feature/parent
const fetchJiraChildIssues = async (parentKey: string, jiraToken: string) => {
  const response = await fetch('/api/jira-child-issues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parentKey, token: jiraToken })
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch child issues: ${response.status} ${response.statusText}`);
  }
  return response.json();
};

// Filter PRs to only those where the user is a reviewer (not author)
// Uses server-side GitHub proxy (no token needed - server provides it)
const filterPRsForReviewerRole = async (prs: GitHubPR[], githubUsername: string): Promise<GitHubPR[]> => {
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
      
      const [, owner, repo] = repoMatch;
      
      // Fetch PR details and reviews via server-side proxy
      const [prResponse, reviewsResponse] = await Promise.all([
        fetch(`/api/github/repos/${owner}/${repo}/pulls/${pr.number}`),
        fetch(`/api/github/repos/${owner}/${repo}/pulls/${pr.number}/reviews`)
      ]);
      
      if (!prResponse.ok || !reviewsResponse.ok) {
        console.warn(`Failed to fetch details for PR #${pr.number} in ${owner}/${repo}`);
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

// Uses server-side GitHub proxy (no token needed - server provides it)
const fetchMyCodeReviews = async (githubUsername: string): Promise<CodeReviewsResponse> => {
  console.log(`🔍 fetchMyCodeReviews starting for user: ${githubUsername}`);
  
  // Use broader search to find PRs involving the user, then filter for reviewer role
  const query = `is:pr is:open involves:${githubUsername}`;
  const response = await fetch(`/api/github/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=100`);

  if (!response.ok) {
    if (response.status === 503) {
      throw new Error('GitHub service not available. Server may not have GitHub token configured.');
    } else if (response.status === 403) {
      throw new Error('GitHub access denied. Please try refreshing the page.');
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
  const reviewerPRs = await filterPRsForReviewerRole(allPRs, githubUsername);
  
  console.log(`📋 After filtering: ${reviewerPRs.length} PRs where user is a reviewer`);
  
  // Enhance PRs with reviewer data (limit to first 20 for better coverage)
  const enhancedPRs = await enhancePRsWithReviewers(reviewerPRs.slice(0, 20), githubUsername);
  
  console.log(`✅ fetchMyCodeReviews completed, returning ${enhancedPRs.length} enhanced PRs`);
  
  return {
    success: true,
    pullRequests: enhancedPRs,
    total: reviewerPRs.length
  };
};

// Uses server-side GitHub proxy (no token needed - server provides it)
const fetchMyPRs = async (githubUsername: string, status: 'open' | 'closed', page: number = 1): Promise<MyPRsResponse> => {
  console.log(`🔍 fetchMyPRs starting for user: ${githubUsername}, status: ${status}, page: ${page}`);
  
  const perPage = status === 'closed' ? 10 : 20; // Smaller page size for closed PRs to enable pagination
  
  // GitHub search for user's own PRs via server proxy
  const query = `is:pr author:${githubUsername} is:${status}`;
  const response = await fetch(`/api/github/search/issues?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=${perPage}&page=${page}`);

  if (!response.ok) {
    if (response.status === 503) {
      throw new Error('GitHub service not available. Server may not have GitHub token configured.');
    } else if (response.status === 403) {
      throw new Error('GitHub access denied. Please try refreshing the page.');
    } else if (response.status === 422) {
      throw new Error('GitHub search query limit reached. Please try again in a few minutes.');
    } else {
      throw new Error(`Unable to load PRs from GitHub (${response.status}). Please try again later.`);
    }
  }

  const data = await response.json();
  const basePRs = data.items || [];
  
  console.log(`📋 fetchMyPRs found ${basePRs.length} ${status} PRs (page ${page}), enhancing all...`);
  
  // Enhance PRs with reviewer data
  const enhancedPRs = await enhancePRsWithReviewers(basePRs, githubUsername);
  
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

// Comment structure for notification badges (lightweight version)
export interface PRCommentForNotification {
  id: string | number;
  user: { login: string };
  created_at?: string;
  submitted_at?: string;
  updated_at?: string;
  body?: string;
}

// Function to fetch detailed PR information including reviewers and comments
// Returns reviewers plus mergeability and checks info to support UI badges
// Also returns comments array for notification badges (eliminates need for separate usePRConversation call)
// Uses server-side GitHub proxy (no token needed - server provides it)
const fetchPRDetails = async (
  repoUrl: string,
  prNumber: number,
  currentUser: string
): Promise<{
  reviewers: GitHubReviewer[];
  mergeable_state?: string;
  needsRebase: boolean;
  checksState?: 'success' | 'failure' | 'pending' | 'error';
  checksSummary?: string;
  checksTotal?: number;
  checksSucceeded?: number;
  // New fields for eliminating duplicate API calls
  description?: string;
  comments: PRCommentForNotification[];
}> => {
  // Extract owner/repo from GitHub API URL
  // URLs are in format: https://api.github.com/repos/owner/repo/issues/123
  const repoMatch = repoUrl.match(/github\.com\/repos\/([^/]+)\/([^/]+)/);
  if (!repoMatch) {
    throw new Error(`Invalid repository URL: ${repoUrl}`);
  }
  
  const [, owner, repo] = repoMatch;

  // Debug: Log PR processing
  // console.log(`🚀 Starting fetchPRDetails for PR #${prNumber}`);

  try {
    // Fetch via server-side proxy endpoints
    const reviewsUrl = `/api/github/repos/${owner}/${repo}/pulls/${prNumber}/reviews?per_page=100`;
    const issueCommentsUrl = `/api/github/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`;
    const prDetailsUrl = `/api/github/repos/${owner}/${repo}/pulls/${prNumber}`;
    const requestedReviewersUrl = `/api/github/repos/${owner}/${repo}/pulls/${prNumber}/requested_reviewers`;

    // Fetch ALL review events and issue comments, and fetch PR details/requested reviewers in parallel
    const [reviewsResp, commentsResp, prDetailsResp, requestedReviewersResp] = await Promise.all([
      fetch(reviewsUrl),
      fetch(issueCommentsUrl),
      fetch(prDetailsUrl),
      fetch(requestedReviewersUrl)
    ]);
    
    if (!prDetailsResp.ok) {
      throw new Error(`Failed to fetch PR details: ${prDetailsResp.status} ${prDetailsResp.statusText}`);
    }
    
    const reviews = reviewsResp.ok ? await reviewsResp.json() : [];
    const generalComments = commentsResp.ok ? await commentsResp.json() : [];
    const prDetails = await prDetailsResp.json();
    const requestedReviewersData = requestedReviewersResp.ok ? await requestedReviewersResp.json() : { users: [], teams: [] };

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

    // FINAL STATE NORMALIZATION: Reflect most recent status based on current requested reviewers
    // If a reviewer is currently requested, that represents the latest state in GitHub UI,
    // even if they previously approved or requested changes. Override to 'review_requested'.
    try {
      const currentlyRequestedUsers: string[] = [
        ...(Array.isArray(prDetails?.requested_reviewers) ? prDetails.requested_reviewers.map((u: any) => u?.login).filter(Boolean) : []),
        ...(Array.isArray(requestedReviewersData?.users) ? requestedReviewersData.users.map((u: any) => u?.login).filter(Boolean) : [])
      ];
      const requestedSet = new Set(currentlyRequestedUsers);

      requestedSet.forEach((login) => {
        if (!login) return;
        const existing = reviewerMap.get(login);
        if (existing) {
          reviewerMap.set(login, {
            ...existing,
            state: 'review_requested',
            // Preserve existing hasComments and date; reflect current-user flag
            isCurrentUser: login === currentUser
          });
        } else {
          reviewerMap.set(login, {
            username: login,
            state: 'review_requested',
            hasComments: false,
            date: undefined,
            isCurrentUser: login === currentUser
          });
        }
      });
    } catch (e) {
      console.warn('⚠️ Failed to normalize requested reviewers state:', e);
    }

    // Sort reviewers to put current user first
    const sortedReviewers = Array.from(reviewerMap.values()).sort((a, b) => {
      if (currentUser) {
        if (a.isCurrentUser) return -1;
        if (b.isCurrentUser) return 1;
      }
      return a.username.localeCompare(b.username);
    });

    // Final debug summary (muted): available for opt-in debugging if needed
    // console.debug(`PR #${prNumber} reviewers:`, sortedReviewers.map(r => `${r.username}:${r.state}`));
    
    let mergeableState: string | undefined = prDetails?.mergeable_state;
    // Consider both 'behind' (out-of-date) and 'dirty' (merge conflicts) as requiring rebase/update
    let needsRebase: boolean = mergeableState === 'behind' || mergeableState === 'dirty';
    // Fallback: if state is unknown, use compare endpoint to detect behind-by commits
    // Note: Compare endpoint not currently proxied - using mergeable_state only for now
    // TODO: Add compare endpoint to server proxy if needed

    // Fetch combined status for checks (using head commit SHA) via server proxy
    let checksState: 'success' | 'failure' | 'pending' | 'error' | undefined;
    let checksSummary: string | undefined;
    let checksTotal: number | undefined;
    let checksSucceeded: number | undefined;
    try {
      const headSha: string | undefined = prDetails?.head?.sha;
      if (headSha) {
        const statusUrl = `/api/github/repos/${owner}/${repo}/commits/${headSha}/status`;
        const statusResp = await fetch(statusUrl);
        if (statusResp.ok) {
          const statusData = await statusResp.json();
          const state = String(statusData?.state || '').toLowerCase();
          checksState = (state as any);
          const statuses: any[] = Array.isArray(statusData?.statuses) ? statusData.statuses : [];
          const total = statuses.length;
          const succeeded = statuses.filter((s: any) => String(s?.state || '').toLowerCase() === 'success').length;
          const failingStatuses = statuses.filter((s: any) => ['failure', 'error'].includes(String(s?.state || '').toLowerCase()));
          const failing = failingStatuses.length;
          const pendingStatuses = statuses.filter((s: any) => String(s?.state || '').toLowerCase() === 'pending');
          const pending = pendingStatuses.length;
          checksTotal = total;
          checksSucceeded = succeeded;
          if (state === 'success') {
            checksSummary = `All checks have passed${total ? ` (${total} successful checks)` : ''}`;
          } else if (state === 'pending') {
            const pendingNames = pendingStatuses.map((s: any) => s?.context).filter(Boolean);
            checksSummary = `Checks pending${total ? ` (${pending} pending of ${total}${pendingNames.length ? `: ${pendingNames.slice(0,3).join(', ')}${pendingNames.length>3 ? '…' : ''}` : ''})` : ''}`;
          } else if (state === 'failure' || state === 'error') {
            const failingNames = failingStatuses.map((s: any) => s?.context).filter(Boolean);
            checksSummary = `Checks failed${total ? ` (${failing} failing of ${total}${failingNames.length ? `: ${failingNames.slice(0,3).join(', ')}${failingNames.length>3 ? '…' : ''}` : ''})` : ''}`;
          } else if (total) {
            checksSummary = `Checks status: ${state} (${succeeded}/${total} passed)`;
          }
        }
      }
    } catch {
      // ignore checks failures
    }

    // Build unified comments array for notification badges
    // This includes review comments (with body) and general issue comments
    const unifiedComments: PRCommentForNotification[] = [];
    
    // Add reviews that have comment bodies
    reviews.forEach((review: any) => {
      if (review.body && review.body.trim() && review.user?.login) {
        unifiedComments.push({
          id: `review-${review.id}`,
          user: { login: review.user.login },
          created_at: review.submitted_at,
          submitted_at: review.submitted_at,
          updated_at: review.submitted_at, // Reviews don't have separate updated_at
          body: review.body
        });
      }
    });
    
    // Add general issue comments
    generalComments.forEach((comment: any) => {
      if (comment.user?.login) {
        unifiedComments.push({
          id: comment.id,
          user: { login: comment.user.login },
          created_at: comment.created_at,
          updated_at: comment.updated_at,
          body: comment.body
        });
      }
    });

    return {
      reviewers: sortedReviewers,
      mergeable_state: mergeableState,
      needsRebase,
      checksState,
      checksSummary,
      checksTotal,
      checksSucceeded,
      // New fields for eliminating duplicate API calls
      description: prDetails?.body || '',
      comments: unifiedComments
    };
    
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

// Function to enhance PRs with reviewer data and pre-fetch comments for notification badges
// Uses server-side GitHub proxy (no token needed - server provides it)
export const enhancePRsWithReviewers = async (prs: GitHubPR[], currentUser: string): Promise<GitHubPR[]> => {
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
        const details = await fetchPRDetails(url, pr.number, currentUser);
        console.log(`✅ Enhanced PR #${pr.number} with ${details.reviewers.length} reviewers, ${details.comments.length} comments (mergeable_state=${details.mergeable_state || 'unknown'}, checks=${details.checksState || 'n/a'})`);
        return {
          ...pr,
          reviewers: details.reviewers,
          mergeable_state: details.mergeable_state,
          needsRebase: details.needsRebase,
          checksState: details.checksState,
          checksSummary: details.checksSummary,
          checksTotal: details.checksTotal,
          checksSucceeded: details.checksSucceeded,
          // Pre-fetched data for notification badges (eliminates duplicate API calls)
          description: details.description,
          comments: details.comments
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`❌ Failed to fetch reviewers for PR #${pr.number}:`, {
          error: errorMessage,
          pr: { number: pr.number, title: pr.title?.substring(0, 50), url: pr.repository_url || pr.url }
        });
        // Return PR with empty reviewers but log the issue for debugging
        return { ...pr, reviewers: [], comments: [], _reviewerFetchError: errorMessage } as unknown as GitHubPR;
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

// Uses server-side GitHub proxy (no token needed - server provides it)
const fetchPRConversation = async (repoName: string, prNumber: number): Promise<EnhancedPRConversationResponse> => {
  console.log(`🔍 fetchPRConversation starting for ${repoName}#${prNumber}`);
  
  try {
    // Fetch ALL comment types via server proxy: PR details, reviews, general comments, and inline review comments
    const [owner, repo] = repoName.split('/');
    const [prResponse, reviewsResponse, commentsResponse, reviewCommentsResponse] = await Promise.all([
      fetch(`/api/github/repos/${owner}/${repo}/pulls/${prNumber}`),
      fetch(`/api/github/repos/${owner}/${repo}/pulls/${prNumber}/reviews`),
      fetch(`/api/github/repos/${owner}/${repo}/issues/${prNumber}/comments`),
      fetch(`/api/github/repos/${owner}/${repo}/pulls/${prNumber}/comments`) // Inline review comments
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
    queryFn: () => fetchSprintJiras(apiTokens.jiraUsername, ''), // Server provides token
    enabled: isConfigured && !!apiTokens.jiraUsername, // No user token needed
    refetchInterval: 5 * 60 * 1000, // Every 5 minutes
    refetchIntervalInBackground: true, // Continue refreshing when window not focused
    retry: 3, // Retry failed requests
  });
};

export const useJiraTicket = (jiraId: string) => {
  // No user token needed - server provides token
  return useQuery({
    queryKey: queryKeys.jiraTicket(jiraId),
    queryFn: () => fetchJiraTicket(jiraId, ''),
    enabled: !!jiraId,
    staleTime: 2 * 60 * 1000, // 2 minutes for individual tickets
    retry: false, // Don't retry failed requests to prevent delayed error messages
  });
};

export const useJiraChildIssues = (parentKey: string) => {
  // No user token needed - server provides token
  return useQuery({
    queryKey: queryKeys.jiraChildIssues(parentKey),
    queryFn: () => fetchJiraChildIssues(parentKey, ''),
    enabled: !!parentKey,
    staleTime: 2 * 60 * 1000,
    retry: 1
  });
};

export const useMyCodeReviews = () => {
  const { apiTokens, isConfigured } = useSettings();
  
  console.log(`🔍 useMyCodeReviews hook called:`, {
    isConfigured,
    hasGithubUsername: !!apiTokens.githubUsername,
    githubUsername: apiTokens.githubUsername,
    enabled: isConfigured && !!apiTokens.githubUsername
  });

  return useQuery({
    queryKey: queryKeys.myCodeReviews,
    queryFn: () => fetchMyCodeReviews(apiTokens.githubUsername),
    enabled: isConfigured && !!apiTokens.githubUsername, // No token needed - server provides it
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
    githubUsername: apiTokens.githubUsername,
    enabled: isConfigured && !!apiTokens.githubUsername
  });

  return useQuery({
    queryKey: queryKeys.myPRs(status),
    queryFn: () => fetchMyPRs(apiTokens.githubUsername, status),
    enabled: isConfigured && !!apiTokens.githubUsername, // No token needed - server provides it
    refetchInterval: 4 * 60 * 1000, // Every 4 minutes
    refetchIntervalInBackground: true, // Continue refreshing when window not focused
    retry: 3, // Retry failed requests
  });
};

export const usePRConversation = (repoName: string, prNumber: number, options?: { enabled?: boolean }) => {
  // Default enabled to true for backward compatibility, but allow explicit disable for lazy loading
  const isEnabled = options?.enabled !== false && !!repoName && !!prNumber;
  
  console.log(`🔍 usePRConversation hook called:`, {
    repoName,
    prNumber,
    enabled: isEnabled,
    lazyLoading: options?.enabled === false ? 'waiting for expansion' : 'immediate'
  });

  return useQuery<EnhancedPRConversationResponse>({
    queryKey: queryKeys.prConversation(repoName, prNumber),
    queryFn: () => fetchPRConversation(repoName, prNumber),
    enabled: isEnabled,
    staleTime: 2 * 60 * 1000, // 2 minutes for PR conversation data
    refetchInterval: isEnabled ? 3 * 60 * 1000 : false, // Only auto-refresh when enabled
    refetchIntervalInBackground: true, // Continue refreshing when window not focused
  });
};

// Epics types
interface Epic {
  key: string;
  summary: string;
  status: string;
  priority: string;
  assignee: string;
  targetEnd: string | null;
  updated: string | null;
  lastUpdatedBy: string | null;
  resolutionDate: string | null;
  resolution: string | null;
  marketingImpactNotes: string | null;
  blockedReason: string | null;
  parentKey: string | null;
  featureKey: string | null;
}

interface EpicsResponse {
  success: boolean;
  epics: Epic[];
  total: number;
  filter: string;
  jqlQuery: string;
}

// Fetch epics from JIRA
const fetchEpics = async (filter: 'in-progress' | 'planning' | 'all' | 'blocked'): Promise<EpicsResponse> => {
  const response = await fetch('/api/jira-epics', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ filter }),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch epics: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

// Hook to fetch epics with filter
export const useEpics = (filter: 'in-progress' | 'planning' | 'all' | 'blocked' = 'in-progress') => {
  return useQuery({
    queryKey: queryKeys.epics(filter),
    queryFn: () => fetchEpics(filter),
    refetchInterval: 5 * 60 * 1000, // Every 5 minutes
    refetchIntervalInBackground: true,
    retry: 3,
  });
};

// Helper hook to format last updated timestamp
export const useLastUpdatedFormat = (dataUpdatedAt?: number) => {
  const [, setTick] = useState(0);
  
  // Update every 10 seconds so the timestamp increments
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 10000); // 10 seconds
    
    return () => clearInterval(interval);
  }, []);
  
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

// Update JIRA field mutation
interface UpdateJiraFieldParams {
  issueKey: string;
  fieldId: string;
  value: string | null;
}

const updateJiraField = async ({ issueKey, fieldId, value }: UpdateJiraFieldParams): Promise<{ success: boolean }> => {
  const response = await fetch('/api/jira-update-field', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ issueKey, fieldId, value }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || error.error || 'Failed to update field');
  }

  return response.json();
};

export const useUpdateJiraField = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: updateJiraField,
    onSuccess: () => {
      // Invalidate epics queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['jira', 'epics'] });
    },
  });
};

// ============================================================================
// REVIEWER WORKLOAD TYPES AND HOOKS
// ============================================================================

export interface ReviewerWorkloadMember {
  name: string;
  github: string;
  pending: number;
  changesRequested: number;
  commented: number;
  approved: number;
  total: number;
  error?: string;
}

interface ReviewerWorkloadResponse {
  success: boolean;
  members: ReviewerWorkloadMember[];
  timestamp: string;
  message?: string;
}

// Fetch reviewer workload from server
const fetchReviewerWorkload = async (): Promise<ReviewerWorkloadResponse> => {
  const response = await fetch('/api/github/reviewer-workload');

  if (!response.ok) {
    if (response.status === 503) {
      throw new Error('GitHub service not available. Server may not have GitHub token configured.');
    }
    throw new Error(`Failed to fetch reviewer workload: ${response.status}`);
  }

  return response.json();
};

// Hook to fetch reviewer workload for all team members
export const useReviewerWorkload = () => {
  return useQuery({
    queryKey: queryKeys.reviewerWorkload,
    queryFn: fetchReviewerWorkload,
    refetchInterval: 5 * 60 * 1000, // Every 5 minutes (this endpoint is expensive)
    refetchIntervalInBackground: false, // Don't refresh in background due to API cost
    staleTime: 3 * 60 * 1000, // Consider data stale after 3 minutes
    retry: 2,
  });
};

// ============================================================================
// PR BY NUMBER (for Quick Find feature)
// ============================================================================

// Fetch a specific PR by number from uhc-portal repo
const fetchPRByNumber = async (prNumber: number, currentUser: string): Promise<any> => {
  const owner = 'RedHatInsights';
  const repo = 'uhc-portal';
  
  // Fetch the PR details
  const prResponse = await fetch(`/api/github/repos/${owner}/${repo}/pulls/${prNumber}`);
  
  if (!prResponse.ok) {
    if (prResponse.status === 404) {
      throw new Error(`PR #${prNumber} not found in ${owner}/${repo}`);
    }
    throw new Error(`Failed to fetch PR #${prNumber}: ${prResponse.status}`);
  }
  
  const prData = await prResponse.json();
  
  // Enhance with reviewer data using the existing helper
  const enhanced = await enhancePRsWithReviewers([prData], currentUser);
  
  return enhanced[0];
};

// Hook to fetch a specific PR by number
export const usePRByNumber = (prNumber: number | null) => {
  const { apiTokens } = useSettings();
  
  return useQuery({
    queryKey: queryKeys.prByNumber('RedHatInsights/uhc-portal', prNumber || 0),
    queryFn: () => fetchPRByNumber(prNumber!, apiTokens.githubUsername),
    enabled: !!prNumber && prNumber > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: false, // Don't retry on 404
  });
};
