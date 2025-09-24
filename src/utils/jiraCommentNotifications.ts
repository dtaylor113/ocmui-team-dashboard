const STORAGE_KEY = 'jira-comments-last-viewed';
const CLEANUP_DAYS = 30;

interface LastViewedMap {
  [jiraKey: string]: number;
}

const getStore = (): LastViewedMap => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const saveStore = (data: LastViewedMap) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* noop */
  }
};

export const getJiraCommentsLastViewed = (jiraKey: string): number | null => {
  const store = getStore();
  return store[jiraKey] || null;
};

export const updateJiraCommentsLastViewed = (jiraKey: string): void => {
  const store = getStore();
  store[jiraKey] = Date.now();
  saveStore(store);
};

export const countNewJiraCommentsSinceLastViewed = (
  jiraKey: string,
  comments: Array<{ created?: string; updated?: string }>
): number => {
  const lastViewed = getJiraCommentsLastViewed(jiraKey);
  if (!lastViewed) return 0;
  let count = 0;
  for (const c of comments || []) {
    const created = c.created ? new Date(c.created).getTime() : 0;
    const updated = c.updated ? new Date(c.updated).getTime() : created;
    const recent = Math.max(created, updated);
    if (recent > lastViewed) count += 1;
  }
  return count;
};

export const cleanupOldJiraCommentKeys = (): void => {
  const store = getStore();
  const cutoff = Date.now() - CLEANUP_DAYS * 24 * 60 * 60 * 1000;
  let changed = false;
  Object.keys(store).forEach((key) => {
    if (store[key] < cutoff) {
      delete store[key];
      changed = true;
    }
  });
  if (changed) saveStore(store);
};


