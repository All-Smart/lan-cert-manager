/**
 * @module server
 * @description Main Express server with API routes and static file serving
 */

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const db = require('./db/database');
const dnsServer = require('./dns/dns-server');
const certManager = require('./ca/cert-manager');
const caManager = require('./ca/ca-manager');
const { requireAuth } = require('./auth');
const proxyServer = require('./proxy/proxy-server');

// Initialize database
db.init();
console.log('Database initialized');

// Ensure data directories exist
[config.caDir, config.certsDir].forEach(dir => fs.mkdirSync(dir, { recursive: true }));

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }, // 24h
}));
// Auth middleware — applied globally, checks originalUrl
app.use(requireAuth);
app.use('/api/auth', require('./api/auth-routes'));

// Version
app.get('/api/version', (req, res) => {
  const { version } = require('../package.json');
  res.json({ version });
});

// API routes
app.use('/api/dns', require('./api/dns-routes'));
app.use('/api/ca', require('./api/ca-routes'));
app.use('/api/certs', require('./api/cert-routes'));
app.use('/api/integrations', require('./api/integration-routes'));
app.use('/api/passkeys', require('./api/passkey-routes'));
app.use('/api/proxy', require('./api/proxy-routes'));

// Settings API
app.get('/api/settings', (req, res) => {
  const settings = db.settings.getAll();
  res.json({
    ...settings,
    dnsPort: config.dnsPort,
    webPort: config.webPort,
    upstreamDns: settings.upstreamDns || config.upstreamDns.join(','),
    defaultZone: settings.defaultZone || config.defaultZone,
    certValidityDays: settings.certValidityDays || String(config.cert.validityDays),
    renewBeforeDays: settings.renewBeforeDays || String(config.cert.renewBeforeDays),
    renewalCheckInterval: settings.renewalCheckInterval || String(config.renewalCheckInterval),
  });
});

app.put('/api/settings', (req, res) => {
  try {
    const allowed = ['upstreamDns', 'defaultZone', 'certValidityDays', 'renewBeforeDays', 'renewalCheckInterval'];
    for (const [key, value] of Object.entries(req.body)) {
      if (allowed.includes(key)) {
        db.settings.set(key, value);
      }
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard stats
app.get('/api/dashboard', (req, res) => {
  try {
    const certs = db.certs.getAll();
    const dnsRecords = db.dns.getAll();
    const caStatus = db.ca.get();
    const now = new Date();

    const activeCerts = certs.filter(c => c.status === 'active');
    const expiringSoon = activeCerts.filter(c => {
      const exp = new Date(c.expires_at);
      const diff = (exp - now) / (1000 * 60 * 60 * 24);
      return diff <= 30 && diff > 0;
    });
    const expired = activeCerts.filter(c => new Date(c.expires_at) <= now);

    res.json({
      ca: { initialized: caStatus?.initialized === 1, ...caStatus },
      dns: { total: dnsRecords.length, enabled: dnsRecords.filter(r => r.enabled).length, server: dnsServer.getStatus() },
      certs: { total: certs.length, active: activeCerts.length, expiringSoon: expiringSoon.length, expired: expired.length },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve React frontend (production build)
const uiBuildPath = path.join(__dirname, '..', 'ui', 'dist');
if (fs.existsSync(uiBuildPath)) {
  app.use(express.static(uiBuildPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(uiBuildPath, 'index.html'));
    }
  });
}

async function startServers() {
  // Always start HTTP (for redirect + initial access)
  http.createServer(app).listen(config.webPort, '0.0.0.0', () => {
    console.log(`Web server running on http://0.0.0.0:${config.webPort}`);
  });

  // Start HTTPS if CA is initialized
  if (caManager.isInitialized()) {
    try {
      await startHttps();
    } catch (err) {
      console.warn(`HTTPS startup failed: ${err.message}`);
    }
    // Start reverse proxy
    try {
      await proxyServer.start();
    } catch (err) {
      console.warn(`Reverse proxy startup failed: ${err.message}`);
    }
  } else {
    console.log('CA not initialized — HTTPS will start automatically after CA setup');
  }

  // Auto-start DNS server
  try {
    await dnsServer.start();
  } catch (err) {
    console.warn(`DNS server failed to start: ${err.message}`);
  }

  // Auto-renewal check
  setInterval(() => {
    try {
      const renewed = certManager.checkAndRenew();
      if (renewed.length > 0) {
        console.log(`Auto-renewed ${renewed.length} certificate(s)`);
      }
    } catch (err) {
      console.error('Auto-renewal check failed:', err.message);
    }
  }, config.renewalCheckInterval * 60 * 1000);
}

/**
 * Register LAN Cert Manager's own DNS record and ensure HTTPS cert covers the hostname
 */
function ensureSelfDnsRecord(ips) {
  const defaultZone = db.settings.get('defaultZone') || config.defaultZone;
  const hostname = `lan-cert-manager.${defaultZone}`;

  // Pick first non-loopback IP
  const ip = ips[0];
  if (!ip) return hostname;

  // Check if record already exists
  const existing = db.dns.getAll().find(r => r.name === hostname && r.type === 'A');
  if (!existing) {
    try {
      db.dns.create({ name: hostname, type: 'A', value: ip, ttl: 300 });
      console.log(`DNS self-record created: ${hostname} → ${ip}`);
    } catch (e) {
      console.warn(`DNS self-record skipped: ${e.message}`);
    }
  } else if (existing.value !== ip) {
    // Update IP if it changed
    db.dns.update(existing.id, { value: ip });
    console.log(`DNS self-record updated: ${hostname} → ${ip}`);
  }

  return hostname;
}

/**
 * Ensure a self-signed cert for LAN Cert Manager exists and start HTTPS
 */
async function startHttps() {
  const selfCertId = 'lan-cert-manager-self';
  const selfCertDir = path.join(config.certsDir, selfCertId);
  const certFile = path.join(selfCertDir, 'fullchain.pem');
  const keyFile = path.join(selfCertDir, 'key.pem');

  const { networkInterfaces, hostname: getHostname } = require('os');
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter(i => i && i.family === 'IPv4' && !i.internal)
    .map(i => i.address);

  // Register own DNS record and get the hostname
  const selfHostname = ensureSelfDnsRecord(ips);

  // Create self cert if it doesn't exist yet
  if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) {
    const osHostname = getHostname();
    console.log(`Creating HTTPS certificate for LAN Cert Manager (${selfHostname}, IPs: ${ips.join(', ')})`);
    const existing = db.certs.getAll().find(c => c.id === selfCertId);
    if (!existing) {
      certManager.createCertificate({
        id: selfCertId,
        commonName: selfHostname,
        sanDns: [selfHostname, osHostname, 'localhost', 'lan-cert-manager'],
        sanIps: ['127.0.0.1', ...ips],
      });
    }
  }

  if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) {
    throw new Error('Self-cert files not found after creation');
  }

  const httpsOptions = {
    cert: fs.readFileSync(certFile),
    key: fs.readFileSync(keyFile),
  };

  https.createServer(httpsOptions, app).listen(config.httpsPort, '0.0.0.0', () => {
    console.log(`HTTPS server running on https://${selfHostname}:${config.httpsPort}`);
  });
}

// Export startHttps so CA setup can trigger it
module.exports = { startHttps };

startServers();
