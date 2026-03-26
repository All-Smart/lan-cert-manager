/**
 * @module cert-manager
 * @description Certificate generation, renewal, and export
 */

const forge = require('node-forge');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const db = require('../db/database');
const caManager = require('./ca-manager');
const { getPlugin } = require('../integrations');

/**
 * Create a new certificate signed by the Root CA
 * @param {object} opts
 * @param {string} opts.commonName - Primary domain/hostname
 * @param {string[]} [opts.sanDns] - Additional DNS SANs
 * @param {string[]} [opts.sanIps] - IP address SANs
 * @param {string} [opts.keyType] - 'rsa' or 'ecdsa'
 * @param {number} [opts.validityDays] - Validity in days
 * @param {string} [opts.passphrase] - CA key passphrase if encrypted
 * @returns {object} Certificate info including id
 */
function createCertificate(opts) {
  if (!caManager.isInitialized()) {
    throw new Error('Root CA not initialized. Please set up the CA first.');
  }

  const { id: customId, commonName, sanDns = [], sanIps = [], keyType = config.cert.keyType,
    validityDays = config.cert.validityDays, passphrase } = opts;

  if (!commonName) throw new Error('commonName is required');

  // Generate key pair for the certificate
  const keys = forge.pki.rsa.generateKeyPair(config.cert.rsaBits);

  // Load CA
  const caKey = caManager.loadCAKey(passphrase);
  const caCert = caManager.loadCACert();

  // Create certificate
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  const serial = caManager.generateSerial();
  cert.serialNumber = serial;

  const now = new Date();
  cert.validity.notBefore = now;
  cert.validity.notAfter = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000);

  cert.setSubject([{ shortName: 'CN', value: commonName }]);
  cert.setIssuer(caCert.subject.attributes);

  // Build SAN list
  const allDns = [commonName, ...sanDns.filter(d => d !== commonName)];
  const altNames = [
    ...allDns.map(d => ({ type: 2, value: d })),       // DNS
    ...sanIps.map(ip => ({ type: 7, ip })),              // IP
  ];

  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    {
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
      critical: true,
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
      clientAuth: true,
    },
    { name: 'subjectAltName', altNames },
    { name: 'subjectKeyIdentifier' },
    { name: 'authorityKeyIdentifier', keyIdentifier: true },
  ]);

  cert.sign(caKey, forge.md.sha256.create());

  // Save files
  const certId = customId || uuidv4();
  const certDir = path.join(config.certsDir, certId);
  fs.mkdirSync(certDir, { recursive: true });

  const certPem = forge.pki.certificateToPem(cert);
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey);
  const caCertPem = caManager.getCACertPem();

  fs.writeFileSync(path.join(certDir, 'cert.pem'), certPem);
  fs.writeFileSync(path.join(certDir, 'key.pem'), keyPem, { mode: 0o600 });
  fs.writeFileSync(path.join(certDir, 'chain.pem'), certPem + caCertPem);
  fs.writeFileSync(path.join(certDir, 'fullchain.pem'), certPem + caCertPem);

  // Create PKCS12
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert, caCert], '', {
    algorithm: '3des',
  });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  fs.writeFileSync(path.join(certDir, 'cert.p12'), Buffer.from(p12Der, 'binary'));

  const fingerprint = forge.md.sha256.create()
    .update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes())
    .digest().toHex().match(/.{2}/g).join(':').toUpperCase();

  const expiresAt = cert.validity.notAfter.toISOString();

  // Save to database
  const dbRecord = db.certs.create({
    id: certId,
    commonName,
    sanDns: allDns,
    sanIps,
    keyType,
    expiresAt,
    fingerprint,
    serial,
  });

  // Auto-deploy to matching targets (async, don't block cert creation)
  setImmediate(() => autoDeployToTargets(dbRecord));

  return { ...dbRecord, certDir };
}

/**
 * Auto-deploy a certificate to all matching deployment targets
 * @param {object} certRecord
 */
async function autoDeployToTargets(certRecord) {
  try {
    const matchingTargets = db.targets.getForCert(certRecord.id);
    for (const target of matchingTargets) {
      const plugin = getPlugin(target.type);
      if (!plugin) {
        console.warn(`Auto-deploy: unknown plugin type "${target.type}" for target "${target.name}"`);
        continue;
      }
      try {
        const result = await plugin.deploy(certRecord, target.config);
        db.targets.setStatus(target.id, result);
        if (result.ok) {
          console.log(`Auto-deployed "${certRecord.common_name}" to "${target.name}": ${result.message}`);
        } else {
          console.error(`Auto-deploy failed for "${target.name}": ${result.error}`);
        }
      } catch (err) {
        db.targets.setStatus(target.id, { ok: false, error: err.message });
        console.error(`Auto-deploy error for "${target.name}": ${err.message}`);
      }
    }
  } catch (err) {
    console.error('Auto-deploy targets lookup failed:', err.message);
  }
}

/**
 * Get certificate files for download
 * @param {string} certId
 * @param {string} format - 'pem', 'key', 'chain', 'p12', 'fullchain'
 * @returns {{ filename: string, content: Buffer, contentType: string }}
 */
function getCertFile(certId, format = 'pem') {
  const certDir = path.join(config.certsDir, certId);
  if (!fs.existsSync(certDir)) throw new Error('Certificate not found');

  const record = db.certs.getById(certId);
  const safeName = (record?.common_name || certId).replace(/[^a-zA-Z0-9.-]/g, '_');

  const formats = {
    pem: { file: 'cert.pem', ct: 'application/x-pem-file', ext: 'crt' },
    key: { file: 'key.pem', ct: 'application/x-pem-file', ext: 'key' },
    chain: { file: 'chain.pem', ct: 'application/x-pem-file', ext: 'chain.crt' },
    fullchain: { file: 'fullchain.pem', ct: 'application/x-pem-file', ext: 'fullchain.crt' },
    p12: { file: 'cert.p12', ct: 'application/x-pkcs12', ext: 'p12' },
  };

  const fmt = formats[format];
  if (!fmt) throw new Error(`Unknown format: ${format}`);

  const filePath = path.join(certDir, fmt.file);
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${fmt.file}`);

  return {
    filename: `${safeName}.${fmt.ext}`,
    content: fs.readFileSync(filePath),
    contentType: fmt.ct,
  };
}

/**
 * Renew a certificate (creates new cert with same params)
 * @param {string} certId
 * @param {string} [passphrase] - CA key passphrase
 * @returns {object} New certificate info
 */
function renewCertificate(certId, passphrase) {
  const existing = db.certs.getById(certId);
  if (!existing) throw new Error('Certificate not found');

  // Mark old as expired
  db.certs.updateStatus(certId, 'expired');

  // Create new with same parameters
  return createCertificate({
    commonName: existing.common_name,
    sanDns: JSON.parse(existing.san_dns || '[]'),
    sanIps: JSON.parse(existing.san_ips || '[]'),
    keyType: existing.key_type,
    passphrase,
  });
}

/**
 * Revoke a certificate
 * @param {string} certId
 */
function revokeCertificate(certId) {
  const existing = db.certs.getById(certId);
  if (!existing) throw new Error('Certificate not found');
  db.certs.updateStatus(certId, 'revoked');
}

/**
 * Check and renew expiring certificates
 * @param {string} [passphrase]
 * @returns {Array} Renewed certificates
 */
function checkAndRenew(passphrase) {
  const expiring = db.certs.getExpiringSoon(config.cert.renewBeforeDays);
  const renewed = [];
  for (const cert of expiring) {
    try {
      const newCert = renewCertificate(cert.id, passphrase);
      renewed.push({ old: cert.id, new: newCert.id, commonName: cert.common_name });
    } catch (err) {
      console.error(`Failed to renew ${cert.common_name}: ${err.message}`);
    }
  }
  return renewed;
}

/**
 * Delete a certificate and its files
 * @param {string} certId
 */
function deleteCertificate(certId) {
  const certDir = path.join(config.certsDir, certId);
  db.certs.delete(certId);
  if (fs.existsSync(certDir)) {
    fs.rmSync(certDir, { recursive: true });
  }
}

module.exports = {
  createCertificate,
  getCertFile,
  renewCertificate,
  revokeCertificate,
  checkAndRenew,
  deleteCertificate,
};
