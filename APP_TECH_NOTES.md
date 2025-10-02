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
- /api/test-jira            # JIRA token validation
- /api/jira-ticket          # Single JIRA ticket lookup
- /api/jira-sprint-tickets  # Sprint JIRAs for user
- /api/jira-child-issues    # Child issues for Epic/Feature/parent (JQL-based)
```

The server is implemented with **ES modules** (import/export) and serves the built React app from `dist/`. It also acts as a JIRA proxy to bypass CORS restrictions in browser environments. The `/api/jira-ticket` endpoint includes each comment’s `updated` timestamp (when present) so the UI can detect edited comments.

#### Why a Backend Server Is Required for JIRA (But Not GitHub)

- **JIRA** (enterprise instance): No CORS support for browser-origin requests; requires server-side proxy
- **GitHub**: CORS-friendly public API; tokens work directly from the frontend

---

## 🎨 User Interface & Features

### Navigation System
- Single-row header with logo, navigation tabs, timeboard, and settings
- Four primary tabs:
  1) My Sprint JIRAs
  2) My Code Reviews
  3) My PRs
  4) JIRA Lookup
- Team Timeboard: Globe button opens team timezone dashboard

### Core Panels
- **My Sprint JIRAs**: All tickets for current sprint; sorted by last update
- **JIRA Lookup**: Prefix + number input, recent history, instant associated PRs
- **My Code Reviews**: PRs requesting your review; reviewer comments modal
- **My PRs**: Open/closed toggle, associated JIRA detection, status badges
- **Associated Panels (Right Side)**: Linked PRs for a JIRA; linked JIRAs for a PR

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

- Production-like build and serve (Recommended)
```bash
yarn start
```
  - Builds React and serves from Express on `http://localhost:3017`
  - Same-origin for optimal image handling and security

- Development mode (hot reloading)
```bash
yarn start:dev
```
  - API server: `http://localhost:3017` (Express)
  - React app: `http://localhost:5174` (Vite dev server)

3) Configure tokens
- Open Settings (gear icon)
- Add GitHub token
- Add JIRA token and email
- Settings persist in localStorage

---

## 🔧 Technical Architecture

### State Management
- **React Context**: Settings, tokens, user preferences (timezone)
- **React Query**: Server state with caching and background updates
- **LocalStorage**: Token persistence, search history, timezone preferences, team selection
- **Component State**: UI state and forms

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
yarn start       # Build + serve from Express (recommended default)
yarn start:dev   # Express API + Vite dev server (hot reload)
Note: The Express server does not auto-restart on changes. Restart manually or use a watcher like nodemon (e.g., add a `start:api:watch` script).
yarn build       # Production build
yarn dev         # Vite dev server only
yarn start:api   # API server only (no frontend)
yarn lint        # ESLint
yarn preview     # Preview production build
```

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
