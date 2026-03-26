#!/bin/bash
# LAN Cert Manager - Deploy Pipeline
# Bumpt patch-Version, baut Frontend, deployt auf Container
# Aufruf: bash deploy.sh [host] [user] [password]
# Beispiel: bash deploy.sh 192.168.0.9 skeletor "meinpasswort"

set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_HOST="${1:-192.168.0.9}"
DEPLOY_USER="${2:-skeletor}"
DEPLOY_PASS="${3:-}"
REMOTE_DIR="/root/lan-cert-manager"

cd "$SCRIPT_DIR"

# --- 1. Version bumpen (patch) ---
OLD_VERSION=$(node -e "console.log(require('./package.json').version)")
NEW_VERSION=$(node -e "
  const v = '$OLD_VERSION'.split('.').map(Number);
  v[2]++;
  console.log(v.join('.'));
")

log "Version: $OLD_VERSION → $NEW_VERSION"

# package.json aktualisieren
node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$NEW_VERSION';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# --- 2. Frontend bauen ---
log "Frontend bauen..."
cd ui
npm run build 2>&1 | tail -5
cd "$SCRIPT_DIR"
log "Frontend gebaut (dist/)"

# --- 3. Git committen ---
git add package.json ui/src/ src/ install.sh deploy.sh README.md 2>/dev/null || true
git diff --cached --quiet || git commit -m "release: v$NEW_VERSION"
log "Committed: v$NEW_VERSION"

# --- 4. Auf Container deployen ---
if [ -z "$DEPLOY_PASS" ]; then
    warn "Kein Passwort angegeben — versuche Key-Auth oder SSH-Agent"
    SSH_CMD="ssh -o StrictHostKeyChecking=no"
    SCP_CMD="scp -o StrictHostKeyChecking=no"
else
    command -v sshpass >/dev/null 2>&1 || err "sshpass nicht installiert: sudo apt install sshpass"
    SSH_CMD="sshpass -p '$DEPLOY_PASS' ssh -o StrictHostKeyChecking=no"
    SCP_CMD="sshpass -p '$DEPLOY_PASS' scp -o StrictHostKeyChecking=no"
fi

log "Deploye auf $DEPLOY_USER@$DEPLOY_HOST:$REMOTE_DIR ..."

# Gesamtes src/ + package.json + dist hochladen
eval "$SCP_CMD -r src $DEPLOY_USER@$DEPLOY_HOST:/tmp/lcm_src"
eval "$SCP_CMD package.json $DEPLOY_USER@$DEPLOY_HOST:/tmp/lcm_package.json"
eval "$SCP_CMD -r ui/dist $DEPLOY_USER@$DEPLOY_HOST:/tmp/lcm_dist"

# Auf Remote anwenden
eval "$SSH_CMD $DEPLOY_USER@$DEPLOY_HOST" <<REMOTE
echo "$DEPLOY_PASS" | sudo -S bash -c "
  cp /tmp/lcm_package.json $REMOTE_DIR/package.json
  rm -rf $REMOTE_DIR/src
  cp -r /tmp/lcm_src $REMOTE_DIR/src
  rm -rf $REMOTE_DIR/ui/dist
  cp -r /tmp/lcm_dist $REMOTE_DIR/ui/dist
  rm -rf /tmp/lcm_*
  source /root/.nvm/nvm.sh && cd $REMOTE_DIR && npm install --production --silent
  systemctl restart lan-cert-manager
  sleep 2
  systemctl is-active lan-cert-manager
"
REMOTE

log "Service neugestartet"

# --- 5. Prüfen ---
sleep 1
DEPLOYED_VERSION=$(curl -s "http://$DEPLOY_HOST:3000/api/version" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).version));" 2>/dev/null || echo "?")

if [ "$DEPLOYED_VERSION" = "$NEW_VERSION" ]; then
    log "Version bestätigt: v$DEPLOYED_VERSION"
else
    warn "Deployed Version: $DEPLOYED_VERSION (erwartet: $NEW_VERSION)"
fi

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Deploy erfolgreich: v$NEW_VERSION${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  URL: ${YELLOW}http://$DEPLOY_HOST:3000${NC}"
echo ""
