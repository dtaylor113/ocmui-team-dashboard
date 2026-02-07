## OCMUI Team Dashboard – Roadmap

This roadmap organizes work into phases to deliver an identity-first UX, prepare for OpenShift hosting, and later evolve persistence.

### Guiding principles
- **No secrets in browsers** once hosted; use server-side tokens via OpenShift Secrets.
- **Identity via roster**: users select “I am …”, not paste usernames/tokens.
- **Minimize disruption**: keep a stable standalone app while developing the hosted variant.

---

## Phase 1 – Complete the App UX (standalone)

Goal: Identity comes from the team roster; first-run setup prompts for identity; team actions are streamlined.

Scope
- Extend timeboard roster members with identity fields: `github` and `jira` (string; JIRA email or username).
- On “I am …” selection, persist identity `{ name, tz, github, jira }` and set timezone; derive usernames globally.
- Remove GitHub/JIRA username inputs from Settings (keep tokens during Phase 1).
- First-run “Who are you?” modal when no identity is set; include a `+ Add` to add yourself quickly.
- Move bulk team actions (Export, Add Member, Upload members.json) into a Team section in Settings.

Acceptance
- Fresh install shows “Who are you?”; after selecting a member, app proceeds and persists identity.
- “I am …” button shows the selected member; identity persists across reloads.
- GitHub/JIRA usernames are no longer typed in Settings; tokens remain for now.
- Adding a missing member from the first-run modal works and persists locally.

Notes
- Keep storage model: seed from `public/timeboard/members.json`; persist edits in `localStorage`.

---

## Phase 2 – Structure for Hosting (OpenShift-ready, no behavior change)

Goal: Introduce deploy artifacts without altering current runtime behavior.

Scope
- Add `openshift/` directory with manifests: Deployment, Service, Route, `secrets.example.yaml`.
- Add `README-openshift.md` with build/push/deploy steps and `oc` commands.
- Add/confirm `Dockerfile` at repo root.
- Update server to `const PORT = process.env.PORT || 3017;`.

Acceptance
- Local development (`yarn start`, `yarn start:dev`) remains unchanged.
- Repository contains everything needed to deploy the current app image to OpenShift.

---

## Phase 2.5 – Initial ROSA Deployment ✅ COMPLETE

Goal: Deploy the app to a ROSA HCP cluster with user-provided tokens.

**Completed: February 6, 2026**

Deployment Details
- **Cluster**: ROSA HCP on AWS (`ocmui-team-dashboard`)
- **Namespace**: `ocmui-dashboard`
- **URL**: `https://ocmui-team-dashboard-ocmui-dashboard.apps.rosa.c9a9m7g8h3p4x6t.rz7k.p3.openshiftapps.com`
- **Image Registry**: OpenShift internal registry
- **Architecture**: linux/amd64 (cross-compiled from Apple Silicon)

What Works
- ✅ First-run "Who are you?" identity modal
- ✅ Identity selection auto-fills GitHub/JIRA usernames
- ✅ Token validation with auto-detection of user identity
- ✅ Full dashboard functionality (My Sprint JIRAs, My PRs, My Code Reviews, Quick Find)
- ✅ HTTPS via OpenShift Route with edge TLS termination

Current Behavior (as of Phase 2.5)
- Users provided their own GitHub and JIRA tokens
- Tokens stored in browser localStorage
- Identity (username) derived from roster selection

**Note**: This phase has been superseded by Phase 3 - users no longer need tokens.

Deployment Commands (for reference)
```bash
# Build for correct architecture
podman build --platform linux/amd64 -t ocmui-team-dashboard:latest .

# Push to OpenShift internal registry
REGISTRY=$(oc get route default-route -n openshift-image-registry -o jsonpath='{.spec.host}')
podman push $REGISTRY/ocmui-dashboard/ocmui-team-dashboard:latest --tls-verify=false

# Deploy
oc apply -k openshift/

# Restart after image update
oc rollout restart deployment/ocmui-team-dashboard
```

---

## Phase 3 – Server-Side Tokens ✅ COMPLETE

Goal: Move tokens to OpenShift Secrets, proxy GitHub/JIRA via server, and deploy.

**Completed: February 6, 2026**

What Was Implemented
- Backend (`server/index.js`)
  - ✅ Read `GITHUB_TOKEN`, `JIRA_TOKEN`, `JIRA_BASE_URL` from environment
  - ✅ GitHub proxy endpoints: `/api/github/status`, `/api/github/search/issues`, `/api/github/repos/:owner/:repo/pulls/:pull_number`, `/api/github/repos/:owner/:repo/pulls/:pull_number/reviews`, `/api/github/repos/:owner/:repo/pulls/:pull_number/comments`, `/api/github/repos/:owner/:repo/pulls/:pull_number/requested_reviewers`, `/api/github/repos/:owner/:repo/issues/:issue_number/comments`, `/api/github/repos/:owner/:repo/commits/:ref/status`, `/api/github/repos/:owner/:repo/commits/:ref/check-runs`
  - ✅ JIRA endpoints use `process.env.JIRA_TOKEN` (no client token needed)
  - ✅ `/api/jira/status` endpoint for checking server-side JIRA configuration
- Frontend
  - ✅ All GitHub fetches now use server proxy endpoints
  - ✅ All JIRA fetches use server proxy (no token in request body)
  - ✅ Token input fields removed from Settings modal
  - ✅ Settings shows "GitHub/JIRA access provided by server"
  - ✅ Added "Log Out" button to reset identity and re-test first-run flow
- OpenShift
  - ✅ Secret `ocmui-dashboard-tokens` with `github-token` and `jira-token`
  - ✅ Deployment injects tokens via environment variables

Current User Experience
- Users visit the hosted URL
- First-run "Who are you?" modal appears
- Select identity from team roster
- Dashboard loads with full functionality - **no tokens needed!**

Local Development
- Run with tokens: `GITHUB_TOKEN=xxx JIRA_TOKEN=xxx yarn start`
- See `README.md` for details

---

## Phase 3.5 – Red Hat SSO Integration (Optional Enhancement)

Goal: Replace manual identity selection with SSO-based authentication.

Scope
- Add OAuth proxy sidecar to deployment
- Configure Red Hat SSO (Keycloak) as identity provider
- Map SSO user identity to roster members (by email)
- Remove "Who are you?" modal; identity comes from SSO headers

Benefits
- No manual identity selection needed
- Proper authentication (restrict access to team members)
- Audit trail of who accessed the dashboard

Prerequisites
- Red Hat SSO instance or cluster OAuth configuration
- Service account for OAuth proxy

---

## Phase 4 – Shared Team Roster Persistence ✅ COMPLETE

Goal: Replace per-browser `localStorage` editing with a team-shared persistence.

**Completed: February 6, 2026**

What Was Implemented
- Server-side CRUD API endpoints (`/api/team/members`)
- PersistentVolumeClaim (PVC) for persistent storage
- Data stored at `/data/members.json` on the server
- Frontend uses API with localStorage fallback for local dev
- Removed Export/Reload/Add buttons from Timeboard UI (security)
- Added Refresh button to re-fetch roster from server
- Admin roster management via `oc rsh` or git seed file
- Deploy script (`deploy.sh`) for easy deployments

Current User Experience
- ✅ All users see the same team roster
- ✅ New users can add themselves via "I'm not listed" in First Run
- ✅ Existing members can edit their own entry (Edit button)
- ✅ Admin can add/edit/delete via CLI or seed file
- ✅ Changes persist across pod restarts (PVC-backed)

---

## Phase 5 – Feature Flags Dashboard ✅ COMPLETE

Goal: Add a top-level "Feature Flags" tab to visualize Unleash feature flag states across environments.

**Completed: February 6, 2026**

What Was Implemented
- Server-side Unleash proxy endpoints (`/api/unleash/status`, `/api/unleash/flags`)
- New React component `FeatureFlagsPanel.tsx` with:
  - Summary cards (Total, Prod ON, Not Released, Staging Only, Prod Only, Org Restricted)
  - Clickable filters to narrow down flag list
  - Searchable table with columns: Flag Name, In Code?, Stage, Prod, Strategy, Status / Last Modified (Prod)
  - "In Code?" column shows ✓/✗ whether flag is defined in codebase's `featureConstants.ts`
  - Last Modified shows production environment's modification history
- Unleash tokens stored in OpenShift Secret (`unleash-staging-token`, `unleash-prod-token`)
- New tab icon using Unleash branding

Current User Experience
- ✅ Click "Feature Flags" tab to see all team feature flags
- ✅ Summary cards show quick counts (mismatches, prod-on, etc.)
- ✅ Click a summary card to filter the table
- ✅ Search by flag name or author
- ✅ See "In Code?" status for each flag
- ✅ See who last modified each flag in production and when

---

## Phase 5.5 – UX Improvements ✅ COMPLETE

Goal: Polish the user experience based on team feedback.

**Completed: February 6, 2026**

What Was Implemented
- **Refresh Buttons**: Added to all main panels (My Sprint JIRAs, My Code Reviews, My PRs)
  - Appears next to "Last Updated" timestamp
  - Click to manually refresh data
- **App Security Info**: New "ⓘ App Security" button in Settings modal
  - Opens modal explaining security precautions (token storage, API proxying, data handling)
- **Welcome Popup Icons**: Replaced emoji icons with proper GitHub/JIRA image assets
- **Settings Button Layout**: Improved positioning of Log Out and Feedback buttons

---

## Phase 6 – Two-Level Navigation ✅ COMPLETE

Goal: Reorganize navigation to support future expansion with grouped tabs.

**Completed: February 6, 2026**

What Was Implemented
- **Inline grouped navigation**: Single-row header with primary and secondary tabs
- **Primary tabs**: JIRA, GitHub, Other (clickable category selectors)
- **Secondary tabs**: Appear inline next to active primary tab only
- **Icons**: Each primary tab has an icon; "Other" uses generic ••• icon; Feature Flags secondary tab has Unleash icon
- **Compact design**: Uses horizontal space efficiently; all tabs in one row

Tab Structure
| Primary | Icon | Secondary Tabs |
|---------|------|----------------|
| JIRA | 🎫 | My Sprint JIRAs, Epics |
| GitHub | 🐙 | My Code Reviews, My PRs, Reviewers |
| Other | ••• | 🚩 Feature Flags, 🔗 Doc Links |

Visual Layout
```
[Quick Find: ▾ Jira Id | input | Find]  🎫 JIRA [My Sprint JIRAs] [Epics]  🐙 GitHub  ••• Other
                                                └── active secondary tabs ──┘
```

Benefits
- Room to add more tabs (e.g., "Sprint Report", "Team Metrics" under Other)
- Clear visual hierarchy
- Efficient use of horizontal space

---

## Phase 7 – Doc Links Health Checker ✅ COMPLETE

Goal: Add a "Doc Links" subtab under "Other" to validate external documentation URLs from uhc-portal in real-time.

**Completed: February 6, 2026**

What Was Implemented
- Server-side URL extraction from uhc-portal GitHub source files (`installLinks.mjs`, `supportLinks.mjs`, `docLinks.mjs`)
- **Regex-based parsing strategy**:
  - Extracts `const NAME = 'value'` declarations for base URL constants
  - Substitutes `${NAME}` template literals to resolve full URLs
  - Filters out commented-out code (single-line `//` and multi-line `/* */`)
  - Filters out base URLs (e.g., ending in `/html`, `/latest`) that are not direct link targets
  - Filters malformed URLs (containing control characters or trailing code artifacts)
- HTTP HEAD/GET fallback logic (mirrors `check-links.mjs` behavior)
- 8-second timeout per request to prevent API freezes
- Batch processing with delays between batches
- New React component `DocLinksPanel.tsx` with:
  - Summary cards (Total URLs, Success, Redirects, Client Errors, Server Errors)
  - Expandable sections for each status category
  - Chain link icon on the tab
  - Chain icon (🔗) on the tab

Current User Experience
- ✅ Click "Other" → "Doc Links" to run a real-time URL health check
- ✅ Results closely match `check-links.mjs` GitHub Action output (~421 URLs, same broken links detected)
- ✅ Results match check-links.mjs exactly (425 URLs)
- ✅ Redirect destinations are validated with timeout protection

Server Endpoints
- `GET /api/doc-links/check` - Fetches URLs from uhc-portal, validates each, returns categorized results
- `GET /api/doc-links/urls` - Returns just the extracted URL list (for debugging)

Environment Variables
- `DOC_LINKS_SOURCE_FILES` - Comma-separated list of source files to parse (default: `installLinks.mjs,supportLinks.mjs,docLinks.mjs`)

---

## Phase 8 – Epics Report ✅ COMPLETE

Goal: Add an "Epics" subtab under "JIRA" to provide a team-wide view of active Epics matching the external JIRA dashboard.

**Completed: February 2026**

What Was Implemented
- New "Epics" tab under JIRA navigation (full-width table layout, not split panel)
- Server endpoints:
  - `POST /api/jira-epics` - Fetches epics with filter support
  - `POST /api/jira-update-field` - Updates JIRA custom fields (for Marketing Impact Notes edit)
- Four filter modes (all scoped to `project = OCMUI`):
  - **In-Progress** (default): `project = OCMUI AND labels in ('ui-active-item') AND issuetype = Epic AND Blocked = "False" AND status in ("In Progress", "Code Review", "Review") ORDER BY priority DESC, "Target end" ASC`
  - **Planning**: `project = OCMUI AND labels in ('ui-active-item') AND issuetype = Epic AND Blocked = "False" AND status in ("New", "Refinement", "Backlog", "To Do") ORDER BY priority DESC, "Target end" ASC`
  - **All**: `project = OCMUI AND issuetype = Epic AND Blocked = "False" AND (status != Closed OR resolved >= -90d) ORDER BY priority DESC, "Target end" ASC`
  - **Blocked**: `project = OCMUI AND labels in ('ui-active-item') AND issuetype = Epic AND Blocked = "True" ORDER BY priority DESC, "Target end" ASC`
- Table features:
  - Click-to-sort column headers (default sort: Target end ascending)
  - Resizable columns with drag handles and `col-resize` cursor
  - Status counter badges at top of each filter view (colored by status, sorted by count)
  - JIRA-style priority icons (SVG-based, matching official JIRA icons)
  - Columns: P (Priority), Key (linked), Summary (wraps), Status (badge), Assignee, Target End (child + parent), Parent (key + status), Marketing Impact Notes / Blocked Reason
  - **"Last updated by" info**: Shows under Epic Key and Parent columns (two-line format: "Last updated by <name>" / "<time ago>")
  - "Marketing Impact Notes" column with inline edit button → opens edit dialog
  - "Blocked Reason" column shown only in Blocked mode (swaps with Marketing Impact Notes)
  - Expandable rows showing child issues with vertical "Child Issues" label
  - Child issues table: Key, Summary, Type, Status, Assignee, Last Updated (sorted by most recent)
- Custom JIRA fields:
  - `customfield_12319289` - Marketing Impact Notes
  - `customfield_12316544` - Blocked Reason
  - `customfield_12313942` - Target End
  - `customfield_12313140` - Parent Link
  - `customfield_12318341` - Feature Link
- Hooks:
  - `useEpics(filter)` - Fetches epics for the given filter
  - `useUpdateJiraField()` - Mutation hook for updating JIRA fields
- Utility:
  - `src/utils/priorityIcons.tsx` - Reusable JIRA-style SVG priority icons

Current User Experience
- ✅ Click "JIRA" → "Epics" to see all team epics
- ✅ Filter between In-Progress, Planning, All, and Blocked views
- ✅ Status counter badges show counts per status at top of each view
- ✅ Click column headers to sort (ascending/descending toggle)
- ✅ Drag column edges to resize columns
- ✅ Click expand button (▶) to see child issues (vertical "Child Issues" label)
- ✅ Marketing Impact Notes editable inline (click edit icon → dialog → Save/Cancel)
- ✅ Target End column shows both epic's date and parent's date (labeled "(Parent)")
- ✅ Parent column shows parent key, status, and "Last updated by <name> / <time ago>"
- ✅ Key column shows JIRA ID and "Last updated by <name> / <time ago>" below it

---

## Phase 9 – Reviewer Workload ✅ COMPLETE

Goal: Add a "Reviewers" subtab under "GitHub" to show team-wide code review workload distribution.

**Completed: February 2026**

What Was Implemented
- New "Reviewers" tab under GitHub navigation (full-width panel, not split panel)
- Server endpoint: `GET /api/github/reviewer-workload`
  - **Scoped to `RedHatInsights/uhc-portal` repository only**
  - Fetches all team members with GitHub usernames from roster
  - For each member, queries GitHub for PRs where they are a requested reviewer
  - Categorizes by review state: Pending, Changes Requested, Commented, Approved
- Warning for team members missing GitHub usernames
- Table with columns: Team Member, GitHub (linked), Pending, Changes Req., Commented, Approved, Total
  - Sorted by least pending PRs (most available at top)
  - Zero values displayed as empty cells for cleaner look

Current User Experience
- ✅ Click "GitHub" → "Reviewers" to see team workload for uhc-portal
- ✅ Table sorted by least pending (most available reviewers at top)
- ✅ Warning shows devs missing GitHub usernames (with instructions to fix)
- ✅ Click GitHub username to open their profile
- ✅ Refresh button for manual update (5-minute auto-refresh)

---

## Phase 10 – Quick Find & Navigation Improvements ✅ COMPLETE

Goal: Add Quick Find feature to header and improve navigation styling.

**Completed: February 2026**

What Was Implemented
- **Quick Find bar** in header (between title and navigation tabs)
  - Dropdown to select "Jira Id:" or "PR #:"
  - Input field with placeholder based on selection
  - "Find" button to execute lookup
  - Pressing Enter also submits
- **Quick Find JIRA mode**: Displays JiraCard in left panel, associated PRs automatically load in right panel
- **Quick Find PR mode**: Displays PRCard in left panel, associated JIRAs automatically load in right panel
  - PR lookup scoped to `RedHatInsights/uhc-portal` repository
- **Removed JIRA Lookup tab** from JIRA secondary tabs (functionality replaced by Quick Find)
- **Navigation styling improvements**:
  - Primary and secondary tabs use underline styling instead of boxes
  - Active primary tab has magenta underline with rounded left border
  - Active secondary tab has blue underline
  - Rounded corners on tab group borders
  - Removed vertical bar delimiters between primary tab groups

New Components
- `QuickFindBar.tsx` - Header Quick Find UI component
- `QuickFindJiraPanel.tsx` - Results panel for JIRA Quick Find
- `QuickFindPRPanel.tsx` - Results panel for PR Quick Find

Current User Experience
- ✅ Quick Find in header for instant JIRA or PR lookup by ID
- ✅ Associated items load automatically (no extra click required)
- ✅ Clean underline-based navigation styling
- ✅ Clicking a regular tab clears Quick Find mode

---

## Branching and Repos

**Current approach** (simplified):
- This repository serves both standalone and hosted versions
- Deployed directly to ROSA HCP cluster (`ocmui-team-dashboard`)
- No separate hosted variant repository needed

**Deployment model**:
- Local development: `yarn start` or `yarn start:dev`
- Hosted: Build with Podman, push to OpenShift internal registry, deploy via `oc apply -k openshift/`

---

## Field Reference (Roster)

Example `public/timeboard/members.json` entry extension:

```json
{
  "name": "Jane Doe",
  "role": "Frontend Engineer",
  "tz": "America/New_York",
  "github": "jdoe",
  "jira": "jdoe@redhat.com"
}
```

Notes
- `jira` can be an email or a username; the app treats it as an opaque identity string used in JQL.

---

## Checklist

- [x] Phase 1 complete and tagged
- [x] Phase 2 manifests and Dockerfile ready
- [x] Phase 2.5 Initial ROSA deployment live! 🎉
- [x] Phase 3 server-side tokens - complete! 🔐
- [x] Phase 4 shared roster persistence - complete! 👥
- [x] Phase 5 feature flags dashboard - complete! 🚩
- [x] Phase 5.5 UX improvements - complete! ✨
- [x] Phase 6 two-level navigation - complete! 📑
- [x] Phase 7 doc links health checker - complete! 🔗
- [x] Phase 8 epics report - complete! 🟪
- [x] Phase 9 reviewer workload - complete! 👥
- [x] Phase 10 quick find & navigation improvements - complete! 🔍
- [ ] Phase 3.5 Red Hat SSO integration (optional)


---

## AI Onboarding – Code Entry Points and Tips

Use this section to quickly navigate the codebase and implement each phase.

### Core files by concern
- Timeboard / Identity
  - `src/components/TimeboardModal.tsx`
    - Loads members; inline add/edit/delete; "I am …" selection; persists `ocmui_selected_team_member` and updates timezone.
- Settings and Global Preferences
  - `src/contexts/SettingsContext.tsx`
    - Holds `apiTokens` and `userPreferences`; `isConfigured` calculation; persistence via localStorage.
  - `src/components/SettingsModal.tsx`
    - UI for tokens and team actions; Log Out button; App Security info modal.
- API Queries
  - `src/hooks/useApiQueries.ts`
    - All GitHub, JIRA, and Unleash data fetches; all calls go through Express proxy.
- Server (Express)
  - `server/index.js`
    - Serves built SPA; GitHub, JIRA, and Unleash proxy endpoints; team roster CRUD.
- Feature Flags
  - `src/components/FeatureFlagsPanel.tsx`
    - Unleash dashboard with summary cards, search, and comparison table.
- Doc Links
  - `src/components/DocLinksPanel.tsx`
    - Real-time URL health checker for uhc-portal documentation links.
- Epics Report
  - `src/components/EpicsPanel.tsx`
    - Team-wide Epics table with filters, sortable/resizable columns, expandable child issues.
    - Includes: status counter badges, edit modal for Marketing Impact Notes, vertical "Child Issues" label.
  - `src/utils/priorityIcons.tsx`
    - Reusable JIRA-style SVG priority icons (Blocker, Critical, Major, Normal, Minor, Trivial).
- Reviewer Workload
  - `src/components/ReviewerWorkloadPanel.tsx`
    - Team-wide review workload dashboard for uhc-portal with summary cards and availability hints.
- Quick Find
  - `src/components/QuickFindBar.tsx`
    - Header Quick Find UI with dropdown (Jira Id / PR #), input, and Find button.
  - `src/components/QuickFindJiraPanel.tsx`
    - Quick Find results for JIRA lookup; shows JiraCard + associated PRs.
  - `src/components/QuickFindPRPanel.tsx`
    - Quick Find results for PR lookup; shows PRCard + associated JIRAs.
- Shared UI Components
  - `src/components/BasePanel.tsx`
    - Reusable panel wrapper with header, loading states, and refresh button.

### Key localStorage keys
- `ocmui_selected_team_member` – persisted identity: `{ name, tz, [github], [jira] }`
- `ocmui_user_preferences` – timezone and UI preferences
- `ocmui_api_tokens` – current token and username storage (to be reduced/removed progressively)
- `ocmui_timeboard_members` – user-edited team roster (overrides seed JSON)
- Reviewer notifications keys (see `APP_TECH_NOTES.md`): `reviewer-last-clicked`

### Phase mapping to code edits
- Phase 1 ✅
  - Extend `TeamMember` shape where used in `TimeboardModal.tsx` to include `github` and `jira`.
  - When identity changes, propagate `github`/`jira` into `SettingsContext` (set `githubUsername`/`jiraUsername` in-memory) so existing hooks keep working.
  - Add first-run identity modal; add a Settings action to reset identity.
  - Move team bulk actions (Export/Add/Upload) into `SettingsModal.tsx` under a "Team" section.
- Phase 2 ✅
  - Create `openshift/` with Deployment/Service/Route manifests and `secrets.example.yaml`.
  - Add `README-openshift.md` with build/push/deploy steps.
  - Confirm `Dockerfile` at repo root; set `const PORT = process.env.PORT || 3017;` in `server/index.js`.
- Phase 3 ✅
  - Server: Read `GITHUB_TOKEN`, `JIRA_TOKEN`, `JIRA_BASE_URL` from env. Remove `token` from request bodies; add `/api/github/*` proxy endpoints (PR lists/details, reviews, comments, status, compare; paginate where needed).
  - Frontend: Switch GitHub/JIRA fetches in `useApiQueries.ts` to server endpoints; remove token input fields from `SettingsModal.tsx`.
  - OpenShift: Use `openshift/` manifests to deploy; inject Secrets via `ocmui-dashboard-tokens`.
  - Added "Log Out" button in Settings to reset identity.
- Phase 4 ✅
  - Server: Added `/api/team/members` CRUD endpoints with PVC-backed JSON storage.
  - Frontend: TimeboardModal and FirstRunIdentityModal fetch from API; removed Export/Reload/Add buttons for security; added Refresh button.
  - OpenShift: Added `pvc.yaml` and volume mounts in deployment.
  - Added `deploy.sh` script for easy deployments.
- Phase 3.5 (optional)
  - Add OAuth proxy sidecar to deployment for Red Hat SSO integration.

### Endpoint inventory (Phase 3+ - all server-side)
- Browser → Express (GitHub proxy)
  - GET `/api/github/status`
  - GET `/api/github/search/issues`
  - GET `/api/github/repos/:owner/:repo/pulls/:pull_number`
  - GET `/api/github/repos/:owner/:repo/pulls/:pull_number/reviews`
  - GET `/api/github/repos/:owner/:repo/pulls/:pull_number/comments`
  - GET `/api/github/repos/:owner/:repo/pulls/:pull_number/requested_reviewers`
  - GET `/api/github/repos/:owner/:repo/issues/:issue_number/comments`
  - GET `/api/github/repos/:owner/:repo/commits/:ref/status`
  - GET `/api/github/repos/:owner/:repo/commits/:ref/check-runs`
  - GET `/api/github/reviewer-workload` (team review workload for uhc-portal)
  - GET `/api/github/repos/:owner/:repo/pulls/:number` (single PR by number - used by Quick Find)
- Browser → Express (JIRA proxy)
  - GET `/api/jira/status`
  - POST `/api/test-jira`
  - POST `/api/jira-ticket`
  - POST `/api/jira-sprint-tickets`
  - POST `/api/jira-child-issues`
  - POST `/api/jira-epics`
  - POST `/api/jira-update-field` (update Marketing Impact Notes, etc.)
- Browser → Express (Unleash proxy)
  - GET `/api/unleash/status`
  - POST `/api/unleash/flags`
- Browser → Express (Doc Links)
  - GET `/api/doc-links/check` (fetches URLs from uhc-portal, validates, returns results)
  - GET `/api/doc-links/urls` (returns extracted URL list for debugging)

### Environment variables (implemented)
- `PORT` – web server port (OpenShift uses 8080, local default 3017)
- `JIRA_BASE_URL` – e.g., `https://issues.redhat.com`
- `JIRA_TOKEN` – service-account token for JIRA (stored in OpenShift Secret)
- `GITHUB_TOKEN` – service-account token for GitHub (stored in OpenShift Secret)
- `UNLEASH_STAGING_TOKEN` – Unleash staging API token (stored in OpenShift Secret)
- `UNLEASH_PROD_TOKEN` – Unleash production API token (stored in OpenShift Secret)
- `DOC_LINKS_SOURCE_FILES` – comma-separated list of uhc-portal source files to parse for URLs (default: `installLinks.mjs,supportLinks.mjs,docLinks.mjs`)

**Local development**: `GITHUB_TOKEN=xxx JIRA_TOKEN=xxx yarn start`

### Search tips for new contributors/agents
- Start with semantic search for intent, then narrow to files:
  - "Where is the 'I am' identity selection handled?"
  - "How are members loaded/saved for the Timeboard?"
  - "Which hooks call GitHub APIs directly?"
  - "Where are JIRA endpoints implemented in the server?"
- If you need exact strings (e.g., localStorage keys), use exact match searches for `ocmui_selected_team_member`, `ocmui_user_preferences`, etc.


