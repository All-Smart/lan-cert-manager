/**
 * @module integrations/file-copy
 * @description Local file copy integration — copies cert/key to a local path and runs a reload command
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const type = 'file-copy';
const label = 'Lokaler Dateipfad';
const description = 'Kopiert Zertifikat und Key in einen lokalen Pfad und führt einen Reload-Befehl aus';

const configSchema = [
  { key: 'certPath',  label: 'Ziel-Pfad Zertifikat', type: 'text', required: true,  placeholder: '/etc/nginx/ssl/server.crt' },
  { key: 'keyPath',   label: 'Ziel-Pfad Key',         type: 'text', required: true,  placeholder: '/etc/nginx/ssl/server.key' },
  { key: 'chainPath', label: 'Ziel-Pfad Chain (optional)', type: 'text', required: false },
  { key: 'reloadCmd', label: 'Reload-Befehl (optional)', type: 'text', required: false, placeholder: 'systemctl reload nginx' },
];

function loadCertFiles(certRecord) {
  const certDir = path.join(config.certsDir, certRecord.id);
  const pemPath = path.join(certDir, 'cert.pem');
  const keyPath = path.join(certDir, 'key.pem');
  const chainPath = path.join(certDir, 'chain.pem');

  if (!fs.existsSync(pemPath) || !fs.existsSync(keyPath)) {
    throw new Error(`Certificate files not found for ${certRecord.common_name}`);
  }
  return { pemPath, keyPath, chainPath: fs.existsSync(chainPath) ? chainPath : null };
}

async function test(cfg) {
  try {
    const dir = path.dirname(cfg.certPath);
    fs.accessSync(dir, fs.constants.W_OK);
    return { ok: true, message: `Verzeichnis ${dir} ist beschreibbar` };
  } catch (err) {
    return { ok: false, error: `Verzeichnis nicht beschreibbar: ${err.message}` };
  }
}

async function deploy(certRecord, cfg) {
  try {
    const { pemPath, keyPath, chainPath } = loadCertFiles(certRecord);

    // Ensure target directories exist
    fs.mkdirSync(path.dirname(cfg.certPath), { recursive: true });
    fs.mkdirSync(path.dirname(cfg.keyPath), { recursive: true });

    fs.copyFileSync(pemPath, cfg.certPath);
    fs.copyFileSync(keyPath, cfg.keyPath);

    if (cfg.chainPath && chainPath) {
      fs.mkdirSync(path.dirname(cfg.chainPath), { recursive: true });
      fs.copyFileSync(chainPath, cfg.chainPath);
    }

    if (cfg.reloadCmd) {
      execSync(cfg.reloadCmd, { timeout: 30000 });
    }

    return { ok: true, message: `Certificate deployed to ${cfg.certPath}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { type, label, description, configSchema, test, deploy };
