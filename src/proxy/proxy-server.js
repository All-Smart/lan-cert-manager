/**
 * @module proxy-server
 * @description SNI-based HTTPS reverse proxy — routes by hostname to internal targets
 */

const https = require('https');
const http = require('http');
const httpProxy = require('http-proxy');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../db/database');

let server = null;
let running = false;

/**
 * Load TLS credentials for a given cert record
 */
function loadCertContext(certId) {
  const certDir = path.join(config.certsDir, certId);
  const certFile = path.join(certDir, 'fullchain.pem');
  const keyFile = path.join(certDir, 'key.pem');
  if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) return null;
  return tls.createSecureContext({
    cert: fs.readFileSync(certFile),
    key: fs.readFileSync(keyFile),
  });
}

/**
 * Build SNI callback — picks the right cert based on hostname
 */
function findCertForHostname(hostname) {
  // 1. Check proxy route for explicit cert_id
  const routes = db.proxy.getEnabled();
  const route = routes.find(r => r.hostname === hostname);
  if (route && route.cert_id) {
    const ctx = loadCertContext(route.cert_id);
    if (ctx) return ctx;
  }

  // 2. Find cert by common_name or SAN
  const certs = db.certs.getAll().filter(c => c.status === 'active');
  for (const cert of certs) {
    const sans = JSON.parse(cert.san_dns || '[]');
    const names = [cert.common_name, ...sans];
    const matches = names.some(n => {
      if (n === hostname) return true;
      // Wildcard match: *.iobroker.home matches admin.iobroker.home
      if (n.startsWith('*.')) {
        const base = n.slice(2);
        return hostname.endsWith('.' + base) || hostname === base;
      }
      return false;
    });
    if (matches) {
      const ctx = loadCertContext(cert.id);
      if (ctx) return ctx;
    }
  }

  return null;
}

function buildSniCallback() {
  return (serverName, cb) => {
    const ctx = findCertForHostname(serverName);
    if (ctx) return cb(null, ctx);
    // Fallback: LAN Cert Manager self-cert
    const selfCtx = loadCertContext('lan-cert-manager-self');
    cb(null, selfCtx);
  };
}

function start() {
  return new Promise((resolve, reject) => {
    if (running) return resolve();

    const proxy = httpProxy.createProxyServer({
      secure: false, // allow self-signed certs on targets
      changeOrigin: true,
    });

    proxy.on('error', (err, req, res) => {
      console.error(`Proxy error for ${req.headers.host}: ${err.message}`);
      if (res && !res.headersSent) {
        res.writeHead(502);
        res.end(`Bad Gateway: ${err.message}`);
      }
    });

    // Dummy default cert (needed for https.createServer)
    const selfCertDir = path.join(config.certsDir, 'lan-cert-manager-self');
    const defaultCert = path.join(selfCertDir, 'fullchain.pem');
    const defaultKey = path.join(selfCertDir, 'key.pem');

    if (!fs.existsSync(defaultCert)) {
      return reject(new Error('Self-cert not found — start LAN Cert Manager HTTPS first'));
    }

    const tlsOptions = {
      cert: fs.readFileSync(defaultCert),
      key: fs.readFileSync(defaultKey),
      SNICallback: buildSniCallback(),
    };

    server = https.createServer(tlsOptions, (req, res) => {
      const hostname = (req.headers.host || '').split(':')[0];
      const routes = db.proxy.getEnabled();
      const route = routes.find(r => r.hostname === hostname);

      if (!route) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`No proxy route configured for: ${hostname}`);
        return;
      }

      console.log(`[proxy] ${hostname} → ${route.target}`);
      proxy.web(req, res, { target: route.target });
    });

    // Also handle WebSocket upgrades
    server.on('upgrade', (req, socket, head) => {
      const hostname = (req.headers.host || '').split(':')[0];
      const routes = db.proxy.getEnabled();
      const route = routes.find(r => r.hostname === hostname);
      if (route) proxy.ws(req, socket, head, { target: route.target });
    });

    server.on('error', (err) => {
      console.error('Proxy server error:', err);
      if (!running) reject(err);
    });

    server.listen(config.proxyPort, '0.0.0.0', () => {
      running = true;
      console.log(`Reverse proxy running on port ${config.proxyPort}`);
      resolve();
    });
  });
}

function stop() {
  if (server && running) {
    server.close();
    running = false;
  }
}

function reload() {
  // Routes are read from DB on each request — nothing to do
  console.log('Proxy routes reloaded');
}

function getStatus() {
  return { running, port: config.proxyPort, routes: db.proxy.getEnabled().length };
}

module.exports = { start, stop, reload, getStatus };
