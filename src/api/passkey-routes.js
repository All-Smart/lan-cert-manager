/**
 * @module passkey-routes
 * @description WebAuthn / Passkey registration and authentication routes
 */

const { Router } = require('express');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const db = require('../db/database');

const router = Router();

// Temporary challenge store (in-memory, per session)
const challenges = new Map();

function getRpId(req) {
  return (req.headers.host || 'localhost').split(':')[0];
}

function logPasskeyDebug(req, label) {
  console.log(`[passkey:${label}] origin=${getRpOrigin(req)} rpid=${getRpId(req)} encrypted=${!!req.socket?.encrypted}`);
}

function getRpOrigin(req) {
  const host = req.headers.host || 'localhost';
  // Detect HTTPS by port or header
  const isHttps = req.headers['x-forwarded-proto'] === 'https'
    || req.socket?.encrypted
    || host.includes(':3443');
  return `${isHttps ? 'https' : 'http'}://${host}`;
}

/** GET /api/passkeys/available — public: sind Passkeys konfiguriert? (für Login-Screen) */
router.get('/available', (req, res) => {
  const passkeys = JSON.parse(db.settings.get('passkeys', '[]'));
  res.json({ available: passkeys.length > 0 });
});

/** GET /api/passkeys — list registered passkeys */
router.get('/', (req, res) => {
  const passkeys = db.settings.get('passkeys', '[]');
  const list = JSON.parse(passkeys).map(pk => ({
    id: pk.id,
    name: pk.name,
    createdAt: pk.createdAt,
  }));
  res.json(list);
});

/** DELETE /api/passkeys/:id — remove a passkey */
router.delete('/:id', (req, res) => {
  const passkeys = JSON.parse(db.settings.get('passkeys', '[]'));
  const filtered = passkeys.filter(pk => pk.id !== req.params.id);
  db.settings.set('passkeys', JSON.stringify(filtered));
  res.json({ success: true });
});

// ── Registration ──────────────────────────────────────────────

/** POST /api/passkeys/register/options — get registration challenge */
router.post('/register/options', async (req, res) => {
  if (!(req.session && req.session.authenticated)) {
    return res.status(401).json({ error: 'Login required to register a passkey' });
  }
  try {
    logPasskeyDebug(req, 'register/options');
    const rpID = getRpId(req);
    const options = await generateRegistrationOptions({
      rpName: 'LAN Cert Manager',
      rpID,
      userID: new TextEncoder().encode('lcm-admin'),
      userName: 'admin',
      userDisplayName: 'LAN Cert Manager Admin',
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });
    challenges.set(req.session.id, options.challenge);
    res.json(options);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/passkeys/register/verify — verify and save passkey */
router.post('/register/verify', async (req, res) => {
  if (!(req.session && req.session.authenticated)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    logPasskeyDebug(req, 'register/verify');
    const rpID = getRpId(req);
    const expectedChallenge = challenges.get(req.session.id);
    if (!expectedChallenge) return res.status(400).json({ error: 'No challenge found' });

    const verification = await verifyRegistrationResponse({
      response: req.body.response,
      expectedChallenge,
      expectedOrigin: getRpOrigin(req),
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified) return res.status(400).json({ error: 'Verification failed' });

    const { credential } = verification.registrationInfo;
    const passkeys = JSON.parse(db.settings.get('passkeys', '[]'));
    // credential.id is already a Uint8Array or base64url string depending on version
    const credId = typeof credential.id === 'string'
      ? credential.id
      : Buffer.from(credential.id).toString('base64url');
    passkeys.push({
      id: credId,
      name: req.body.name || `Passkey ${passkeys.length + 1}`,
      publicKey: typeof credential.publicKey === 'string'
        ? credential.publicKey
        : Buffer.from(credential.publicKey).toString('base64'),
      counter: credential.counter,
      transports: credential.transports || ['internal'],
      createdAt: new Date().toISOString(),
    });
    console.log(`[passkey] Registered: id=${credId}`);
    db.settings.set('passkeys', JSON.stringify(passkeys));
    challenges.delete(req.session.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Authentication ────────────────────────────────────────────

/** POST /api/passkeys/auth/options — get authentication challenge */
router.post('/auth/options', async (req, res) => {
  try {
    const rpID = getRpId(req);
    const passkeys = JSON.parse(db.settings.get('passkeys', '[]'));
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials: passkeys.map(pk => ({
        id: pk.id, // base64url string — simplewebauthn v13 accepts this directly
        transports: pk.transports || ['internal'],
      })),
    });
    // Store challenge — use IP as key since no session yet
    const key = req.ip + '_auth';
    challenges.set(key, options.challenge);
    res.json(options);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/passkeys/auth/verify — verify passkey login */
router.post('/auth/verify', async (req, res) => {
  try {
    const rpID = getRpId(req);
    const key = req.ip + '_auth';
    const expectedChallenge = challenges.get(key);
    if (!expectedChallenge) return res.status(400).json({ error: 'No challenge found' });

    const passkeys = JSON.parse(db.settings.get('passkeys', '[]'));
    const credId = req.body.response?.id;
    // Try exact match, then base64url normalized match
    let passkey = passkeys.find(pk => pk.id === credId);
    if (!passkey) {
      // Normalize: strip padding, replace +/ with -_
      const normalize = (s) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
      passkey = passkeys.find(pk => normalize(pk.id) === normalize(credId));
    }
    if (!passkey) {
      console.error(`Passkey not found. credId=${credId}, stored=${passkeys.map(p=>p.id).join(',')}`);
      return res.status(400).json({ error: 'Passkey not found' });
    }

    const verification = await verifyAuthenticationResponse({
      response: req.body.response,
      expectedChallenge,
      expectedOrigin: getRpOrigin(req),
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: passkey.id,
        publicKey: Buffer.from(passkey.publicKey, 'base64'),
        counter: passkey.counter,
        transports: passkey.transports,
      },
    });

    if (!verification.verified) return res.status(401).json({ error: 'Passkey verification failed' });

    // Update counter
    passkey.counter = verification.authenticationInfo.newCounter;
    db.settings.set('passkeys', JSON.stringify(passkeys));
    challenges.delete(key);

    req.session.authenticated = true;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
