# AI Assistant Onboarding Guide

> **Context**: You are running in a Cursor IDE assisting with the OCMUI Team Dashboard project. This document helps you quickly understand the codebase.

## 📚 Required Reading

Before making changes, please read these files in order:

1. **`README.md`** - Quick start, features, local development setup
2. **`APP_ROADMAP.md`** - Project phases, completed work, future plans, and detailed code entry points
3. **`APP_TECH_NOTES.md`** - Deep technical documentation, architecture, API patterns
4. **`README-openshift.md`** - Deployment guide for OpenShift/ROSA

## 🎯 Project Summary

**What it is**: A React dashboard that unifies GitHub PR management with JIRA ticket tracking for the Red Hat OCMUI (OpenShift Cluster Manager UI) team.

**Key features**:
- View your sprint JIRAs and associated PRs
- View PRs awaiting your code review
- View your own PRs with status badges
- **Quick Find** - Header-based lookup for JIRA tickets or PRs by ID (auto-loads associated items)
- **Reviewer Workload** - Team code review load balancing for uhc-portal (GitHub → Reviewers tab)
- Feature Flags comparison (Unleash staging vs production)
- Doc Links health checker (real-time URL validation from uhc-portal)
- Team Timeboard with timezone support
- Reviewer comment notifications with badges

**Navigation**: Two-level inline grouped tabs
- Primary: JIRA, GitHub, Other (category selectors with underline styling)
- Secondary: Subtabs appear inline when primary is active
- **Quick Find bar** in header between title and tabs
- JIRA tab includes: My Sprint JIRAs, Epics
- GitHub tab includes: My Code Reviews, My PRs, Reviewers
- Other tab includes: Feature Flags, Doc Links

**Live URL**: `https://ocmui-team-dashboard-ocmui-dashboard.apps.rosa.c9a9m7g8h3p4x6t.rz7k.p3.openshiftapps.com`

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      React Frontend                         │
│  (Vite + TypeScript + React Query)                         │
├─────────────────────────────────────────────────────────────┤
│                    Express Server                           │
│  - Serves built React app from /dist                       │
│  - Proxies GitHub API (server-side token)                  │
│  - Proxies JIRA API (server-side token)                    │
│  - Proxies Unleash API (server-side tokens)                │
│  - Team roster CRUD (/api/team/members)                    │
├─────────────────────────────────────────────────────────────┤
│                   OpenShift (ROSA HCP)                      │
│  - Kubernetes Secrets for tokens                           │
│  - PersistentVolumeClaim for team roster                   │
│  - Basic Auth protection                                    │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Key Directories & Files

```
src/
├── components/          # React components
│   ├── App.tsx         # Main app, tab routing, quick find state
│   ├── Header.tsx      # Top navigation header with Quick Find bar
│   ├── QuickFindBar.tsx    # Header Quick Find (JIRA/PR lookup)
│   ├── QuickFindJiraPanel.tsx  # Quick Find results for JIRA lookup
│   ├── QuickFindPRPanel.tsx    # Quick Find results for PR lookup
│   ├── NavigationTabs.tsx  # Two-level inline grouped tabs
│   ├── SplitPanel.tsx  # Left/right panel layout + full-width panels
│   ├── JiraPanel.tsx   # Sprint JIRAs list
│   ├── PRPanel.tsx     # PRs list (reviews or own)
│   ├── JiraCard.tsx    # Individual JIRA card
│   ├── PRCard.tsx      # Individual PR card
│   ├── EpicsPanel.tsx  # Full-width Epics table with filters, "last updated by" info
│   ├── ReviewerWorkloadPanel.tsx  # Team review workload dashboard (uhc-portal)
│   ├── FeatureFlagsPanel.tsx  # Unleash comparison
│   ├── DocLinksPanel.tsx      # Doc Links health checker
│   ├── TimeboardModal.tsx     # Team timezone dashboard
│   ├── SettingsModal.tsx      # Settings + App Security
│   └── FirstRunIdentityModal.tsx  # "Who are you?" flow
├── contexts/
│   ├── SettingsContext.tsx  # Global settings, identity
│   └── QueryProvider.tsx    # React Query setup
├── hooks/
│   └── useApiQueries.ts     # All API calls (GitHub, JIRA, Unleash)
├── styles/
│   └── App.css              # All styles (single file)
├── utils/
│   └── priorityIcons.tsx    # JIRA-style SVG priority icons
└── types/
    └── settings.ts          # TypeScript interfaces

server/
└── index.js            # Express server (ES Modules, GitHub/JIRA/Unleash/DocLinks proxies)

openshift/
├── deployment.yaml     # Kubernetes Deployment
├── service.yaml        # ClusterIP Service
├── route.yaml          # HTTPS Route
├── pvc.yaml           # PersistentVolumeClaim
├── secrets.example.yaml # Template for secrets
└── kustomization.yaml  # Kustomize config

deploy.sh               # Automated build & deploy script
```

## 🔧 Common Development Tasks

### Running Locally

```bash
# Full functionality (with all tokens)
GITHUB_TOKEN=ghp_xxx JIRA_TOKEN=xxx UNLEASH_STAGING_TOKEN=user:xxx UNLEASH_PROD_TOKEN=user:xxx yarn start

# Minimum (no Feature Flags)
GITHUB_TOKEN=ghp_xxx JIRA_TOKEN=xxx yarn start

# Hot reload development
GITHUB_TOKEN=xxx JIRA_TOKEN=xxx yarn start:dev
```

### Building

```bash
yarn build          # Production build to /dist
yarn lint           # ESLint check
```

### Deploying to OpenShift

```bash
./deploy.sh                 # Full build and deploy
./deploy.sh --skip-build    # Just push and restart
```

### Key localStorage Keys

- `ocmui_selected_team_member` - User identity (name, tz, github, jira)
- `ocmui_current_tab` - Last active tab
- `ocmui_user_preferences` - Timezone preferences
- `ocmui_timeboard_members` - Local team roster cache
- `reviewer-last-clicked` - PR reviewer notification timestamps

## 🎨 Styling Conventions

- **Single CSS file**: All styles in `src/styles/App.css`
- **Dark theme**: Background #0a0a0a, cards #1a1a1a, text #e5e7eb
- **Color accents**: Blue #60a5fa (active), Green #34d399 (success), Red #ef4444 (error)
- **Spacing**: 4px base unit, 8px small, 16px medium, 24px large
- **Border radius**: 4px small, 8px medium, 12px large

## 🔐 Security Notes

- **Tokens**: All API tokens stored in OpenShift Secrets, never in code or browser
- **Basic Auth**: Dashboard protected with username/password (also in Secrets)
- **Proxy pattern**: Browser never directly calls GitHub/JIRA APIs
- **Identity**: User identity stored in localStorage only, not transmitted

## 📝 Code Patterns

### Adding a New API Endpoint (Server)

```javascript
// In server/index.js
app.get('/api/my-endpoint', async (req, res) => {
  const TOKEN = process.env.MY_TOKEN;
  if (!TOKEN) {
    return res.status(503).json({ error: 'Token not configured' });
  }
  // ... implementation
});
```

### Adding a New React Query Hook

```typescript
// In src/hooks/useApiQueries.ts
export const useMyData = () => {
  return useQuery({
    queryKey: ['my-data'],
    queryFn: async () => {
      const response = await fetch('/api/my-endpoint');
      if (!response.ok) throw new Error('Failed to fetch');
      return response.json();
    },
    refetchInterval: 5 * 60 * 1000, // 5 minutes
  });
};
```

### Adding a New Tab

1. Add tab type to `TabType` in `App.tsx`
2. Add to appropriate secondary tab group in `secondaryTabConfig` (under jira, github, or other)
3. Optionally add an icon: `{ id: 'my-tab', label: 'My Tab', icon: myIcon }`
4. Create panel component
5. Add rendering case in `SplitPanel.tsx`
6. For full-width panels (like Epics, Reviewers), wrap in `<div className="full-panel">`

**Example**: To add "Sprint Report" under "Other":
```typescript
// In App.tsx secondaryTabConfig
other: [
  { id: 'feature-flags', label: 'Feature Flags', icon: unleashIcon },
  { id: 'doc-links', label: 'Doc Links', icon: chainIcon },  // Existing
  { id: 'sprint-report', label: 'Sprint Report' }  // New tab
]
```

**Recent examples**: `EpicsPanel.tsx` (full-width table under JIRA), `ReviewerWorkloadPanel.tsx` (full-width under GitHub)

## 🚀 Deployment Checklist

Before deploying, verify:

1. [ ] `yarn build` succeeds without errors
2. [ ] Test locally with tokens
3. [ ] Check if secrets need updating (`oc patch secret ...`)
4. [ ] Run `./deploy.sh`
5. [ ] Verify rollout: `oc rollout status deployment/ocmui-team-dashboard`
6. [ ] Test on live URL

## ⚠️ Common Pitfalls

1. **Architecture mismatch**: Build with `--platform linux/amd64` for OpenShift (M1/M2 Macs build ARM by default)
2. **Token not working**: Check if server reads from `process.env` and deployment.yaml injects from secret
3. **CSS not applying**: Check specificity; styles are in a single file with many selectors
4. **localStorage full**: Clear old keys if storage quota errors appear
5. **CORS errors**: All external APIs must go through the server proxy

## 📞 Quick Reference

| Task | Command/Location |
|------|------------------|
| Start locally | `GITHUB_TOKEN=x JIRA_TOKEN=x yarn start` |
| Deploy | `./deploy.sh` |
| View logs | `oc logs -l app=ocmui-team-dashboard -f` |
| SSH into pod | `oc rsh deployment/ocmui-team-dashboard` |
| Update secret | `oc patch secret ocmui-dashboard-tokens -p '{"stringData":{"key":"value"}}'` |
| Check pods | `oc get pods` |
| App URL | See README.md or `oc get route` |

## 🤖 For AI Assistants

When working on this codebase:

1. **Read first, code second** - Always read relevant files before making changes
2. **Build after changes** - Run `yarn build` to catch TypeScript errors
3. **Ask before deploying** - Confirm with user before running `./deploy.sh`
4. **Keep it simple** - Avoid over-engineering; this is a team dashboard, not a product
5. **Dark theme** - All UI should be dark themed
6. **Compact design** - User prefers compact UI; minimize padding and font sizes where sensible

---

*Last updated: February 7, 2026*
