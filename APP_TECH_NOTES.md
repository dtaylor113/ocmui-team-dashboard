# 🎯 OCMUI Team Dashboard

> Modern React application that unifies GitHub PR management with JIRA ticket tracking to streamline developer workflows for the Red Hat OCMUI team.

## 📋 Project Summary

- **GitHub Integration**: Track PRs, code reviews, and repository activity
- **JIRA Integration**: Manage sprint tickets, view descriptions, comments with advanced markdown rendering
- **Unified Dashboard**: Single interface combining both platforms with auto-associations
- **Developer Productivity**: Reduce context switching between GitHub and JIRA

---

## 🏗️ Application Architecture

### Repository Structure (Standalone)

```
ocmui-team-dashboard/
├── src/                      # React application source (Vite + TypeScript)
│   ├── components/           # UI components
│   ├── contexts/             # React Context (settings, auth)
│   ├── hooks/                # Custom hooks (API integration)
│   ├── styles/               # Styles (dark theme)
│   ├── types/                # TypeScript definitions
│   └── utils/                # Utilities (formatting, notifications)
├── public/                   # Static assets served by Vite
├── server/                   # Express API server (ES Modules)
│   └── index.js              # JIRA proxy endpoints, serves dist/
├── dist/                     # Production build output (generated)
├── images/                   # App images used by documentation/UI
├── package.json              # Dependencies and scripts (Yarn)
├── vite.config.ts            # Vite configuration
├── tsconfig*.json            # TypeScript configurations
├── README.md                 # Quick start & usage
├── PROJECT_OVERVIEW.md       # Detailed architecture & docs
└── setup.sh                  # Environment setup script (Yarn)
```

### Backend API Server (ES Modules)

```
server/index.js (ESM)

# JIRA Endpoints (use JIRA_TOKEN env var)
- GET  /api/jira/status        # Check if JIRA service account is configured
- POST /api/test-jira          # JIRA token validation (legacy, uses server token)
- POST /api/jira-ticket        # Single JIRA ticket lookup
- POST /api/jira-sprint-tickets # Sprint JIRAs for user
- POST /api/jira-child-issues  # Child issues for Epic/Feature/parent (JQL-based)

# GitHub Proxy Endpoints (use GITHUB_TOKEN env var)
- GET  /api/github/status                                    # Check if GitHub service account is configured
- GET  /api/github/search/issues                             # Search PRs/issues
- GET  /api/github/repos/:owner/:repo/pulls/:number          # PR details
- GET  /api/github/repos/:owner/:repo/pulls/:number/reviews  # PR reviews
- GET  /api/github/repos/:owner/:repo/pulls/:number/comments # PR inline comments
- GET  /api/github/repos/:owner/:repo/pulls/:number/requested_reviewers
- GET  /api/github/repos/:owner/:repo/issues/:number/comments
- GET  /api/github/repos/:owner/:repo/commits/:ref/status    # CI status

# Unleash Proxy Endpoints (use UNLEASH_STAGING_TOKEN, UNLEASH_PROD_TOKEN env vars)
- GET  /api/unleash/status                                   # Check if Unleash tokens are configured
- POST /api/unleash/flags                                    # Fetch and compare feature flags from staging/prod
```

The server is implemented with **ES modules** (import/export) and serves the built React app from `dist/`. 

#### Server-Side Tokens (Phase 3+ - Current)

All API tokens are provided by the server via environment variables:
- `GITHUB_TOKEN` - GitHub personal access token (service account)
- `JIRA_TOKEN` - JIRA personal access token (service account)
- `UNLEASH_STAGING_TOKEN` - Unleash staging API token
- `UNLEASH_PROD_TOKEN` - Unleash production API token

Users only need to provide their **username** (GitHub) and **email** (JIRA) to filter results for themselves.

#### Why a Backend Server Is Required

- **JIRA** (enterprise instance): No CORS support for browser-origin requests; requires server-side proxy
- **GitHub**: Now also proxied to enable server-side token management (users don't need their own tokens)

---

## 🎨 User Interface & Features

### Navigation System
- Single-row header with logo, navigation tabs, timeboard, and settings
- Five primary tabs:
  1) My Sprint JIRAs
  2) My Code Reviews
  3) My PRs
  4) JIRA Lookup
  5) Feature Flags
- Team Timeboard: Globe button opens team timezone dashboard

### Core Panels
- **My Sprint JIRAs**: All tickets for current sprint; sorted by last update; refresh button
- **JIRA Lookup**: Prefix + number input, recent history, instant associated PRs
- **My Code Reviews**: PRs requesting your review; reviewer comments modal; refresh button
- **My PRs**: Open/closed toggle, associated JIRA detection, status badges; refresh button
- **Associated Panels (Right Side)**: Linked PRs for a JIRA; linked JIRAs for a PR
- **Feature Flags**: Unleash dashboard comparing staging vs production; summary cards; search/filter; expandable descriptions

### Advanced Components
- **JiraCard**: Atlassian Document Format rendering; inline images; collapsible sections; status (filled Atlassian colors), type & priority (black with colored borders and icons); Comments title with superscript new/edited badge; comments sorted by recent activity and labeled “(edited)” when applicable
- **PRCard**: GitHub Flavored Markdown; full conversation + review comments; GitHub-themed badges; reviewer notification circles for new/edited comments since last view; PR Checks with camel-cased values and colored word/border; Checkout button to copy `gh pr checkout <number>`
- **TimeboardModal**: Team timezone dashboard with member management and off-hours indicators

---

## 🛠️ Development Setup

### Prerequisites
- Node.js 18+
- Yarn package manager
- GitHub personal access token
- Red Hat JIRA personal access token

### Getting Started

1) Install dependencies
```bash
yarn install
```

2) Start application

**Option A: Local Development with Service Account Tokens (Recommended)**

```bash
# Set tokens as environment variables (get from team lead or create your own)
GITHUB_TOKEN=ghp_xxxx JIRA_TOKEN=xxxx yarn start
```
- This matches the hosted behavior - users only need their username, not tokens
- Builds React and serves from Express on `http://localhost:3017`

**Option B: Local Development without Tokens**

```bash
yarn start
```
- GitHub and JIRA features will show "service not configured" errors
- Useful for UI-only development

**Option C: Development mode (hot reloading)**

```bash
GITHUB_TOKEN=ghp_xxxx JIRA_TOKEN=xxxx yarn start:dev
```
- API server: `http://localhost:3017` (Express)
- React app: `http://localhost:5174` (Vite dev server)

3) Configure your identity
- Open Settings (gear icon)
- Verify GitHub and JIRA connections show ✅
- Enter your GitHub username and JIRA email
- Settings persist in localStorage

> **Note**: Users no longer need their own API tokens! The server provides them via environment variables.

---

## 🔧 Technical Architecture

### State Management
- **React Context**: Settings, user identity, user preferences (timezone)
- **React Query**: Server state with caching and background updates
- **LocalStorage**: User identity, search history, timezone preferences, team selection
- **Component State**: UI state and forms

### Identity & Session Management
- **First-run flow**: "Who are you?" modal appears on first visit
- **Identity persistence**: Selected team member stored in `localStorage`
- **Log Out**: Settings modal includes "🚪 Log Out" button that:
  - Clears all localStorage data (tokens, preferences, identity)
  - Reloads page to trigger first-run flow
  - Useful for testing or switching users
- **App Security Info**: Settings modal includes "ⓘ App Security" button that opens a modal explaining:
  - How tokens are stored (OpenShift Secrets, never in browser)
  - Server-side API proxying (no direct client-to-external API calls)
  - User identity handling (localStorage only, not transmitted)
  - Network security (HTTPS/TLS)

### API Integration
- **GitHub API**: Direct from frontend; multi-endpoint integration; robust error handling
- **JIRA API**: Proxied via Express; token-based authentication
- **Hooks**: Centralized in `hooks/useApiQueries.ts`
- **Background Refetch**: Automatic updates at tuned intervals
- **Reviewer Discovery**: Aggregates data across multiple GitHub endpoints. Reviewer notification counts use last-click timestamps (localStorage) and consider both created and updated times.

#### Reviewer Notification System
- Storage: `localStorage['reviewer-last-clicked']` stores per-PR, per-reviewer last-click timestamps (`"owner/repo#123": { "username": epoch_ms }`).
- Initialization: When a PR is first viewed, timestamps are initialized for current reviewers to establish a “fresh start”. Late-appearing reviewers are backfilled with current time via `addMissingReviewerTimestamps` without overwriting existing values.
- Counting: `getNotificationInfo(repo, prNumber, username, comments)` inspects all conversation comments (general PR comments, completed reviews with bodies, and inline review comments). For each comment by `username`, the newest of `created_at` or `updated_at` is compared with the last-click timestamp. Any creation or edit after last-click contributes to the unread count. Age-based urgency (normal/warning/urgent) derives from the newest unread activity.
- Decoupled badge computation: Notification counting uses live conversation data and does not rely on previously cached `hasComments` flags, ensuring general comments and inline comments surface immediately.
- Debugging: `window.debugNotifications` exposes helpers to inspect/clear localStorage for troubleshooting.

#### GitHub PR Details Enhancements (2025-09)
- Pagination added for heavy endpoints:
  - `GET /repos/{owner}/{repo}/pulls/{number}/reviews` (all pages)
  - `GET /repos/{owner}/{repo}/issues/{number}/comments` (all pages)
- Reviewer aggregation rules:
  - Current requested reviewers are surfaced as `review_requested`, overriding prior states (approved/changes_requested) to match GitHub’s active “Awaiting review”.
  - Otherwise precedence is strongest prior state: `approved > changes_requested > commented`.
- Mergeability detection for rebase signaling:
  - “Needs Rebase” is true when `mergeable_state` is `behind` or `dirty`.
  - Fallback when state is `unknown` or `blocked`: call `GET /compare/{base}...{head}` and set “Needs Rebase” if `behind_by > 0`.
  - Compare supports forks using `owner:ref` syntax for both sides.
- Checks status (no extra APIs required):
  - Uses combined status: `GET /repos/{owner}/{repo}/commits/{sha}/status`.
  - Captures `checksState` (success/failure/pending/error), counts, and a concise `checksSummary` that lists up to 3 failing/pending contexts for badge tooltips.

#### UI Badges & Rules (PRCard)
- “Checks” badge reflects real GitHub status (with tooltip showing failing/pending contexts).
- “Needs Rebase” badge appears when out-of-date or conflicts are detected (see logic above).
- “Ready to Merge” badge shows when:
  - At least 3 reviewers have `approved`
  - No rebase needed
  - `checksState === 'success'`
  - When “Ready to Merge” is shown, the separate “Checks” badge is hidden to reduce noise.

### Styling & UI
- Single `App.css` with organized sections
- Dark theme optimized for developers
- Panel/card paddings tightened; smaller title spacing for denser lists
- Reviewer and PR badges use black backgrounds with colored borders by state
- PR cards use strong white accents (titles/borders)
- PR Checks: “Checks: Passed/Failed” with colored value, neutral label
- JIRA badges: status filled (To Do, In Progress/Review, Closed), type/priority black bordered; priority icons (up/down triangle, equals, circle)
- JIRA comments: superscript badge next to title; comments sorted by latest activity; “(edited)” indicator

### Image Handling
- **JIRA Images**: Render inline via `issues.redhat.com` attachments (proxied via backend for CORS)
- **GitHub Images**: Inline when accessible; graceful fallback to styled links when blocked/expired
- **No persistent caching by default**: The server exposes optional cache endpoints, but the frontend does not use them. Images are primarily proxied.
- **Single-server Mode**: Same-origin serving improves reliability and performance

---

## ⏰ Team Timeboard - Data, Behavior, and Timezone Logic

### Data source and persistence
- Seed members: `/timeboard/members.json` (served from the production build; generated from `public/timeboard/members.json`).
- User edits persist in `localStorage` (`ocmui_timeboard_members`).
- Load order: prefer `localStorage` if present, else fetch the seed JSON.
- Reload action: fetches `/timeboard/members.json`, normalizes objects to `{ name, role, tz }`, and overwrites `localStorage`.

Development notes:
- `yarn start` runs `yarn build` first, so changes in `public/timeboard/members.json` are picked up automatically.
- `yarn start:dev` serves directly from `public/` via Vite; no build needed.

### Inline editing model
- Edit and add are inline in the table with Save/Cancel. During edit, “Local Time” and “Offset” cells show em dashes and are recomputed after Save/Cancel.
- The modal is dismissible only via the close button (×); the backdrop click does not close it.

### Timezone list and display
- IANA timezone dropdown uses `Intl.supportedValuesOf('timeZone')` when available; otherwise falls back to a small curated list of common zones.
- Each option label is `IANA — UTC±hh[:mm]` computed via `Intl.DateTimeFormat(..., { timeZoneName: 'shortOffset' })`.
- TZ dropdown sort is user-selectable: alphabetically by IANA name or by current GMT offset.
- All time calculations are DST-aware via `Intl.DateTimeFormat` with the specific `timeZone`.

### Reference time mode
- Reference time input uses `<input type="time">` constrained to 09:00–17:00 with 30‑minute increments (step 1800). Internally represented as minutes since midnight (`refMinutes`).
- Reference date construction computes UTC minutes from the selected reference TZ’s current offset, then renders each member’s local time for sorting and display.
- Member rows are sorted by each person’s local time at the selected reference; this is independent of the TZ dropdown sort preference.

### Identity selection
- “I am …” sets `userPreferences.timezone` to the selected member’s `tz` and stores `ocmui_selected_team_member` in `localStorage`.

---

## 🚨 Known Considerations
- **GitHub Rate Limits**: Standard API rate limits apply; mitigated via React Query
- **JIRA Authentication**: Requires valid Red Hat JIRA personal access token
- **GitHub Image Variability**: Some images convert to fallback links depending on repository access or URL lifecycle

---

## 🎯 Development Best Practices
- Use React Query for all network data
- Keep types in `src/types/` and shared utilities in `src/utils/`
- Use `BasePanel` and existing component architecture patterns
- Provide clear loading and error states consistently

---

## 🧪 Scripts (Yarn)
```bash
# Recommended: Run with service account tokens
GITHUB_TOKEN=ghp_xxx JIRA_TOKEN=xxx yarn start

# Available scripts
yarn start       # Build + serve from Express (add env vars for full functionality)
yarn start:dev   # Express API + Vite dev server (hot reload)
yarn build       # Production build
yarn dev         # Vite dev server only
yarn start:api   # API server only (no frontend)
yarn lint        # ESLint
yarn preview     # Preview production build

# Note: The Express server does not auto-restart on changes. 
# Restart manually or use a watcher like nodemon.
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_TOKEN` | Yes* | GitHub personal access token (service account) |
| `JIRA_TOKEN` | Yes* | JIRA personal access token (service account) |
| `UNLEASH_STAGING_TOKEN` | No | Unleash staging API token (for Feature Flags tab) |
| `UNLEASH_PROD_TOKEN` | No | Unleash production API token (for Feature Flags tab) |
| `PORT` | No | Server port (default: 3017 locally, 8080 in container) |

*Required for full functionality. Without tokens, GitHub/JIRA features will show "service not configured" errors.

---

## 🌐 Endpoints & Quick Links
- Dashboard: `http://localhost:3017`
- Settings: `http://localhost:3017/#settings`
- Timeboard: `http://localhost:3017/#timeboard`
- JIRA API:
  - Test: `http://localhost:3017/api/test-jira`
  - Single ticket: `http://localhost:3017/api/jira-ticket`
  - Sprint tickets: `http://localhost:3017/api/jira-sprint-tickets`

---

## 🧰 Setup Script (setup.sh)

The `setup.sh` script prepares your environment for running the dashboard.

- What it does:
  - Verifies Node.js is installed and prints version
  - Verifies Yarn is installed and prints version
  - Installs project dependencies via `yarn install`
  - Warns if port 3017 is already in use (does not kill it automatically)
  - Prints clear next steps to start the app

- How to run:
```bash

./setup.sh
```

- After running:
  - Start production-like server: `yarn start`
  - Or start development mode (hot reload): `yarn start:dev`
  - Open `http://localhost:3017` and configure tokens in Settings (gear icon)

- Troubleshooting:
  - If port 3017 is busy:
    ```bash
    lsof -ti:3017 | xargs kill -9
    ```
  - Re-run `./setup.sh` safely any time; it is idempotent.

---

## ☁️ OpenShift Deployment (ROSA HCP)

The dashboard is deployed to a ROSA HCP (Hosted Control Plane) cluster on AWS.

### Live URL
```
https://ocmui-team-dashboard-ocmui-dashboard.apps.rosa.c9a9m7g8h3p4x6t.rz7k.p3.openshiftapps.com
```

### Cluster Details
| Property | Value |
|----------|-------|
| Cluster Name | `ocmui-team-dashboard` |
| Type | ROSA HCP (Hosted Control Plane) |
| Region | us-east-1 |
| Namespace | `ocmui-dashboard` |
| Image Registry | OpenShift Internal Registry |

### Prerequisites

```bash
# Install OpenShift CLI
brew install openshift-cli

# Install Podman (container engine)
brew install podman

# Start Podman machine (if not running)
podman machine start
```

### Why Podman?

Podman is a daemonless container engine (alternative to Docker):
- **No daemon**: Doesn't require a background service
- **Rootless**: Runs without root privileges by default
- **Docker-compatible**: Same commands (`podman build`, `podman push`)
- **Lighter**: No Docker Desktop required on macOS

### Logging into the Cluster

1. Go to [OCM Console](https://console.redhat.com/openshift)
2. Select `ocmui-team-dashboard` cluster
3. Click **"Open console"** to access the OCP web console
4. Click your username → **"Copy login command"** → **"Display Token"**
5. Run the `oc login` command in terminal:

```bash
oc login --token=sha256~YOUR_TOKEN --server=https://api.c9a9m7g8h3p4x6t.rz7k.p3.openshiftapps.com:443
```

### Making Code Changes and Deploying

#### Quick Deploy (after code changes)

```bash
# 1. Make sure you're in the project directory
cd /path/to/ocmui-team-dashboard

# 2. Build for linux/amd64 (required for AWS/OpenShift)
#    IMPORTANT: Mac M1/M2 builds ARM images by default - must specify platform!
podman build --platform linux/amd64 -t ocmui-team-dashboard:latest .

# 3. Login to OpenShift (if not already)
oc login --token=YOUR_TOKEN --server=https://api.c9a9m7g8h3p4x6t.rz7k.p3.openshiftapps.com:443

# 4. Switch to the dashboard namespace
oc project ocmui-dashboard

# 5. Login to the internal registry
REGISTRY="default-route-openshift-image-registry.apps.rosa.c9a9m7g8h3p4x6t.rz7k.p3.openshiftapps.com"
podman login -u $(oc whoami) -p $(oc whoami -t) $REGISTRY --tls-verify=false

# 6. Tag and push the image
podman tag localhost/ocmui-team-dashboard:latest $REGISTRY/ocmui-dashboard/ocmui-team-dashboard:latest
podman push $REGISTRY/ocmui-dashboard/ocmui-team-dashboard:latest --tls-verify=false

# 7. Restart the deployment to pick up the new image
oc rollout restart deployment/ocmui-team-dashboard

# 8. Watch the rollout
oc rollout status deployment/ocmui-team-dashboard
```

#### One-liner Deploy Script

```bash
# From the project root, after making changes:
podman build --platform linux/amd64 -t ocmui-team-dashboard:latest . && \
REGISTRY="default-route-openshift-image-registry.apps.rosa.c9a9m7g8h3p4x6t.rz7k.p3.openshiftapps.com" && \
podman tag localhost/ocmui-team-dashboard:latest $REGISTRY/ocmui-dashboard/ocmui-team-dashboard:latest && \
podman push $REGISTRY/ocmui-dashboard/ocmui-team-dashboard:latest --tls-verify=false && \
oc rollout restart deployment/ocmui-team-dashboard
```

### Monitoring & Troubleshooting

```bash
# Check pod status
oc get pods

# View logs (live)
oc logs deployment/ocmui-team-dashboard -f

# View recent logs
oc logs deployment/ocmui-team-dashboard --tail=50

# Describe pod for events/errors
oc describe pod -l app=ocmui-team-dashboard

# Get the public URL
oc get route ocmui-team-dashboard -o jsonpath='https://{.spec.host}'

# Restart if something goes wrong
oc rollout restart deployment/ocmui-team-dashboard

# Check resource usage
oc adm top pods
```

### Architecture Notes

- **Platform**: Image must be built for `linux/amd64` (x86_64)
  - Apple Silicon Macs build ARM images by default
  - Use `--platform linux/amd64` flag with podman/docker
- **Port**: Server runs on port 8080 inside the container (OpenShift standard)
- **TLS**: Handled by OpenShift Route (edge termination)
- **Health checks**: Configured in deployment.yaml (liveness/readiness probes)

### File Reference

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build (builder → production) |
| `openshift/deployment.yaml` | Pod spec, env vars, probes, resources |
| `openshift/service.yaml` | ClusterIP service on port 8080 |
| `openshift/route.yaml` | HTTPS route with TLS |
| `openshift/kustomization.yaml` | Kustomize config, image reference |
| `openshift/secrets.example.yaml` | Template for Phase 3 tokens |
| `README-openshift.md` | Detailed deployment guide |
