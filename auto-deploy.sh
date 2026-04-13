#!/bin/bash
# SnapCard Backend Auto-Deploy
# Checks for new commits on main that touch backend/ and deploys to Railway
# Runs via LaunchAgent every 5 minutes, zero LLM token cost

set -euo pipefail

REPO_DIR="$HOME/.openclaw/workspace/cardlist"
LOG_FILE="$HOME/.openclaw/workspace/cardlist/auto-deploy.log"
STATE_FILE="$HOME/.openclaw/workspace/cardlist/.auto-deploy-last-sha"

log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG_FILE"; }

cd "$REPO_DIR"

# Fetch latest
git fetch origin main 2>/dev/null || { log "ERROR: git fetch failed"; exit 1; }

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

# Check if there's anything new
if [ "$LOCAL" = "$REMOTE" ]; then
    exit 0
fi

# Check if backend/ changed
if git diff --name-only "$LOCAL" "$REMOTE" | grep -q '^backend/'; then
    log "New commits detected ($LOCAL..$REMOTE), backend/ changed — deploying"
    git pull 2>&1 >> "$LOG_FILE" || { log "ERROR: git pull failed"; exit 1; }
    cd backend
    railway up 2>&1 >> "$LOG_FILE" || { log "ERROR: railway up failed"; exit 1; }
    log "Deploy triggered successfully"
    echo "$REMOTE" > "$STATE_FILE"
else
    log "New commits ($LOCAL..$REMOTE) but backend/ unchanged — pulling only"
    git pull 2>&1 >> "$LOG_FILE"
    echo "$REMOTE" > "$STATE_FILE"
fi