# Deploying OCMUI Team Dashboard to OpenShift

This guide covers deploying the dashboard to an OpenShift cluster (ROSA, OSD, or self-managed).

## Prerequisites

- OpenShift cluster (ROSA HCP recommended for cost/speed)
- `oc` CLI installed and logged in
- Container registry access (Quay.io, Docker Hub, or OpenShift internal registry)
- `podman` or `docker` for building images

## Quick Start

### Option A: Use the Deploy Script (Recommended)

```bash
# Full build and deploy
./deploy.sh

# Skip build (just push and deploy existing image)
./deploy.sh --skip-build
```

### Option B: Manual Steps

#### 1. Build and Push the Container Image

```bash
# Set your registry (examples)
export IMAGE_REGISTRY=quay.io/your-username
# or for OpenShift internal registry:
# export IMAGE_REGISTRY=$(oc get route default-route -n openshift-image-registry -o jsonpath='{.spec.host}')/your-namespace

# Build the image (cross-compile for x86_64 if on Apple Silicon)
podman build --platform linux/amd64 -t $IMAGE_REGISTRY/ocmui-team-dashboard:latest .

# Push to registry
podman push $IMAGE_REGISTRY/ocmui-team-dashboard:latest
```

### 2. Create a Namespace

```bash
oc new-project ocmui-dashboard
# or use existing:
# oc project your-namespace
```

### 3. Update the Image Reference

Edit `openshift/kustomization.yaml` and set your image:

```yaml
images:
  - name: ${IMAGE_REGISTRY}/ocmui-team-dashboard
    newName: quay.io/your-username/ocmui-team-dashboard  # ← Your registry
    newTag: latest
```

### 4. Deploy

```bash
# Apply all manifests
oc apply -k openshift/

# Or apply individually:
# oc apply -f openshift/deployment.yaml
# oc apply -f openshift/service.yaml
# oc apply -f openshift/route.yaml
```

### 5. Get the Route URL

```bash
oc get route ocmui-team-dashboard -o jsonpath='{.spec.host}'
```

Visit `https://<route-url>` to access the dashboard.

---

## Current Behavior (Server-Side Tokens) ✅

The dashboard uses **server-side service accounts** for both GitHub and JIRA:

- ✅ **Users don't need their own tokens** - just their username/email
- ✅ Tokens stored securely in OpenShift Secrets
- ✅ Server proxies all GitHub and JIRA API calls
- ✅ Each user sees their own data (filtered by username/email)

### User Experience

When users visit the dashboard:
1. First-run "Who are you?" modal asks them to identify themselves
2. They confirm their GitHub username and JIRA email in Settings
3. Done! No tokens needed.

### How It Works

| API | Token Source | User Provides |
|-----|--------------|---------------|
| GitHub | Server (`GITHUB_TOKEN` env var) | GitHub username |
| JIRA | Server (`JIRA_TOKEN` env var) | JIRA email |

---

## Managing Server-Side Tokens

### View Current Secret

```bash
oc get secret ocmui-dashboard-tokens -o yaml
```

### Update Tokens

**Update only Unleash tokens** (keeps GitHub and JIRA unchanged):

```bash
oc patch secret ocmui-dashboard-tokens -p '{"stringData":{
  "unleash-staging-token":"YOUR_STAGING_TOKEN",
  "unleash-prod-token":"YOUR_PROD_TOKEN"
}}'
oc rollout restart deployment/ocmui-team-dashboard
```

**Replace entire secret** (use when rotating GitHub, JIRA, or all tokens):

```bash
oc delete secret ocmui-dashboard-tokens

oc create secret generic ocmui-dashboard-tokens \
  --from-literal=github-token='ghp_xxxxxxxxxxxxxxxxxxxx' \
  --from-literal=jira-token='your-jira-personal-access-token' \
  --from-literal=unleash-staging-token='your-staging-token' \
  --from-literal=unleash-prod-token='your-prod-token'

oc rollout restart deployment/ocmui-team-dashboard
```

### Token Reference

| Token | Purpose | How to Obtain |
|-------|---------|---------------|
| `github-token` | GitHub API access | GitHub Settings → Developer settings → Personal access tokens |
| `jira-token` | JIRA API access | issues.redhat.com → Profile → Personal Access Tokens |
| `unleash-staging-token` | Unleash staging API | [Unleash token](#unleash-feature-flag-token-server-side-client) (Server-side SDK CLIENT, read-only) |
| `unleash-prod-token` | Unleash production API | Same; create one token per environment (staging + production) |

### Unleash feature flag token (Server-side CLIENT)

The dashboard only **reads** feature flags from Unleash. Use a **Server-side SDK (CLIENT)** token — not an Admin token.

**Privileges:** A CLIENT token is **read-only** for configuration. It can fetch feature toggle configurations and post usage metrics only. It **cannot** create, update, or delete feature flags or any other Unleash resources. Only an **ADMIN** token has full access.

**How to create (with Red Hat SSO):** You create the token while logged in as Admin; no separate Viewer user or login is needed.

1. In Unleash go to **Admin → API access → Create API token**.
2. **Token name**: e.g. `ocmui-team-dashboard-viewer`.
3. **What do you want to connect?** Choose **Server-side SDK (CLIENT)** (not Client-side FRONTEND, not ADMIN).
4. **Project**: e.g. all projects or the project the dashboard uses (e.g. `default`).
5. **Environment**: `production` for prod; create a second token with environment `development` (or your staging env) for staging.
6. Create the token and copy it (format like `*:production.xxxx` or `*:development.xxxx`).
7. Repeat on the other Unleash instance if you use both (e.g. ocm.unleash.devshift.net and ocm-stage.unleash.devshift.net).
8. Store the tokens in the cluster using [Update only Unleash tokens](#update-tokens) above (`oc patch secret ...` then `oc rollout restart`).

### Verify Token Status

```bash
# Check GitHub connection
curl -s https://YOUR_ROUTE/api/github/status | jq .

# Check JIRA connection  
curl -s https://YOUR_ROUTE/api/jira/status | jq .
```

---

## Managing the Team Roster

The team roster is stored in a PersistentVolumeClaim (PVC) at `/data/members.json` and is shared across all users.

### View Current Roster

```bash
# SSH into the pod and view
oc rsh deployment/ocmui-team-dashboard cat /data/members.json
```

### Add/Edit/Delete Members

```bash
# SSH into the pod
oc rsh deployment/ocmui-team-dashboard

# Edit the roster file
vi /data/members.json

# Changes take effect immediately - users can click "Refresh" in Timeboard
```

### Reset Roster from Seed File

If you need to reset the roster to the original seed file (`public/timeboard/members.json`):

```bash
# Via API
curl -X POST https://YOUR_ROUTE/api/team/members/reload

# Or delete the data file and restart (will re-seed on startup)
oc rsh deployment/ocmui-team-dashboard rm /data/members.json
oc rollout restart deployment/ocmui-team-dashboard
```

### Roster Entry Format

```json
{
  "name": "Jane Doe",
  "role": "dev",
  "tz": "America/New_York",
  "github": "janedoe",
  "jira": "jdoe@redhat.com"
}
```

---

## Access Logging & Audit Trail

The dashboard tracks all API access for security auditing. Logs are stored in the PVC at `/data/access.log`.

### View Usage Statistics

```bash
curl -s https://ocmui-team-dashboard-ocmui-dashboard.apps.rosa.c9a9m7g8h3p4x6t.rz7k.p3.openshiftapps.com/api/audit/stats | jq .
```

Returns:
- Total requests and unique users
- Team members who have used the dashboard
- Daily activity breakdown
- Top endpoints accessed

### View Dashboard Users

```bash
curl -s https://ocmui-team-dashboard-ocmui-dashboard.apps.rosa.c9a9m7g8h3p4x6t.rz7k.p3.openshiftapps.com/api/audit/users | jq .
```

Shows which team members are actively using the dashboard, including:
- First seen / last seen timestamps
- Request count per user
- Whether they're in the team roster

### View Recent Access Logs

```bash
# Get last 100 log entries
curl -s https://ocmui-team-dashboard-ocmui-dashboard.apps.rosa.c9a9m7g8h3p4x6t.rz7k.p3.openshiftapps.com/api/audit/logs | jq .

# Filter by user
curl -s "https://ocmui-team-dashboard-ocmui-dashboard.apps.rosa.c9a9m7g8h3p4x6t.rz7k.p3.openshiftapps.com/api/audit/logs?user=Dave%20Taylor" | jq .

# Filter by date
curl -s "https://ocmui-team-dashboard-ocmui-dashboard.apps.rosa.c9a9m7g8h3p4x6t.rz7k.p3.openshiftapps.com/api/audit/logs?date=2026-02-09" | jq .

# Filter by endpoint
curl -s "https://ocmui-team-dashboard-ocmui-dashboard.apps.rosa.c9a9m7g8h3p4x6t.rz7k.p3.openshiftapps.com/api/audit/logs?path=/api/jira" | jq .
```

### View Raw Log File

```bash
oc rsh deployment/ocmui-team-dashboard cat /data/access.log
```

Each log entry contains:
- `timestamp` - When the request occurred
- `method` - HTTP method (GET, POST, etc.)
- `path` - API endpoint accessed
- `teamMember` - Who made the request (from frontend identity)
- `authUser` - Basic Auth username
- `ip` - Client IP address
- `statusCode` - HTTP response code
- `duration` - Request duration in ms

### Clear Old Logs

```bash
# Delete logs older than a specific date
curl -X DELETE "https://ocmui-team-dashboard-ocmui-dashboard.apps.rosa.c9a9m7g8h3p4x6t.rz7k.p3.openshiftapps.com/api/audit/logs?before=2026-01-01T00:00:00Z"
```

### Log Rotation

Logs automatically rotate when the file exceeds 10MB. Up to 5 rotated files are kept (`access.log.1`, `access.log.2`, etc.).

### Audit Report Script

A CLI script is provided for generating formatted audit reports:

```bash
# Show help
./scripts/audit-report.sh --help

# Today's activity on production ROSA
./scripts/audit-report.sh

# Last week on production
./scripts/audit-report.sh --week

# Last 3 weeks
./scripts/audit-report.sh --3weeks

# Custom date range
./scripts/audit-report.sh --start 2026-01-15 --end 2026-02-01

# Filter by user
./scripts/audit-report.sh --week --user "Dave Taylor"

# Summary only (no individual logs)
./scripts/audit-report.sh --month --summary

# Against local dev server instead of ROSA
./scripts/audit-report.sh --local --today

# Raw JSON output (for scripting)
./scripts/audit-report.sh --week --json
```

**Time Range Options:**

| Option | Description |
|--------|-------------|
| `--today` | Current day (default) |
| `--yesterday` | Previous day |
| `--week` | Last 7 days |
| `--2weeks` | Last 14 days |
| `--3weeks` | Last 21 days |
| `--month` | Last 30 days |
| `--start DATE --end DATE` | Custom range (YYYY-MM-DD) |

**Server Options:**

| Option | Description |
|--------|-------------|
| `--prod` | Production ROSA cluster (default) |
| `--local` | Local dev server (localhost:3017) |
| `--url URL` | Custom server URL |
| `--auth USER:PASS` | Basic auth credentials |

**Authentication:** Production requires Basic Auth. Pass credentials via `--auth` or set `DASHBOARD_AUTH` env var:

```bash
# Option 1: Use --auth flag
./scripts/audit-report.sh --prod --auth "username:password"

# Option 2: Set environment variable
export DASHBOARD_AUTH="username:password"
./scripts/audit-report.sh --prod
```

---

## Troubleshooting

### Check Pod Status

```bash
oc get pods -l app=ocmui-team-dashboard
oc describe pod -l app=ocmui-team-dashboard
```

### View Logs

```bash
oc logs -l app=ocmui-team-dashboard -f
```

### Check Events

```bash
oc get events --sort-by='.lastTimestamp'
```

### Image Pull Issues

If using a private registry:

```bash
# Create pull secret
oc create secret docker-registry my-pull-secret \
  --docker-server=quay.io \
  --docker-username=your-username \
  --docker-password=your-password

# Link to default service account
oc secrets link default my-pull-secret --for=pull
```

### Route Not Working

```bash
# Check route status
oc get route ocmui-team-dashboard -o yaml

# Check service endpoints
oc get endpoints ocmui-team-dashboard
```

---

## Resource Recommendations

| Deployment Size | Replicas | CPU Request | Memory Request |
|-----------------|----------|-------------|----------------|
| Development     | 1        | 100m        | 128Mi          |
| Production      | 2        | 200m        | 256Mi          |

The default manifests use development sizing. For production, increase replicas and resources in `deployment.yaml`.

---

## Updating the Deployment

```bash
# Rebuild and push new image
podman build -t $IMAGE_REGISTRY/ocmui-team-dashboard:latest .
podman push $IMAGE_REGISTRY/ocmui-team-dashboard:latest

# Trigger rollout
oc rollout restart deployment/ocmui-team-dashboard

# Watch rollout
oc rollout status deployment/ocmui-team-dashboard
```

---

## ROSA HCP Cluster Creation (Recommended)

If you need to create a cluster:

```bash
# Install ROSA CLI
brew install rosa-cli  # or download from Red Hat

# Login and verify
rosa login
rosa verify quota

# Create ROSA HCP cluster (fastest option)
rosa create cluster --cluster-name=ocmui-dashboard \
  --sts --mode=auto --hosted-cp \
  --region=us-east-1 \
  --replicas=2 \
  --compute-machine-type=m5.xlarge

# Wait for cluster (usually ~15 minutes for HCP)
rosa describe cluster --cluster=ocmui-dashboard

# Create admin user
rosa create admin --cluster=ocmui-dashboard

# Login with oc
oc login <api-url> --username=cluster-admin --password=<generated-password>
```

---

## Security Considerations

1. **Tokens**: Never commit real tokens. Use `secrets.example.yaml` as a template only.
2. **Route TLS**: The default route uses edge TLS termination (HTTPS).
3. **Non-root**: The container runs as a non-root user (UID 1001).
4. **Network Policy**: Consider adding NetworkPolicy for production.
5. **Audit Logging**: All API access is logged with user identity, timestamps, and IP addresses. See "Access Logging & Audit Trail" section above.
6. **Basic Auth**: Dashboard is protected with shared username/password. Consider upgrading to Red Hat SSO for stronger authentication.

---

## Files Reference

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build for the app |
| `openshift/deployment.yaml` | Pod deployment configuration |
| `openshift/service.yaml` | Internal ClusterIP service |
| `openshift/route.yaml` | External HTTPS route |
| `openshift/pvc.yaml` | PersistentVolumeClaim for team roster and audit logs |
| `openshift/secrets.example.yaml` | Template for tokens (GitHub, JIRA, Unleash) |
| `openshift/kustomization.yaml` | Kustomize configuration |
| `deploy.sh` | Automated build and deploy script |
| `scripts/audit-report.sh` | CLI tool for generating audit reports |
| `/data/members.json` | Team roster (on PVC) |
| `/data/access.log` | Access audit log (on PVC) |
| `/data/usage-stats.json` | Aggregated usage statistics (on PVC) |