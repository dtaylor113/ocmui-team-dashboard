# Deploying OCMUI Team Dashboard to OpenShift

This guide covers deploying the dashboard to an OpenShift cluster (ROSA, OSD, or self-managed).

## Prerequisites

- OpenShift cluster (ROSA HCP recommended for cost/speed)
- `oc` CLI installed and logged in
- Container registry access (Quay.io, Docker Hub, or OpenShift internal registry)
- `podman` or `docker` for building images

## Quick Start

### 1. Build and Push the Container Image

```bash
# Set your registry (examples)
export IMAGE_REGISTRY=quay.io/your-username
# or for OpenShift internal registry:
# export IMAGE_REGISTRY=$(oc get route default-route -n openshift-image-registry -o jsonpath='{.spec.host}')/your-namespace

# Build the image
podman build -t $IMAGE_REGISTRY/ocmui-team-dashboard:latest .

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

## Current Behavior (Phase 2)

In this phase, the app works the same as locally:
- Users configure their own GitHub and JIRA tokens in Settings
- Tokens are stored in the browser's localStorage
- No server-side secrets are used

This is suitable for:
- Personal use
- Team members who each have their own tokens
- Testing the deployment before Phase 3

---

## Phase 3: Server-Side Tokens (Future)

When Phase 3 is implemented, tokens will move to OpenShift Secrets:

### Create the Secret

```bash
# Option 1: From command line
oc create secret generic ocmui-dashboard-tokens \
  --from-literal=github-token='ghp_xxxxxxxxxxxxxxxxxxxx' \
  --from-literal=jira-token='your-jira-personal-access-token'

# Option 2: From file (copy and edit secrets.example.yaml first)
cp openshift/secrets.example.yaml openshift/secrets.yaml
# Edit secrets.yaml with your tokens
oc apply -f openshift/secrets.yaml
```

### Update Deployment

Uncomment the environment variables in `openshift/deployment.yaml`:

```yaml
env:
  - name: GITHUB_TOKEN
    valueFrom:
      secretKeyRef:
        name: ocmui-dashboard-tokens
        key: github-token
  - name: JIRA_TOKEN
    valueFrom:
      secretKeyRef:
        name: ocmui-dashboard-tokens
        key: jira-token
  - name: JIRA_BASE_URL
    value: "https://issues.redhat.com"
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

---

## Files Reference

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build for the app |
| `openshift/deployment.yaml` | Pod deployment configuration |
| `openshift/service.yaml` | Internal ClusterIP service |
| `openshift/route.yaml` | External HTTPS route |
| `openshift/secrets.example.yaml` | Template for tokens (Phase 3) |
| `openshift/kustomization.yaml` | Kustomize configuration |
