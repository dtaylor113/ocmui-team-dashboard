/**
 * Debug utilities for the notification system
 * Run these in browser console to troubleshoot notification issues
 */

// Add debug functions to window for easy console access
declare global {
  interface Window {
    debugNotifications: {
      showAll: () => void;
      clear: () => void;
      clearPR: (repoName: string, prNumber: number) => void;
      showPR: (repoName: string, prNumber: number) => void;
    };
  }
}

export const setupNotificationDebugTools = () => {
  if (typeof window === 'undefined') return;
  
  window.debugNotifications = {
    /**
     * Show all notification data
     */
    showAll: () => {
      const data = localStorage.getItem('reviewer-last-clicked');
      if (data) {
        const parsed = JSON.parse(data);
        console.log('🔔 All notification data:', parsed);
        
        // Show summary
        const prCount = Object.keys(parsed).length;
        const totalReviewers = Object.values(parsed).reduce((sum: number, prData: any) => 
          sum + Object.keys(prData).length, 0);
        
        console.log(`📊 Summary: ${prCount} PRs tracked, ${totalReviewers} total reviewer timestamps`);
      } else {
        console.log('🔔 No notification data found');
      }
    },
    
    /**
     * Clear all notification data
     */
    clear: () => {
      localStorage.removeItem('reviewer-last-clicked');
      console.log('🗑️ Cleared all notification data');
    },
    
    /**
     * Clear notification data for specific PR
     */
    clearPR: (repoName: string, prNumber: number) => {
      const data = localStorage.getItem('reviewer-last-clicked');
      if (data) {
        const parsed = JSON.parse(data);
        const prKey = `${repoName}#${prNumber}`;
        delete parsed[prKey];
        localStorage.setItem('reviewer-last-clicked', JSON.stringify(parsed));
        console.log(`🗑️ Cleared notification data for ${prKey}`);
      }
    },
    
    /**
     * Show notification data for specific PR
     */
    showPR: (repoName: string, prNumber: number) => {
      const data = localStorage.getItem('reviewer-last-clicked');
      if (data) {
        const parsed = JSON.parse(data);
        const prKey = `${repoName}#${prNumber}`;
        
        if (parsed[prKey]) {
          console.log(`🔔 Notification data for ${prKey}:`, parsed[prKey]);
          
          // Convert timestamps to readable dates
          Object.entries(parsed[prKey]).forEach(([username, timestamp]) => {
            console.log(`  ${username}: ${new Date(timestamp as number).toISOString()}`);
          });
        } else {
          console.log(`❌ No notification data found for ${prKey}`);
        }
      } else {
        console.log('🔔 No notification data found');
      }
    }
  };
  
  console.log('🔧 Notification debug tools loaded! Use window.debugNotifications in console:');
  console.log('  - debugNotifications.showAll() - Show all data');
  console.log('  - debugNotifications.clear() - Clear all data'); 
  console.log('  - debugNotifications.showPR("owner/repo", 123) - Show PR data');
  console.log('  - debugNotifications.clearPR("owner/repo", 123) - Clear PR data');
};
