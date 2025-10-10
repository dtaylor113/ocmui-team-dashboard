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

Branching/Structure
- To avoid disruption, create a separate hosted variant in a new repository (recommended): `ocmui-team-dashboard-hosted`.
  - Copy the app at the end of Phase 1, then apply Phases 2–3 there.
  - Keep this repository as the stable standalone version.

---

## Phase 3 – Hosted Variant (service-account tokens; OpenShift deploy)

Goal: Move tokens to OpenShift Secrets, proxy GitHub/JIRA via server, and deploy.

Scope
- Backend
  - Read `GITHUB_TOKEN`, `JIRA_TOKEN`, `JIRA_BASE_URL` from env.
  - Update JIRA endpoints to stop accepting `token` in requests; use env token.
  - Add GitHub proxy endpoints for PR lists/details, reviews, issue comments, statuses, compare (with pagination where needed).
  - Optional: `/api/github-image?url=...` proxy for private image rendering.
- Frontend
  - Switch GitHub fetches to call new server endpoints; remove token usage entirely.
  - Remove token inputs from Settings once the server holds credentials.
- OpenShift
  - Create Secret with tokens and base URL; apply Deployment/Service/Route.
  - Health probes to `/`; log monitoring and basic rate-limit observability.

Acceptance
- Hosted app functions without any user-pasted tokens; users select identity only.
- Data visibility matches the service account’s access.

Rollout
- Implement Phase 3 in the hosted variant repository to keep this repo stable.

---

## Phase 4 – Shared Team Roster Persistence (post-hosting)

Goal: Replace per-browser `localStorage` editing with a team-shared persistence.

Options (to be evaluated)
- Server-side JSON with CRUD endpoints, stored on a PVC; editor UI in Settings (admin-only toggle).
- ConfigMap ingestion + admin UI that generates a new ConfigMap (cluster-admin flow).
- Lightweight database (e.g., SQLite on PVC or a managed Postgres) with simple RBAC.

Acceptance
- Team roster changes can be edited by designated maintainers and are visible to all users.
- Backup/restore path defined and documented.

---

## Branching and Repos

- Main repository (this one) remains the standalone app, feature-complete after Phase 1.
- Hosted variant repository (`ocmui-team-dashboard-hosted`) is created from the Phase 1 tag and receives Phases 2–3 (+ later Phase 4 changes as needed).
- Use tags to mark phase completions in both repos.

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

- [ ] Phase 1 complete and tagged
- [ ] Hosted variant repository created from Phase 1 tag
- [ ] Phase 2 manifests and Dockerfile ready
- [ ] Phase 3 server proxies and OpenShift deploy
- [ ] Phase 4 persistence design implemented


---

## AI Onboarding – Code Entry Points and Tips

Use this section to quickly navigate the codebase and implement each phase.

### Core files by concern
- Timeboard / Identity
  - `src/components/TimeboardModal.tsx`
    - Loads members; inline add/edit/delete; “I am …” selection; persists `ocmui_selected_team_member` and updates timezone.
- Settings and Global Preferences
  - `src/contexts/SettingsContext.tsx`
    - Holds `apiTokens` and `userPreferences`; `isConfigured` calculation; persistence via localStorage.
  - `src/components/SettingsModal.tsx`
    - UI for tokens and (to be) team actions; callsites for `testGithubToken`/`testJiraToken`.
- API Queries
  - `src/hooks/useApiQueries.ts`
    - All GitHub and JIRA data fetches; today GitHub calls hit public API with `Authorization` header; JIRA calls go through our Express proxy.
- Server (Express)
  - `server/index.js`
    - Serves built SPA; JIRA proxy endpoints; update `PORT` handling and add GitHub proxy routes in Phase 3.

### Key localStorage keys
- `ocmui_selected_team_member` – persisted identity: `{ name, tz, [github], [jira] }`
- `ocmui_user_preferences` – timezone and UI preferences
- `ocmui_api_tokens` – current token and username storage (to be reduced/removed progressively)
- `ocmui_timeboard_members` – user-edited team roster (overrides seed JSON)
- Reviewer notifications keys (see `APP_TECH_NOTES.md`): `reviewer-last-clicked`

### Phase mapping to code edits
- Phase 1
  - Extend `TeamMember` shape where used in `TimeboardModal.tsx` to include `github` and `jira`.
  - When identity changes, propagate `github`/`jira` into `SettingsContext` (set `githubUsername`/`jiraUsername` in-memory) so existing hooks keep working.
  - Add first-run identity modal; add a Settings action to reset identity.
  - Move team bulk actions (Export/Add/Upload) into `SettingsModal.tsx` under a "Team" section.
- Phase 2
  - Create `openshift/` with Deployment/Service/Route manifests and `secrets.example.yaml`.
  - Add `README-openshift.md` with build/push/deploy steps.
  - Confirm `Dockerfile` at repo root; set `const PORT = process.env.PORT || 3017;` in `server/index.js`.
- Phase 3 (hosted variant repo)
  - Server: Read `GITHUB_TOKEN`, `JIRA_TOKEN`, `JIRA_BASE_URL` from env. Remove `token` from request bodies; add `/api/github/*` proxy endpoints (PR lists/details, reviews, comments, status, compare; paginate where needed). Optional `/api/github-image` proxy.
  - Frontend: Switch GitHub fetches in `useApiQueries.ts` to server endpoints; remove token input fields from `SettingsModal.tsx`.
  - OpenShift: Use `openshift/` manifests to deploy; inject Secrets; set probes.
- Phase 4
  - Introduce server-side roster persistence (PVC-backed JSON or DB) with minimal CRUD; admin-only editor in Settings.

### Endpoint inventory (current)
- Browser → Express (JIRA only today)
  - POST `/api/test-jira`
  - POST `/api/jira-ticket`
  - POST `/api/jira-sprint-tickets`
  - POST `/api/jira-child-issues`
- Browser → GitHub (to be proxied in Phase 3)
  - `https://api.github.com/search/issues` (PR search)
  - `https://api.github.com/repos/{owner}/{repo}/pulls/{number}`
  - `.../pulls/{number}/reviews`
  - `.../issues/{number}/comments`
  - `.../pulls/{number}/comments`
  - `.../commits/{sha}/status`
  - `.../compare/{base}...{head}`

### Environment variables (Phase 3 hosted variant)
- `PORT` – web server port (OpenShift often uses 8080)
- `JIRA_BASE_URL` – e.g., `https://issues.redhat.com`
- `JIRA_TOKEN` – service-account token for JIRA
- `GITHUB_TOKEN` – service-account token for GitHub

### Search tips for new contributors/agents
- Start with semantic search for intent, then narrow to files:
  - "Where is the 'I am' identity selection handled?"
  - "How are members loaded/saved for the Timeboard?"
  - "Which hooks call GitHub APIs directly?"
  - "Where are JIRA endpoints implemented in the server?"
- If you need exact strings (e.g., localStorage keys), use exact match searches for `ocmui_selected_team_member`, `ocmui_user_preferences`, etc.


