/**
 * @module integrations/ssh-copy
 * @description Generic SSH integration — copies cert/key via SCP and runs a reload command
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../config');

const type = 'ssh-copy';
const label = 'SSH / SCP';
const description = 'Copies certificate and key to a remote server via SCP and runs a reload command (nginx, apache, etc.)';

const configSchema = [
  { key: 'host',       label: 'Host / IP',            type: 'text',     required: true,  placeholder: '192.168.0.50' },
  { key: 'port',       label: 'SSH Port',              type: 'number',   required: false, default: '22' },
  { key: 'user',       label: 'SSH User',              type: 'text',     required: true,  placeholder: 'root' },
  { key: 'password',   label: 'SSH Passwort',          type: 'password', required: false, placeholder: 'oder Key-Auth verwenden' },
  { key: 'certPath',   label: 'Ziel-Pfad Zertifikat',  type: 'text',     required: true,  placeholder: '/etc/nginx/ssl/server.crt' },
  { key: 'keyPath',    label: 'Ziel-Pfad Key',         type: 'text',     required: true,  placeholder: '/etc/nginx/ssl/server.key' },
  { key: 'reloadCmd',  label: 'Reload-Befehl (optional)', type: 'text', required: false, placeholder: 'systemctl reload nginx' },
];

function loadCertFiles(certRecord) {
  const certDir = path.join(config.certsDir, certRecord.id);
  const pemPath = path.join(certDir, 'cert.pem');
  const keyPath = path.join(certDir, 'key.pem');

  if (!fs.existsSync(pemPath) || !fs.existsSync(keyPath)) {
    throw new Error(`Certificate files not found for ${certRecord.common_name}`);
  }
  return { pemPath, keyPath };
}

function sshpass(cfg) {
  return cfg.password ? `sshpass -p '${cfg.password.replace(/'/g, "'\\''")}'` : '';
}

function sshOpts(cfg) {
  return `-o StrictHostKeyChecking=no -o ConnectTimeout=10 -p ${cfg.port || 22}`;
}

async function test(cfg) {
  try {
    const cmd = `${sshpass(cfg)} ssh ${sshOpts(cfg)} ${cfg.user}@${cfg.host} "echo ok"`;
    const result = execSync(cmd, { timeout: 15000 }).toString().trim();
    if (result === 'ok') return { ok: true, message: `SSH connection to ${cfg.user}@${cfg.host} successful` };
    return { ok: false, error: `Unexpected response: ${result}` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function deploy(certRecord, cfg) {
  try {
    const { pemPath, keyPath } = loadCertFiles(certRecord);
    const sp = sshpass(cfg);
    const opts = sshOpts(cfg);
    const target = `${cfg.user}@${cfg.host}`;

    // Copy cert
    execSync(`${sp} scp ${opts} "${pemPath}" "${target}:${cfg.certPath}"`, { timeout: 30000 });
    // Copy key
    execSync(`${sp} scp ${opts} "${keyPath}" "${target}:${cfg.keyPath}"`, { timeout: 30000 });

    // Reload service if configured
    if (cfg.reloadCmd) {
      execSync(`${sp} ssh ${opts} ${target} "${cfg.reloadCmd}"`, { timeout: 30000 });
    }

    return { ok: true, message: `Certificate deployed to ${cfg.host} via SSH` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { type, label, description, configSchema, test, deploy };
