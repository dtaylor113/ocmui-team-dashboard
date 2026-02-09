/**
 * Audit Fetch Utility
 * 
 * Wraps the native fetch API to automatically add the X-Team-Member header
 * for access logging and audit trails. This allows the server to track
 * which team members are accessing the dashboard.
 */

// Get current team member identity from localStorage
export const getTeamMemberIdentity = (): string | null => {
  try {
    const stored = localStorage.getItem('ocmui_selected_team_member');
    if (stored) {
      const member = JSON.parse(stored);
      return member.name || null;
    }
  } catch {
    // Ignore parse errors
  }
  return null;
};

// Helper to get audit headers
export const getAuditHeaders = (): Record<string, string> => {
  const teamMember = getTeamMemberIdentity();
  if (teamMember) {
    return { 'X-Team-Member': teamMember };
  }
  return {};
};

/**
 * Wrapper for fetch that adds X-Team-Member header for access logging
 * Use this for all API calls to enable audit trails
 */
export const auditFetch = async (url: string, options: RequestInit = {}): Promise<Response> => {
  const headers = {
    ...options.headers,
    ...getAuditHeaders(),
  };
  return fetch(url, { ...options, headers });
};

/**
 * Call this when user identity is established to log the identification
 * This creates an explicit audit entry when someone logs in / identifies themselves
 */
export const identifyUser = async (teamMemberName: string): Promise<void> => {
  try {
    await fetch('/api/audit/identify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Team-Member': teamMemberName,
      },
      body: JSON.stringify({ teamMember: teamMemberName }),
    });
  } catch (err) {
    // Don't fail silently - log to console but don't throw
    console.warn('Failed to log user identification:', err);
  }
};

export default auditFetch;
