export interface ApiTokens {
  github: string;
  githubUsername: string;
  jira: string;
  jiraUsername: string;
}

export interface UserPreferences {
  timezone: string;
}

export interface AppSettings {
  apiTokens: ApiTokens;
  userPreferences: UserPreferences;
}
