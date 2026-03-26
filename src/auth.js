/**
 * @module auth
 * @description Session-based authentication middleware
 */

const crypto = require('crypto');
const db = require('./db/database');

const SESSION_COOKIE = 'lcm_session';

/**
 * Get the configured password hash from settings, or default
 */
function getPasswordHash() {
  return db.settings.get('auth_password_hash', null);
}

/**
 * Hash a password with SHA-256 + salt
 */
function hashPassword(password, salt) {
  return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

/**
 * Set a new password
 */
function setPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);
  db.settings.set('auth_password_hash', `${salt}:${hash}`);
}

/**
 * Verify a password
 */
function verifyPassword(password) {
  const stored = getPasswordHash();
  if (!stored) return true; // No password set yet — allow access (first-run)
  const [salt, hash] = stored.split(':');
  return hashPassword(password, salt) === hash;
}

/**
 * Check if a password has been configured
 */
function hasPassword() {
  return !!getPasswordHash();
}

/**
 * Express middleware — blocks unauthenticated requests
 * Allows: login endpoints, version endpoint, static assets
 */
function requireAuth(req, res, next) {
  // Always allow: login API, version, static assets
  const open = ['/api/auth/login', '/api/auth/status', '/api/version',
    '/api/passkeys/auth/options', '/api/passkeys/auth/verify'];
  if (open.includes(req.path)) return next();
  if (!req.path.startsWith('/api/')) return next(); // static frontend

  // Check session
  if (req.session && req.session.authenticated) return next();

  res.status(401).json({ error: 'Unauthorized', loginRequired: true });
}

module.exports = { requireAuth, verifyPassword, setPassword, hasPassword };
