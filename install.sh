#!/bin/bash
# LAN Cert Manager - Installer
# Richtet Systemd-Service ein und startet den Manager automatisch beim Boot
# Aufruf: sudo bash install.sh

set -e

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# Root-Check
[ "$(id -u)" -ne 0 ] && err "Bitte als root ausführen: sudo bash install.sh"

INSTALL_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_FILE="/etc/systemd/system/lan-cert-manager.service"
SERVICE_USER="root"

# Node.js finden (nvm oder System)
NODE_BIN=""
NPM_BIN=""

# nvm für root
if [ -s "/root/.nvm/nvm.sh" ]; then
    export NVM_DIR="/root/.nvm"
    source "$NVM_DIR/nvm.sh"
    NODE_BIN="$(which node 2>/dev/null)"
    NPM_BIN="$(which npm 2>/dev/null)"
fi

# Fallback: System-Node
if [ -z "$NODE_BIN" ]; then
    NODE_BIN="$(which node 2>/dev/null || which nodejs 2>/dev/null)"
    NPM_BIN="$(which npm 2>/dev/null)"
fi

[ -z "$NODE_BIN" ] && err "Node.js nicht gefunden! Bitte installieren: https://nodejs.org"
[ -z "$NPM_BIN" ] && err "npm nicht gefunden!"

NODE_VERSION=$("$NODE_BIN" --version)
log "Node.js gefunden: $NODE_BIN ($NODE_VERSION)"

# Dependencies installieren
log "Backend-Dependencies installieren..."
cd "$INSTALL_DIR"
"$NPM_BIN" install --production 2>&1 | tail -3

# UI bauen (falls ui/ vorhanden und noch nicht gebaut)
if [ -d "$INSTALL_DIR/ui" ] && [ ! -d "$INSTALL_DIR/ui/dist" ]; then
    log "Frontend bauen..."
    cd "$INSTALL_DIR/ui"
    "$NPM_BIN" install 2>&1 | tail -3
    "$NPM_BIN" run build 2>&1 | tail -5
    cd "$INSTALL_DIR"
elif [ -d "$INSTALL_DIR/ui/dist" ]; then
    log "Frontend bereits gebaut, überspringe."
fi

# Daten-Verzeichnisse anlegen
mkdir -p "$INSTALL_DIR/data/ca" "$INSTALL_DIR/data/certs"
log "Daten-Verzeichnisse: $INSTALL_DIR/data/"

# Systemd-Service schreiben
log "Systemd-Service einrichten..."
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=LAN Cert Manager (DNS + CA + Web-GUI)
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$NODE_BIN $INSTALL_DIR/src/server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=lan-cert-manager

# Umgebungsvariablen (anpassen nach Bedarf)
Environment=NODE_ENV=production
Environment=WEB_PORT=3000
Environment=HTTPS_PORT=3443
Environment=DNS_PORT=5353
Environment=DATA_DIR=$INSTALL_DIR/data
# Für Port 53 (System-DNS): DNS_PORT=53 und AmbientCapabilities=CAP_NET_BIND_SERVICE

[Install]
WantedBy=multi-user.target
EOF

log "Service-Datei geschrieben: $SERVICE_FILE"

# systemd neu laden und Service aktivieren
systemctl daemon-reload
systemctl enable lan-cert-manager
systemctl restart lan-cert-manager

sleep 2
STATUS=$(systemctl is-active lan-cert-manager)
if [ "$STATUS" = "active" ]; then
    log "Service läuft! Status: $STATUS"
    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}  LAN Cert Manager erfolgreich installiert!${NC}"
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    # IP ermitteln
    HOST_IP=$(hostname -I | awk '{print $1}')
    echo -e "  Web-GUI:  ${YELLOW}http://$HOST_IP:3000${NC}"
    echo -e "  DNS-Port: ${YELLOW}$HOST_IP:5353${NC}"
    echo ""
    echo -e "  Logs:     journalctl -u lan-cert-manager -f"
    echo -e "  Status:   systemctl status lan-cert-manager"
    echo ""
else
    err "Service ist nicht aktiv! Status: $STATUS\nLogs: journalctl -u lan-cert-manager -n 20"
fi
