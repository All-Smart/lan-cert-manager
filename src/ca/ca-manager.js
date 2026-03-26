/**
 * @module ca-manager
 * @description Root CA creation and management using node-forge
 */

const forge = require('node-forge');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../db/database');

const CA_KEY_FILE = path.join(config.caDir, 'ca.key');
const CA_CERT_FILE = path.join(config.caDir, 'ca.crt');

/**
 * Check if the Root CA has been initialized
 * @returns {boolean}
 */
function isInitialized() {
  const caConfig = db.ca.get();
  return caConfig && caConfig.initialized === 1 &&
    fs.existsSync(CA_KEY_FILE) && fs.existsSync(CA_CERT_FILE);
}

/**
 * Create a new Root CA
 * @param {object} opts
 * @param {string} [opts.organization] - Organization name
 * @param {string} [opts.commonName] - CA Common Name
 * @param {string} [opts.keyType] - 'rsa' or 'ecdsa'
 * @param {number} [opts.validityYears] - Validity in years
 * @param {string} [opts.passphrase] - Optional passphrase for key encryption
 * @returns {object} CA info
 */
function createRootCA(opts = {}) {
  const org = opts.organization || config.ca.organization;
  const cn = opts.commonName || config.ca.commonName;
  const keyType = opts.keyType || config.ca.keyType;
  const validityYears = opts.validityYears || config.ca.validityYears;

  // Generate key pair (node-forge only supports RSA)
  if (keyType === 'ecdsa') {
    console.warn('ECDSA requested but node-forge only supports RSA. Falling back to RSA.');
  }
  const keys = forge.pki.rsa.generateKeyPair(config.ca.rsaBits);

  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = generateSerial();

  const now = new Date();
  cert.validity.notBefore = now;
  cert.validity.notAfter = new Date(now.getTime() + validityYears * 365.25 * 24 * 60 * 60 * 1000);

  const attrs = [
    { shortName: 'CN', value: cn },
    { shortName: 'O', value: org },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs); // Self-signed

  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' },
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  // Save key
  let keyPem;
  if (opts.passphrase) {
    keyPem = forge.pki.encryptRsaPrivateKey(keys.privateKey, opts.passphrase, {
      algorithm: 'aes256',
    });
  } else {
    keyPem = forge.pki.privateKeyToPem(keys.privateKey);
  }

  fs.mkdirSync(config.caDir, { recursive: true });
  fs.writeFileSync(CA_KEY_FILE, keyPem, { mode: 0o600 });
  fs.writeFileSync(CA_CERT_FILE, forge.pki.certificateToPem(cert));

  const fingerprint = forge.md.sha256.create()
    .update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes())
    .digest().toHex().match(/.{2}/g).join(':').toUpperCase();

  const expiresAt = cert.validity.notAfter.toISOString();

  db.ca.update({
    initialized: 1,
    organization: org,
    common_name: cn,
    key_type: keyType,
    created_at: now.toISOString(),
    expires_at: expiresAt,
    fingerprint,
  });

  return {
    organization: org,
    commonName: cn,
    keyType,
    fingerprint,
    createdAt: now.toISOString(),
    expiresAt,
  };
}

/**
 * Get CA certificate as PEM
 * @returns {string} PEM encoded certificate
 */
function getCACertPem() {
  if (!isInitialized()) throw new Error('CA not initialized');
  return fs.readFileSync(CA_CERT_FILE, 'utf-8');
}

/**
 * Get CA certificate as DER buffer
 * @returns {Buffer}
 */
function getCACertDer() {
  if (!isInitialized()) throw new Error('CA not initialized');
  const pem = fs.readFileSync(CA_CERT_FILE, 'utf-8');
  const cert = forge.pki.certificateFromPem(pem);
  const asn1 = forge.pki.certificateToAsn1(cert);
  const der = forge.asn1.toDer(asn1);
  return Buffer.from(der.getBytes(), 'binary');
}

/**
 * Load CA key (decrypting if needed)
 * @param {string} [passphrase]
 * @returns {forge.pki.PrivateKey}
 */
function loadCAKey(passphrase) {
  const keyPem = fs.readFileSync(CA_KEY_FILE, 'utf-8');
  if (keyPem.includes('ENCRYPTED')) {
    if (!passphrase) throw new Error('CA key is encrypted, passphrase required');
    return forge.pki.decryptRsaPrivateKey(keyPem, passphrase);
  }
  return forge.pki.privateKeyFromPem(keyPem);
}

/**
 * Load CA certificate
 * @returns {forge.pki.Certificate}
 */
function loadCACert() {
  return forge.pki.certificateFromPem(fs.readFileSync(CA_CERT_FILE, 'utf-8'));
}

/**
 * Get CA status info
 * @returns {object}
 */
function getStatus() {
  const caConfig = db.ca.get();
  return {
    initialized: isInitialized(),
    ...caConfig,
  };
}

/**
 * Generate a random serial number hex string
 * @returns {string}
 */
function generateSerial() {
  return forge.util.bytesToHex(forge.random.getBytesSync(16));
}

module.exports = {
  isInitialized,
  createRootCA,
  getCACertPem,
  getCACertDer,
  loadCAKey,
  loadCACert,
  getStatus,
  generateSerial,
};
