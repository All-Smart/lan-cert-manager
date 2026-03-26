/**
 * @module config
 * @description Application configuration with environment variable overrides
 */

const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

/** @type {import('./types').AppConfig} */
const config = {
  /** Web server port */
  webPort: parseInt(process.env.WEB_PORT, 10) || 3000,

  /** DNS server port (53 needs root, 5353 is safe default) */
  dnsPort: parseInt(process.env.DNS_PORT, 10) || 5353,

  /** Upstream DNS servers for forwarding */
  upstreamDns: (process.env.UPSTREAM_DNS || '8.8.8.8,1.1.1.1').split(',').map(s => s.trim()),

  /** Default DNS zone */
  defaultZone: process.env.DEFAULT_ZONE || 'local',

  /** Data directory paths */
  dataDir: DATA_DIR,
  caDir: path.join(DATA_DIR, 'ca'),
  certsDir: path.join(DATA_DIR, 'certs'),
  dbPath: path.join(DATA_DIR, 'db.sqlite'),

  /** Certificate defaults */
  ca: {
    validityYears: parseInt(process.env.CA_VALIDITY_YEARS, 10) || 10,
    keyType: process.env.CA_KEY_TYPE || 'rsa', // 'rsa' or 'ecdsa'
    rsaBits: parseInt(process.env.CA_RSA_BITS, 10) || 2048,
    organization: process.env.CA_ORG || 'LAN Cert Manager',
    commonName: process.env.CA_CN || 'LAN Root CA',
  },

  cert: {
    validityDays: parseInt(process.env.CERT_VALIDITY_DAYS, 10) || 365,
    keyType: process.env.CERT_KEY_TYPE || 'rsa',
    rsaBits: parseInt(process.env.CERT_RSA_BITS, 10) || 2048,
    renewBeforeDays: parseInt(process.env.CERT_RENEW_BEFORE_DAYS, 10) || 30,
  },

  /** Auto-renewal check interval in minutes */
  renewalCheckInterval: parseInt(process.env.RENEWAL_CHECK_INTERVAL, 10) || 60,

  /** HTTPS config */
  httpsPort: parseInt(process.env.HTTPS_PORT, 10) || 3443,
  httpsEnabled: process.env.HTTPS_ENABLED !== 'false',

  /** Reverse proxy port */
  proxyPort: parseInt(process.env.PROXY_PORT, 10) || 443,
};

module.exports = config;
