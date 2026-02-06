#!/bin/bash
#
# Deploy OCMUI Team Dashboard to OpenShift
#
# Usage: ./deploy.sh [--skip-build]
#
# Options:
#   --skip-build    Skip the build step (just push and deploy existing image)
#

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="ocmui-team-dashboard"
NAMESPACE="ocmui-dashboard"
PLATFORM="linux/amd64"

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  🚀 OCMUI Team Dashboard - OpenShift Deployment${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}▶ Checking prerequisites...${NC}"

if ! command -v oc &> /dev/null; then
    echo -e "${RED}✗ 'oc' CLI not found. Please install it first.${NC}"
    exit 1
fi

if ! command -v podman &> /dev/null; then
    echo -e "${RED}✗ 'podman' not found. Please install it first.${NC}"
    exit 1
fi

# Check if logged into OpenShift
if ! oc whoami &> /dev/null; then
    echo -e "${RED}✗ Not logged into OpenShift. Please run 'oc login' first.${NC}"
    exit 1
fi

CURRENT_USER=$(oc whoami)
CURRENT_PROJECT=$(oc project -q 2>/dev/null || echo "unknown")
echo -e "${GREEN}✓ Logged in as: ${CURRENT_USER}${NC}"
echo -e "${GREEN}✓ Current project: ${CURRENT_PROJECT}${NC}"

# Get registry URL
echo ""
echo -e "${YELLOW}▶ Getting OpenShift registry URL...${NC}"
REGISTRY=$(oc get route default-route -n openshift-image-registry -o jsonpath='{.spec.host}' 2>/dev/null)

if [ -z "$REGISTRY" ]; then
    echo -e "${RED}✗ Could not get registry URL. Is the image registry exposed?${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Registry: ${REGISTRY}${NC}"

# Build step (unless --skip-build)
if [ "$1" != "--skip-build" ]; then
    echo ""
    echo -e "${YELLOW}▶ Building container image (${PLATFORM})...${NC}"
    podman build --platform ${PLATFORM} -t ${IMAGE_NAME}:latest .
    echo -e "${GREEN}✓ Build complete${NC}"
else
    echo ""
    echo -e "${YELLOW}▶ Skipping build (--skip-build)${NC}"
fi

# Tag and push
echo ""
echo -e "${YELLOW}▶ Tagging and pushing image...${NC}"
FULL_IMAGE="${REGISTRY}/${NAMESPACE}/${IMAGE_NAME}:latest"
podman tag ${IMAGE_NAME}:latest ${FULL_IMAGE}
podman push ${FULL_IMAGE} --tls-verify=false
echo -e "${GREEN}✓ Image pushed to: ${FULL_IMAGE}${NC}"

# Apply manifests
echo ""
echo -e "${YELLOW}▶ Applying OpenShift manifests...${NC}"
oc apply -k openshift/ 2>&1 | grep -v "^#" || true
echo -e "${GREEN}✓ Manifests applied${NC}"

# Restart deployment
echo ""
echo -e "${YELLOW}▶ Restarting deployment...${NC}"
oc rollout restart deployment/${IMAGE_NAME}
echo -e "${GREEN}✓ Rollout initiated${NC}"

# Wait for rollout
echo ""
echo -e "${YELLOW}▶ Waiting for rollout to complete...${NC}"
oc rollout status deployment/${IMAGE_NAME}
echo -e "${GREEN}✓ Rollout complete${NC}"

# Get route URL
echo ""
ROUTE_URL=$(oc get route ${IMAGE_NAME} -o jsonpath='{.spec.host}' 2>/dev/null)
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  ✅ Deployment successful!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Dashboard URL: ${GREEN}https://${ROUTE_URL}${NC}"
echo ""
