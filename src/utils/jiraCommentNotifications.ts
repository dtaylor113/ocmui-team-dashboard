const STORAGE_KEY = 'jira-comments-last-viewed';

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


