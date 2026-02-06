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
- ✅ Full dashboard functionality (My Sprint JIRAs, My PRs, My Code Reviews, JIRA Lookup)
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
| JIRA | 🎫 | My Sprint JIRAs, JIRA Lookup |
| GitHub | 🐙 | My Code Reviews, My PRs |
| Other | ••• | 🚩 Feature Flags, 🔗 Doc Links |

Visual Layout
```
🎫 JIRA [My Sprint JIRAs] [JIRA Lookup]  │  🐙 GitHub  │  ••• Other
         └── active secondary tabs ──┘       └─ inactive (clickable) ─┘
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
- Browser → Express (JIRA proxy)
  - GET `/api/jira/status`
  - POST `/api/test-jira`
  - POST `/api/jira-ticket`
  - POST `/api/jira-sprint-tickets`
  - POST `/api/jira-child-issues`
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


