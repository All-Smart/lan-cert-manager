/**
 * @module integrations/proxmox
 * @description Proxmox VE integration — deploys certificates via Proxmox API
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const type = 'proxmox';
const label = 'Proxmox VE';
const description = 'Deploys certificates directly to a Proxmox VE node via API';

const configSchema = [
  { key: 'host',        label: 'Proxmox Host / IP',  type: 'text',     required: true,  placeholder: '192.168.0.100' },
  { key: 'port',        label: 'Port',               type: 'number',   required: false, default: '8006' },
  { key: 'node',        label: 'Node Name',          type: 'text',     required: true,  placeholder: 'pve', default: 'pve' },
  { key: 'tokenId',     label: 'API Token ID',       type: 'text',     required: true,  placeholder: 'root@pam!mytoken' },
  { key: 'tokenSecret', label: 'API Token Secret',   type: 'password', required: true  },
  { key: 'ignoreTls',   label: 'TLS-Fehler ignorieren (Self-Signed)', type: 'checkbox', required: false, default: 'true' },
];

/**
 * Make a request to the Proxmox API
 */
function apiRequest(cfg, method, endpoint, body = null) {
  return new Promise((resolve, reject) => {
    const port = parseInt(cfg.port || '8006', 10);

    // Proxmox API uses application/x-www-form-urlencoded for POST/PUT
    let bodyStr = null;
    if (body) {
      bodyStr = Object.entries(body)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    }

    const options = {
      hostname: cfg.host,
      port,
      path: `/api2/json${endpoint}`,
      method,
      headers: {
        'Authorization': `PVEAPIToken=${cfg.tokenId}=${cfg.tokenSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
      rejectUnauthorized: cfg.ignoreTls === 'false' ? true : false,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (!data || data.trim() === '') {
          if (res.statusCode >= 400) {
            reject(new Error(`Proxmox API ${res.statusCode}: empty response`));
          } else {
            resolve({ data: null });
          }
          return;
        }
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`Proxmox API ${res.statusCode}: ${json.errors ? JSON.stringify(json.errors) : (json.message || data)}`));
          } else {
            resolve(json);
          }
        } catch (e) {
          if (res.statusCode < 400) {
            resolve({ data: data.trim() });
          } else {
            reject(new Error(`Proxmox API ${res.statusCode}: ${data}`));
          }
        }
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/**
 * Load certificate files for a given cert record
 */
function loadCertFiles(certRecord) {
  const certDir = path.join(config.certsDir, certRecord.id);
  const pemPath = path.join(certDir, 'cert.pem');
  const keyPath = path.join(certDir, 'key.pem');

  if (!fs.existsSync(pemPath) || !fs.existsSync(keyPath)) {
    throw new Error(`Certificate files not found for ${certRecord.common_name}`);
  }

  return {
    certificate: fs.readFileSync(pemPath, 'utf8'),
    privateKey: fs.readFileSync(keyPath, 'utf8'),
  };
}

/**
 * Test connection to Proxmox
 */
async function test(cfg) {
  try {
    const result = await apiRequest(cfg, 'GET', `/nodes/${cfg.node}/status`);
    if (result.data) {
      return { ok: true, message: `Connected to node "${cfg.node}" (${result.data.pveversion || 'Proxmox VE'})` };
    }
    return { ok: false, error: 'Unexpected response from Proxmox API' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Deploy certificate to Proxmox node
 */
async function deploy(certRecord, cfg) {
  try {
    const { certificate, privateKey } = loadCertFiles(certRecord);

    await apiRequest(cfg, 'POST', `/nodes/${cfg.node}/certificates/custom`, {
      certificates: certificate,
      key: privateKey,
      force: 1,
      restart: 1,
    });

    return { ok: true, message: `Certificate deployed to Proxmox node "${cfg.node}"` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { type, label, description, configSchema, test, deploy };
