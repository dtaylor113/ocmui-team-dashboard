#!/bin/bash
#
# OCMUI Team Dashboard - Audit Report Script
# 
# Generates access audit reports for the dashboard.
#
# Usage:
#   ./scripts/audit-report.sh [OPTIONS]
#
# Time Range Options:
#   --today           Show today's activity (default)
#   --yesterday       Show yesterday's activity
#   --week            Show last 7 days
#   --2weeks          Show last 14 days
#   --3weeks          Show last 21 days
#   --month           Show last 30 days
#   --start DATE      Start date (YYYY-MM-DD)
#   --end DATE        End date (YYYY-MM-DD)
#
# Filter Options:
#   --user NAME       Filter by team member name
#   --summary         Show summary only (no individual logs)
#   --json            Output raw JSON instead of formatted
#
# Server Options:
#   --local           Use local dev server (localhost:3017)
#   --prod            Use production ROSA cluster (default)
#   --url URL         Use custom URL
#   --auth USER:PASS  Basic auth credentials (or set DASHBOARD_AUTH env var)
#
# Examples:
#   ./scripts/audit-report.sh                      # Today on ROSA
#   ./scripts/audit-report.sh --local --week       # Last week on localhost
#   ./scripts/audit-report.sh --user "Dave Taylor" # Filter by user
#   ./scripts/audit-report.sh --3weeks --summary   # 3 week summary
#
#   -h, --help        Show this help
#

set -e

# Default to production URL
BASE_URL="https://ocmui-team-dashboard-ocmui-dashboard.apps.rosa.c9a9m7g8h3p4x6t.rz7k.p3.openshiftapps.com"

# Defaults
START_DATE=""
END_DATE=""
USER_FILTER=""
SUMMARY_ONLY=false
JSON_OUTPUT=false
PERIOD="today"
AUTH_CREDS="${DASHBOARD_AUTH:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --today)
      PERIOD="today"
      shift
      ;;
    --yesterday)
      PERIOD="yesterday"
      shift
      ;;
    --week)
      PERIOD="week"
      shift
      ;;
    --2weeks)
      PERIOD="2weeks"
      shift
      ;;
    --3weeks)
      PERIOD="3weeks"
      shift
      ;;
    --month)
      PERIOD="month"
      shift
      ;;
    --start)
      START_DATE="$2"
      PERIOD="custom"
      shift 2
      ;;
    --end)
      END_DATE="$2"
      shift 2
      ;;
    --user)
      USER_FILTER="$2"
      shift 2
      ;;
    --summary)
      SUMMARY_ONLY=true
      shift
      ;;
    --json)
      JSON_OUTPUT=true
      shift
      ;;
    --local)
      BASE_URL="http://localhost:3017"
      shift
      ;;
    --prod)
      BASE_URL="https://ocmui-team-dashboard-ocmui-dashboard.apps.rosa.c9a9m7g8h3p4x6t.rz7k.p3.openshiftapps.com"
      shift
      ;;
    --url)
      BASE_URL="$2"
      shift 2
      ;;
    --auth)
      AUTH_CREDS="$2"
      shift 2
      ;;
    -h|--help)
      head -40 "$0" | tail -38
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Calculate date range based on period
case $PERIOD in
  today)
    START_DATE=$(date +%Y-%m-%d)
    END_DATE=$(date +%Y-%m-%d)
    PERIOD_DESC="Today ($(date +%Y-%m-%d))"
    ;;
  yesterday)
    START_DATE=$(date -v-1d +%Y-%m-%d 2>/dev/null || date -d "yesterday" +%Y-%m-%d)
    END_DATE=$START_DATE
    PERIOD_DESC="Yesterday ($START_DATE)"
    ;;
  week)
    START_DATE=$(date -v-7d +%Y-%m-%d 2>/dev/null || date -d "7 days ago" +%Y-%m-%d)
    END_DATE=$(date +%Y-%m-%d)
    PERIOD_DESC="Last 7 days ($START_DATE to $END_DATE)"
    ;;
  2weeks)
    START_DATE=$(date -v-14d +%Y-%m-%d 2>/dev/null || date -d "14 days ago" +%Y-%m-%d)
    END_DATE=$(date +%Y-%m-%d)
    PERIOD_DESC="Last 14 days ($START_DATE to $END_DATE)"
    ;;
  3weeks)
    START_DATE=$(date -v-21d +%Y-%m-%d 2>/dev/null || date -d "21 days ago" +%Y-%m-%d)
    END_DATE=$(date +%Y-%m-%d)
    PERIOD_DESC="Last 21 days ($START_DATE to $END_DATE)"
    ;;
  month)
    START_DATE=$(date -v-30d +%Y-%m-%d 2>/dev/null || date -d "30 days ago" +%Y-%m-%d)
    END_DATE=$(date +%Y-%m-%d)
    PERIOD_DESC="Last 30 days ($START_DATE to $END_DATE)"
    ;;
  custom)
    if [ -z "$END_DATE" ]; then
      END_DATE=$(date +%Y-%m-%d)
    fi
    PERIOD_DESC="Custom range ($START_DATE to $END_DATE)"
    ;;
esac

# Build query string
QUERY="startDate=${START_DATE}&endDate=${END_DATE}&limit=10000"
if [ -n "$USER_FILTER" ]; then
  QUERY="${QUERY}&user=$(echo "$USER_FILTER" | sed 's/ /%20/g')"
fi

# Function to format JSON nicely
format_json() {
  if command -v jq &> /dev/null; then
    jq "$@"
  elif command -v python3 &> /dev/null; then
    python3 -m json.tool
  else
    cat
  fi
}

# Build curl auth options
CURL_OPTS="-s"
if [ -n "$AUTH_CREDS" ]; then
  CURL_OPTS="$CURL_OPTS -u $AUTH_CREDS"
fi

# Fetch the data
STATS_RESPONSE=$(curl $CURL_OPTS "${BASE_URL}/api/audit/stats")
LOGS_RESPONSE=$(curl $CURL_OPTS "${BASE_URL}/api/audit/logs?${QUERY}")
USERS_RESPONSE=$(curl $CURL_OPTS "${BASE_URL}/api/audit/users")

# Check for errors
if echo "$STATS_RESPONSE" | grep -q '"error"'; then
  echo -e "${RED}Error fetching stats:${NC}"
  echo "$STATS_RESPONSE" | format_json
  exit 1
fi

# Raw JSON output mode
if [ "$JSON_OUTPUT" = true ]; then
  echo "{"
  echo '  "period": "'"$PERIOD_DESC"'",'
  echo '  "stats": '"$STATS_RESPONSE"','
  echo '  "users": '"$USERS_RESPONSE"','
  echo '  "logs": '"$LOGS_RESPONSE"
  echo "}"
  exit 0
fi

# Pretty output
echo ""
echo -e "${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║         OCMUI Team Dashboard - Audit Report                    ║${NC}"
echo -e "${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}Period:${NC} $PERIOD_DESC"
if [ -n "$USER_FILTER" ]; then
  echo -e "${CYAN}User Filter:${NC} $USER_FILTER"
fi
echo -e "${CYAN}Source:${NC} $BASE_URL"
echo ""

# Summary stats
echo -e "${BOLD}━━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
TOTAL_REQUESTS=$(echo "$STATS_RESPONSE" | format_json -r '.summary.totalRequests // 0' 2>/dev/null || echo "?")
UNIQUE_USERS=$(echo "$STATS_RESPONSE" | format_json -r '.summary.uniqueUsers // 0' 2>/dev/null || echo "?")
TEAM_MEMBERS=$(echo "$STATS_RESPONSE" | format_json -r '.summary.teamMembersActive // 0' 2>/dev/null || echo "?")
LOG_SIZE=$(echo "$STATS_RESPONSE" | format_json -r '.summary.logFileSize // "unknown"' 2>/dev/null || echo "?")

echo -e "  Total Requests (all time):  ${GREEN}$TOTAL_REQUESTS${NC}"
echo -e "  Unique Users (all time):    ${GREEN}$UNIQUE_USERS${NC}"
echo -e "  Team Members Active:        ${GREEN}$TEAM_MEMBERS${NC}"
echo -e "  Log File Size:              $LOG_SIZE"
echo ""

# Logs for the period
PERIOD_TOTAL=$(echo "$LOGS_RESPONSE" | format_json -r '.total // 0' 2>/dev/null || echo "0")
echo -e "${BOLD}━━━ Activity in Period ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Requests in period:         ${GREEN}$PERIOD_TOTAL${NC}"
echo ""

# Users breakdown
echo -e "${BOLD}━━━ Active Users ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
printf "  ${BOLD}%-25s %10s %12s   %-20s${NC}\n" "USER" "REQUESTS" "TEAM MEMBER" "LAST SEEN"
printf "  %-25s %10s %12s   %-20s\n" "-------------------------" "----------" "------------" "--------------------"

# Parse users and display
echo "$USERS_RESPONSE" | format_json -r '.users[] | "\(.name)|\(.requestCount)|\(.isTeamMember)|\(.lastSeen)"' 2>/dev/null | while IFS='|' read -r name count is_team last_seen; do
  if [ "$is_team" = "true" ]; then
    team_badge="${GREEN}Yes${NC}"
  else
    team_badge="${YELLOW}No${NC}"
  fi
  last_seen_short=$(echo "$last_seen" | cut -c1-16 | tr 'T' ' ')
  printf "  %-25s %10s %12b   %-20s\n" "$name" "$count" "$team_badge" "$last_seen_short"
done

echo ""

# Top endpoints
echo -e "${BOLD}━━━ Top Endpoints ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
printf "  ${BOLD}%-45s %10s${NC}\n" "ENDPOINT" "HITS"
printf "  %-45s %10s\n" "---------------------------------------------" "----------"

echo "$STATS_RESPONSE" | format_json -r '.topEndpoints[:10][] | "\(.path)|\(.count)"' 2>/dev/null | while IFS='|' read -r path count; do
  printf "  %-45s %10s\n" "$path" "$count"
done

echo ""

# Recent logs (unless summary only)
if [ "$SUMMARY_ONLY" = false ] && [ "$PERIOD_TOTAL" != "0" ]; then
  echo -e "${BOLD}━━━ Recent Activity (last 20) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  printf "  ${BOLD}%-20s %-6s %-30s %-20s${NC}\n" "TIMESTAMP" "METHOD" "PATH" "USER"
  printf "  %-20s %-6s %-30s %-20s\n" "--------------------" "------" "------------------------------" "--------------------"
  
  echo "$LOGS_RESPONSE" | format_json -r '.logs[:20][] | "\(.timestamp)|\(.method)|\(.path)|\(.teamMember // .authUser // "anonymous")"' 2>/dev/null | while IFS='|' read -r ts method path user; do
    ts_short=$(echo "$ts" | cut -c1-19 | tr 'T' ' ')
    path_short=$(echo "$path" | cut -c1-30)
    user_short=$(echo "$user" | cut -c1-20)
    printf "  %-20s %-6s %-30s %-20s\n" "$ts_short" "$method" "$path_short" "$user_short"
  done
  
  echo ""
fi

echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
