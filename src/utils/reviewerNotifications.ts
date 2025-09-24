/**
 * Reviewer Notification System
 * Tracks when user last clicked on reviewer badges to show notification dots for new activity
 */

interface ReviewerTimestamps {
  [username: string]: number;
}

interface NotificationData {
  [prKey: string]: ReviewerTimestamps;
}

const STORAGE_KEY = 'reviewer-last-clicked';
const CLEANUP_DAYS = 30; // Clean up data older than 30 days

/**
 * Generate unique key for PR
 */
export const generatePRKey = (repoName: string, prNumber: number): string => {
  return `${repoName}#${prNumber}`;
};

/**
 * Get all notification data from localStorage
 */
const getNotificationData = (): NotificationData => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn('Failed to parse reviewer notification data:', error);
    return {};
  }
};

/**
 * Save notification data to localStorage
 */
const saveNotificationData = (data: NotificationData): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.warn('Failed to save reviewer notification data:', error);
  }
};

/**
 * Get last clicked timestamp for a specific reviewer on a specific PR
 */
export const getLastClickedTime = (repoName: string, prNumber: number, username: string): number | null => {
  const data = getNotificationData();
  const prKey = generatePRKey(repoName, prNumber);
  return data[prKey]?.[username] || null;
};

/**
 * Update last clicked timestamp for a reviewer
 */
export const updateLastClickedTime = (repoName: string, prNumber: number, username: string): void => {
  const data = getNotificationData();
  const prKey = generatePRKey(repoName, prNumber);
  
  if (!data[prKey]) {
    data[prKey] = {};
  }
  
  data[prKey][username] = Date.now();
  saveNotificationData(data);
};

/**
 * Initialize timestamps for all current reviewers (fresh start approach)
 * This is called when a PR is first viewed to avoid overwhelming notifications
 */
export const initializeReviewerTimestamps = (repoName: string, prNumber: number, reviewers: string[]): void => {
  const data = getNotificationData();
  const prKey = generatePRKey(repoName, prNumber);
  
  // Only initialize if this PR hasn't been seen before
  if (!data[prKey]) {
    const now = Date.now();
    data[prKey] = {};
    
    reviewers.forEach(username => {
      data[prKey][username] = now;
    });
    
    console.log(`🔔 Initialized notification timestamps for ${prKey}:`, {
      reviewers,
      timestamp: new Date(now).toISOString()
    });
    
    saveNotificationData(data);
  } else {
    console.log(`🔔 PR ${prKey} already initialized, skipping timestamp initialization`);
  }
};

/**
 * Get the most recent comment activity timestamp for a reviewer from API data
 * Now considers both creation and edit times
 */
export const getNewestCommentTime = (username: string, allComments: any[]): number => {
  let newestTime = 0;
  
  allComments.forEach(comment => {
    if (comment.user?.login === username) {
      const createdTime = new Date(comment.created_at || comment.submitted_at || 0).getTime();
      const updatedTime = comment.updated_at ? new Date(comment.updated_at).getTime() : createdTime;
      
      // Use the most recent activity time (creation or edit)
      const mostRecentActivity = Math.max(createdTime, updatedTime);
      
      if (mostRecentActivity > newestTime) {
        newestTime = mostRecentActivity;
      }
    }
  });
  
  return newestTime;
};

/**
 * Get notification info including count and age-based urgency
 * Now detects both NEW comments and EDITED comments
 */
export const getNotificationInfo = (repoName: string, prNumber: number, username: string, allComments: any[]) => {
  const lastClickedTime = getLastClickedTime(repoName, prNumber, username);
  const prKey = generatePRKey(repoName, prNumber);
  
  // If never clicked, no notification (fresh start approach)
  if (!lastClickedTime) {
    return { count: 0, urgency: 'none' as const, newestCommentAge: 0 };
  }
  
  // Find new/edited comments and track the newest activity
  let newCommentsCount = 0;
  let newestActivityTime = 0;
  const userComments: any[] = [];
  
  allComments.forEach(comment => {
    if (comment.user?.login === username) {
      const createdTime = new Date(comment.created_at || comment.submitted_at || 0).getTime();
      const updatedTime = comment.updated_at ? new Date(comment.updated_at).getTime() : createdTime;
      
      // Use the most recent activity time (creation or edit)
      const mostRecentActivity = Math.max(createdTime, updatedTime);
      const wasCreatedAfterLastClick = createdTime > lastClickedTime;
      const wasEditedAfterLastClick = updatedTime > lastClickedTime && updatedTime > createdTime;
      
      // Consider it "new" if either created or edited after last click
      const isNew = wasCreatedAfterLastClick || wasEditedAfterLastClick;
      
      userComments.push({
        id: comment.id,
        createdTime,
        updatedTime,
        mostRecentActivity,
        createdTimeString: new Date(createdTime).toISOString(),
        updatedTimeString: comment.updated_at ? new Date(updatedTime).toISOString() : 'not edited',
        wasCreatedAfterLastClick,
        wasEditedAfterLastClick,
        isNew,
        activityType: wasEditedAfterLastClick ? 'edited' : (wasCreatedAfterLastClick ? 'created' : 'old')
      });
      
      if (isNew) {
        newCommentsCount++;
        if (mostRecentActivity > newestActivityTime) {
          newestActivityTime = mostRecentActivity;
        }
      }
    }
  });
  
  // Calculate age-based urgency for the newest unread activity
  let urgency: 'none' | 'normal' | 'warning' | 'urgent' = 'none';
  let newestActivityAge = 0;
  
  if (newCommentsCount > 0 && newestActivityTime > 0) {
    const now = Date.now();
    const ageInMs = now - newestActivityTime;
    const ageInDays = ageInMs / (24 * 60 * 60 * 1000);
    
    newestActivityAge = ageInDays;
    
    if (ageInDays >= 2) {
      urgency = 'urgent'; // Red - 2+ days old
    } else if (ageInDays >= 1) {
      urgency = 'warning'; // Yellow - 1+ days old  
    } else {
      urgency = 'normal'; // White - less than 1 day old
    }
  }
  
  // Enhanced debug logging (only when there are comments to avoid console spam)
  if (userComments.length > 0) {
    const activitySummary = userComments.filter(c => c.isNew).map(c => 
      `${c.activityType}: ${c.activityType === 'edited' ? c.updatedTimeString : c.createdTimeString}`
    );
    
    console.log(`🔔 Enhanced notification check for ${username} on ${prKey}:`, {
      lastClickedTime: lastClickedTime ? new Date(lastClickedTime).toISOString() : 'never',
      userComments,
      newCommentsCount,
      newestActivityAge: newestActivityAge.toFixed(1) + ' days',
      urgency,
      activitySummary,
      totalComments: allComments.length
    });
  }
  
  return { count: newCommentsCount, urgency, newestCommentAge: newestActivityAge };
};

/**
 * Count new comments from a reviewer since last clicked (backward compatibility)
 */
export const getNewCommentsCount = (repoName: string, prNumber: number, username: string, allComments: any[]): number => {
  return getNotificationInfo(repoName, prNumber, username, allComments).count;
};

/**
 * Check if a reviewer has new comments since last clicked (backward compatibility)
 */
export const hasNewComments = (repoName: string, prNumber: number, username: string, allComments: any[]): boolean => {
  return getNewCommentsCount(repoName, prNumber, username, allComments) > 0;
};

/**
 * Clean up old notification data to prevent localStorage bloat
 */
export const cleanupOldNotifications = (): void => {
  const data = getNotificationData();
  const cutoffTime = Date.now() - (CLEANUP_DAYS * 24 * 60 * 60 * 1000);
  let hasChanges = false;
  
  Object.keys(data).forEach(prKey => {
    const prData = data[prKey];
    Object.keys(prData).forEach(username => {
      if (prData[username] < cutoffTime) {
        delete prData[username];
        hasChanges = true;
      }
    });
    
    // Remove empty PR entries
    if (Object.keys(prData).length === 0) {
      delete data[prKey];
      hasChanges = true;
    }
  });
  
  if (hasChanges) {
    saveNotificationData(data);
  }
};

/**
 * Get notification statistics for debugging
 */
export const getNotificationStats = () => {
  const data = getNotificationData();
  const prCount = Object.keys(data).length;
  const totalReviewers = Object.values(data).reduce((sum, prData) => sum + Object.keys(prData).length, 0);
  
  return {
    trackedPRs: prCount,
    totalReviewers: totalReviewers,
    storageSize: JSON.stringify(data).length
  };
};
