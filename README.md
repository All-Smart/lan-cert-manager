# 🔐 LAN Cert Manager

All-in-One Tool für lokale Netzwerke: **DNS-Server** + **eigene Root-CA** + **Zertifikatsverwaltung**, steuerbar über eine moderne **Web-GUI**.

Perfekt für Smart-Home-User, ioBroker-Nutzer und Entwickler, die HTTPS im LAN brauchen (z.B. für WebAuthn, Service Workers, etc.).

![Node.js](https://img.shields.io/badge/Node.js-22+-green) ![License](https://img.shields.io/badge/License-MIT-blue)

## ✨ Features

### DNS-Server
- Leichtgewichtiger DNS-Server für lokale Domains (`iobroker.lan`, `nas.home`)
- A, AAAA, CNAME Records
- Upstream-Forwarding (Google DNS, Cloudflare, etc.)
- Start/Stop über die GUI

### Root CA
- Eigene Certificate Authority mit einem Klick erstellen
- CA-Zertifikat downloaden (PEM/DER)
- QR-Code für einfache Installation auf Mobilgeräten
- Optionale Passphrase-Verschlüsselung

### Zertifikatsverwaltung
- Zertifikate per Klick generieren
- SAN: DNS-Namen + IP-Adressen
- Wildcard-Zertifikate (`*.iobroker.lan`)
- Export: PEM, Key, Chain, Fullchain, PKCS12
- Automatische Erneuerung vor Ablauf
- Revoke & Delete

### Web-GUI
- Dark Mode, responsive (Material UI)
- Dashboard mit Übersicht
- DNS-Manager: Records CRUD + Server-Kontrolle
- Zertifikats-Manager: Erstellen, Download, Renew, Revoke
- CA-Setup mit QR-Code
- Settings

## 🚀 Quick Start

### Empfohlen: Installer (mit Systemd-Autostart)

```bash
# Repo klonen
git clone https://github.com/youruser/lan-cert-manager.git
cd lan-cert-manager

# Installer ausführen (root erforderlich)
sudo bash install.sh
```

Der Installer:
- Findet Node.js automatisch (nvm oder System)
- Installiert alle Dependencies
- Baut das Frontend (falls noch nicht gebaut)
- Richtet einen Systemd-Service ein (`lan-cert-manager.service`)
- Aktiviert Autostart beim Boot
- Startet den Service sofort

Web-GUI öffnen: **http://\<server-ip\>:3000**

**Service-Verwaltung:**
```bash
systemctl status lan-cert-manager
systemctl restart lan-cert-manager
journalctl -u lan-cert-manager -f
```

---

### Manuell (ohne Autostart)

```bash
cd lan-cert-manager
npm run setup  # Dependencies + Frontend bauen
npm start
```

### Erster Start
1. Öffne **CA Setup** → Root CA erstellen
2. CA-Zertifikat downloaden & auf Geräten installieren
3. DNS-Records anlegen (z.B. `iobroker.lan → 192.168.1.100`)
4. Zertifikate für deine Services erstellen

## 🐳 Docker

```bash
docker build -t lan-cert-manager -f docker/Dockerfile .
docker run -d \
  -p 3000:3000 \
  -p 3443:3443 \
  -p 443:443 \
  -p 53:5353/udp \
  -v lan-cert-data:/app/data \
  --name lan-cert-manager \
  lan-cert-manager
```

> **Hinweis DNS:** Der Container läuft intern auf Port 5353, wird aber via `-p 53:5353/udp` auf dem Host als Port 53 erreichbar gemacht. So sind keine Root-Rechte im Container nötig.
>
> **Hinweis systemd-resolved:** Auf Ubuntu/Debian-Hosts blockiert `systemd-resolved` standardmäßig Port 53. Vor dem Start:
> ```bash
> sudo mkdir -p /etc/systemd/resolved.conf.d
> echo -e "[Resolve]\nDNSStubListener=no" | sudo tee /etc/systemd/resolved.conf.d/no-stub.conf
> sudo systemctl restart systemd-resolved
> ```

## ⚙️ Konfiguration

Über Umgebungsvariablen:

| Variable | Default | Beschreibung |
|----------|---------|-------------|
| `WEB_PORT` | `3000` | Web-GUI Port |
| `DNS_PORT` | `5353` | DNS Server Port |
| `UPSTREAM_DNS` | `8.8.8.8,1.1.1.1` | Upstream DNS Server |
| `DEFAULT_ZONE` | `lan` | Standard-DNS-Zone |
| `CA_VALIDITY_YEARS` | `10` | CA Gültigkeit |
| `CERT_VALIDITY_DAYS` | `365` | Zertifikat-Gültigkeit |
| `CERT_RENEW_BEFORE_DAYS` | `30` | Auto-Renewal Vorlauf |
| `DATA_DIR` | `./data` | Datenverzeichnis |

## 📡 REST API

### 🔐 Authentifizierung

Alle API-Endpunkte (außer den unten aufgeführten) erfordern eine aktive Session. Die Session wird via Cookie (`connect.sid`) verwaltet.

**Öffentliche Endpunkte (kein Login nötig):**
- `GET /api/auth/status`
- `POST /api/auth/login`
- `GET /api/version`
- `GET /api/passkeys/available`
- `POST /api/passkeys/auth/options`
- `POST /api/passkeys/auth/verify`

#### Login mit Passwort

```bash
# Login — Cookie in Datei speichern
curl -c cookies.txt -X POST http://lan-cert-manager.home:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password": "dein-passwort"}'

# Antwort bei Erfolg:
# {"success": true}

# Folgeaufrufe mit Cookie
curl -b cookies.txt http://lan-cert-manager.home:3000/api/dns
```

#### Login-Status prüfen

```bash
curl http://lan-cert-manager.home:3000/api/auth/status
# {"authenticated": false, "hasPassword": true}
```

#### Logout

```bash
curl -b cookies.txt -X POST http://lan-cert-manager.home:3000/api/auth/logout
```

#### Passwort setzen / ändern (erfordert aktive Session)

```bash
curl -b cookies.txt -X POST http://lan-cert-manager.home:3000/api/auth/password \
  -H "Content-Type: application/json" \
  -d '{"password": "neues-passwort"}'
```

#### Beispiel: Vollständiger API-Workflow

```bash
# 1. Login
curl -c /tmp/lcm.jar -X POST https://lan-cert-manager.home:3443/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"geheim"}' -k

# 2. DNS-Records abrufen
curl -b /tmp/lcm.jar https://lan-cert-manager.home:3443/api/dns -k

# 3. DNS-Record erstellen
curl -b /tmp/lcm.jar -X POST https://lan-cert-manager.home:3443/api/dns \
  -H "Content-Type: application/json" \
  -d '{"name":"meinserver.home","type":"A","value":"192.168.0.50","ttl":300}' -k

# 4. Zertifikat erstellen
curl -b /tmp/lcm.jar -X POST https://lan-cert-manager.home:3443/api/certs \
  -H "Content-Type: application/json" \
  -d '{"commonName":"meinserver.home","sanDns":["meinserver.home"],"sanIps":["192.168.0.50"]}' -k
```

> **Hinweis:** Für HTTPS-Endpunkte `-k` verwenden bis das CA-Zertifikat im System installiert ist. Danach kann `-k` weggelassen werden.

---

### CA
- `GET /api/ca/status` — CA-Status
- `POST /api/ca/init` — Root CA erstellen
- `GET /api/ca/cert` — CA-Zertifikat (PEM)
- `GET /api/ca/cert/der` — CA-Zertifikat (DER)
- `GET /api/ca/qrcode` — QR-Code für CA-Download

### DNS
- `GET /api/dns` — Alle Records
- `POST /api/dns` — Record erstellen `{ name, type, value, ttl }`
- `PUT /api/dns/:id` — Record bearbeiten
- `DELETE /api/dns/:id` — Record löschen
- `GET /api/dns/status` — DNS-Server Status
- `POST /api/dns/server/start` — DNS-Server starten
- `POST /api/dns/server/stop` — DNS-Server stoppen

### Zertifikate
- `GET /api/certs` — Alle Zertifikate
- `POST /api/certs` — Zertifikat erstellen `{ commonName, sanDns[], sanIps[] }`
- `GET /api/certs/:id/download/:format` — Download (pem/key/chain/fullchain/p12)
- `POST /api/certs/:id/renew` — Erneuern
- `POST /api/certs/:id/revoke` — Widerrufen
- `DELETE /api/certs/:id` — Löschen

### Settings
- `GET /api/settings` — Einstellungen laden
- `PUT /api/settings` — Einstellungen speichern

## 🔧 CA-Zertifikat installieren

Das CA-Zertifikat herunterladen: Web-GUI öffnen → **CA Setup** → **Download PEM** (für Desktop) oder **Download DER / QR-Code** (für Mobilgeräte).

---

### Windows

1. CA-Zertifikat als `.crt` herunterladen (PEM-Format)
2. Doppelklick auf die Datei → "Zertifikat installieren"
3. Speicherort: **"Lokaler Computer"** → Weiter
4. **"Alle Zertifikate im folgenden Speicher speichern"** auswählen
5. Durchsuchen → **"Vertrauenswürdige Stammzertifizierungsstellen"** → OK
6. Fertig stellen → Sicherheitswarnung mit **Ja** bestätigen
7. Browser neu starten

---

### macOS

1. CA-Zertifikat als `.crt` herunterladen
2. Doppelklick → öffnet die **Schlüsselbundverwaltung**
3. Zertifikat erscheint unter **"System"** oder **"Anmeldung"** (mit rotem X)
4. Doppelklick auf das Zertifikat → **"Vertrauen"** aufklappen
5. Bei **"Bei Verwendung dieses Zertifikats"** → **"Immer vertrauen"** wählen
6. Fenster schließen → Passwort bestätigen
7. Browser neu starten

---

### Linux (Debian/Ubuntu)

```bash
# PEM-Datei herunterladen, dann:
sudo cp lan-root-ca.crt /usr/local/share/ca-certificates/lan-root-ca.crt
sudo update-ca-certificates
```

Für curl/wget direkt nutzbar. Browser (außer Firefox) übernehmen das System-Zertifikat automatisch.

**Fedora/RHEL/CentOS:**
```bash
sudo cp lan-root-ca.crt /etc/pki/ca-trust/source/anchors/
sudo update-ca-trust
```

---

### iOS (iPhone/iPad)

1. DER-Zertifikat herunterladen (oder QR-Code scannen)
2. **Einstellungen** → oben erscheint **"Profil geladen"** → Antippen
3. **"Installieren"** → Gerätecode eingeben → nochmals **"Installieren"**
4. Profil ist installiert, aber noch nicht vertraut:
5. **Einstellungen** → **Allgemein** → **Info** → **Zertifikatsvertrauenseinstellungen**
6. Schalter beim CA-Zertifikat aktivieren → **Weiter** bestätigen

---

### Android

1. DER-Zertifikat herunterladen (oder QR-Code scannen)
2. **Einstellungen** → **Sicherheit & Datenschutz** → **Weitere Sicherheitseinstellungen**
3. **"Von Gerätespeicher installieren"** → heruntergeladene Datei auswählen
4. Namen vergeben (z.B. `LAN Root CA`) → **"VPN und Apps"** oder **"CA-Zertifikat"** wählen
5. Sicherheitswarnung mit **"Trotzdem installieren"** bestätigen

> ⚠️ Menüpfad variiert je nach Hersteller (Samsung: Biometrie & Sicherheit → Weitere Sicherheitseinstellungen)

---

### Browser: Firefox

Firefox nutzt einen **eigenen Zertifikatsspeicher** — das System-Zertifikat wird nicht automatisch übernommen.

1. Firefox öffnen → **Einstellungen** (☰) → **Datenschutz & Sicherheit**
2. Ganz nach unten scrollen → **"Zertifikate anzeigen"**
3. Tab **"Zertifizierungsstellen"** → **"Importieren"**
4. CA-Zertifikat auswählen
5. Haken bei **"Dieser CA vertrauen, um Websites zu identifizieren"** → OK
6. Firefox neu starten

## 🏗️ Projektstruktur

```
lan-cert-manager/
├── src/
│   ├── server.js          # Express Server + API
│   ├── config.js           # Konfiguration
│   ├── dns/dns-server.js   # DNS Server (dns2)
│   ├── ca/ca-manager.js    # Root-CA Verwaltung
│   ├── ca/cert-manager.js  # Zertifikat-Verwaltung
│   ├── db/database.js      # SQLite Datenbank
│   └── api/                # REST API Routes
├── ui/                     # React Frontend (Vite + MUI)
├── data/                   # Runtime-Daten (gitignored)
└── docker/                 # Docker Setup
```

## 📋 Tech-Stack

- **Backend:** Node.js + Express
- **DNS:** dns2 (lightweight DNS server)
- **Crypto:** node-forge (X.509 Zertifikate)
- **Frontend:** React 18 + Material UI 6 + Vite
- **Datenbank:** SQLite (better-sqlite3)
- **QR-Code:** qrcode

## 📄 Lizenz

MIT
