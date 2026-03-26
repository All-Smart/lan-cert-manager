/**
 * @module database
 * @description SQLite database layer for DNS records, certificates, and CA config
 */

const Database = require('better-sqlite3');
const config = require('../config');
const { v4: uuidv4 } = require('uuid');

let db;

/**
 * Initialize database and create tables
 * @returns {Database.Database}
 */
function init() {
  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS ca_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      initialized INTEGER NOT NULL DEFAULT 0,
      organization TEXT,
      common_name TEXT,
      key_type TEXT NOT NULL DEFAULT 'rsa',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT,
      fingerprint TEXT
    );

    CREATE TABLE IF NOT EXISTS dns_records (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('A', 'AAAA', 'CNAME')),
      value TEXT NOT NULL,
      ttl INTEGER NOT NULL DEFAULT 300,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_dns_name_type_value ON dns_records(name, type, value);

    CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      common_name TEXT NOT NULL,
      san_dns TEXT, -- JSON array
      san_ips TEXT, -- JSON array
      key_type TEXT NOT NULL DEFAULT 'rsa',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      auto_renew INTEGER NOT NULL DEFAULT 1,
      fingerprint TEXT,
      serial TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS proxy_routes (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL UNIQUE,
      target TEXT NOT NULL,
      cert_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deployment_targets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      config TEXT NOT NULL DEFAULT '{}',
      cert_id TEXT,
      auto_deploy INTEGER NOT NULL DEFAULT 1,
      last_deployed_at TEXT,
      last_status TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Initialize CA config row if not exists
    INSERT OR IGNORE INTO ca_config (id, initialized) VALUES (1, 0);
  `);

  return db;
}

/**
 * Get the database instance
 * @returns {Database.Database}
 */
function getDb() {
  if (!db) init();
  return db;
}

// ─── DNS Records ────────────────────────────────────────────────

const dns = {
  /** @returns {Array} All DNS records */
  getAll() {
    return getDb().prepare('SELECT * FROM dns_records ORDER BY name').all();
  },

  /** @returns {Array} Enabled DNS records */
  getEnabled() {
    return getDb().prepare('SELECT * FROM dns_records WHERE enabled = 1').all();
  },

  getById(id) {
    return getDb().prepare('SELECT * FROM dns_records WHERE id = ?').get(id);
  },

  /**
   * Find records matching a query name and type
   * @param {string} name - FQDN
   * @param {string} type - Record type
   */
  resolve(name, type) {
    return getDb().prepare(
      'SELECT * FROM dns_records WHERE name = ? AND type = ? AND enabled = 1'
    ).all(name, type);
  },

  create({ name, type, value, ttl = 300 }) {
    const id = uuidv4();
    getDb().prepare(
      'INSERT INTO dns_records (id, name, type, value, ttl) VALUES (?, ?, ?, ?, ?)'
    ).run(id, name.toLowerCase(), type.toUpperCase(), value, ttl);
    return this.getById(id);
  },

  update(id, { name, type, value, ttl, enabled }) {
    const rec = this.getById(id);
    if (!rec) return null;
    getDb().prepare(`
      UPDATE dns_records SET name=?, type=?, value=?, ttl=?, enabled=?, updated_at=datetime('now')
      WHERE id=?
    `).run(
      (name || rec.name).toLowerCase(),
      (type || rec.type).toUpperCase(),
      value ?? rec.value,
      ttl ?? rec.ttl,
      enabled ?? rec.enabled,
      id
    );
    return this.getById(id);
  },

  delete(id) {
    return getDb().prepare('DELETE FROM dns_records WHERE id = ?').run(id);
  }
};

// ─── CA Config ──────────────────────────────────────────────────

const ca = {
  get() {
    return getDb().prepare('SELECT * FROM ca_config WHERE id = 1').get();
  },

  update(fields) {
    const allowedColumns = ['initialized', 'organization', 'common_name', 'key_type', 'created_at', 'expires_at', 'fingerprint'];
    const keys = Object.keys(fields).filter(k => allowedColumns.includes(k));
    if (keys.length === 0) return this.get();
    const sets = keys.map(k => `${k} = ?`).join(', ');
    getDb().prepare(`UPDATE ca_config SET ${sets} WHERE id = 1`).run(...keys.map(k => fields[k]));
    return this.get();
  }
};

// ─── Certificates ───────────────────────────────────────────────

const certs = {
  getAll() {
    return getDb().prepare('SELECT * FROM certificates ORDER BY created_at DESC').all();
  },

  getById(id) {
    return getDb().prepare('SELECT * FROM certificates WHERE id = ?').get(id);
  },

  getExpiringSoon(days) {
    return getDb().prepare(`
      SELECT * FROM certificates
      WHERE status = 'active' AND auto_renew = 1
        AND datetime(expires_at) <= datetime('now', '+' || ? || ' days')
    `).all(days);
  },

  create({ id, commonName, sanDns, sanIps, keyType, expiresAt, fingerprint, serial }) {
    getDb().prepare(`
      INSERT INTO certificates (id, common_name, san_dns, san_ips, key_type, expires_at, fingerprint, serial)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, commonName, JSON.stringify(sanDns || []), JSON.stringify(sanIps || []), keyType, expiresAt, fingerprint, serial);
    return this.getById(id);
  },

  updateStatus(id, status) {
    getDb().prepare('UPDATE certificates SET status = ? WHERE id = ?').run(status, id);
  },

  delete(id) {
    return getDb().prepare('DELETE FROM certificates WHERE id = ?').run(id);
  }
};

// ─── Settings ───────────────────────────────────────────────────

const settings = {
  get(key, defaultValue = null) {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  },

  set(key, value) {
    getDb().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
  },

  getAll() {
    return getDb().prepare('SELECT * FROM settings').all().reduce((acc, r) => {
      acc[r.key] = r.value;
      return acc;
    }, {});
  }
};

// ─── Deployment Targets ─────────────────────────────────────────

const targets = {
  getAll() {
    return getDb().prepare('SELECT * FROM deployment_targets ORDER BY name').all()
      .map(t => ({ ...t, config: JSON.parse(t.config) }));
  },

  getById(id) {
    const t = getDb().prepare('SELECT * FROM deployment_targets WHERE id = ?').get(id);
    return t ? { ...t, config: JSON.parse(t.config) } : null;
  },

  create({ name, type, config: cfg, certId = null, autoDeploy = 1 }) {
    const id = uuidv4();
    getDb().prepare(
      'INSERT INTO deployment_targets (id, name, type, config, cert_id, auto_deploy) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, name, type, JSON.stringify(cfg), certId, autoDeploy ? 1 : 0);
    return this.getById(id);
  },

  update(id, { name, type, config: cfg, certId, autoDeploy }) {
    const t = this.getById(id);
    if (!t) return null;
    getDb().prepare(`
      UPDATE deployment_targets SET name=?, type=?, config=?, cert_id=?, auto_deploy=? WHERE id=?
    `).run(
      name ?? t.name,
      type ?? t.type,
      cfg ? JSON.stringify(cfg) : JSON.stringify(t.config),
      certId !== undefined ? certId : t.cert_id,
      autoDeploy !== undefined ? (autoDeploy ? 1 : 0) : t.auto_deploy,
      id
    );
    return this.getById(id);
  },

  setStatus(id, { ok, message, error }) {
    getDb().prepare(`
      UPDATE deployment_targets SET last_deployed_at=datetime('now'), last_status=?, last_error=? WHERE id=?
    `).run(ok ? 'success' : 'error', error || null, id);
  },

  delete(id) {
    return getDb().prepare('DELETE FROM deployment_targets WHERE id = ?').run(id);
  },

  // Find targets that should deploy for a given cert (cert_id=null means all certs)
  getForCert(certId) {
    return getDb().prepare(
      "SELECT * FROM deployment_targets WHERE auto_deploy = 1 AND (cert_id IS NULL OR cert_id = ?)"
    ).all(certId).map(t => ({ ...t, config: JSON.parse(t.config) }));
  }
};

// ─── Proxy Routes ───────────────────────────────────────────────

const proxy = {
  getAll() {
    return getDb().prepare('SELECT * FROM proxy_routes ORDER BY hostname').all();
  },
  getEnabled() {
    return getDb().prepare('SELECT * FROM proxy_routes WHERE enabled = 1').all();
  },
  getById(id) {
    return getDb().prepare('SELECT * FROM proxy_routes WHERE id = ?').get(id);
  },
  create({ hostname, target, certId = null }) {
    const id = uuidv4();
    getDb().prepare('INSERT INTO proxy_routes (id, hostname, target, cert_id) VALUES (?, ?, ?, ?)').run(id, hostname, target, certId);
    return this.getById(id);
  },
  update(id, { hostname, target, certId, enabled }) {
    const r = this.getById(id);
    if (!r) return null;
    getDb().prepare('UPDATE proxy_routes SET hostname=?, target=?, cert_id=?, enabled=? WHERE id=?').run(
      hostname ?? r.hostname, target ?? r.target,
      certId !== undefined ? certId : r.cert_id,
      enabled !== undefined ? (enabled ? 1 : 0) : r.enabled, id
    );
    return this.getById(id);
  },
  delete(id) {
    return getDb().prepare('DELETE FROM proxy_routes WHERE id = ?').run(id);
  }
};

module.exports = { init, getDb, dns, ca, certs, settings, targets, proxy };
