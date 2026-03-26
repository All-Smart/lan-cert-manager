/**
 * @module auth-routes
 * @description Login/logout/password API routes
 */

const { Router } = require('express');
const { verifyPassword, setPassword, hasPassword } = require('../auth');

const router = Router();

/** GET /api/auth/status — Check auth state */
router.get('/status', (req, res) => {
  res.json({
    authenticated: !!(req.session && req.session.authenticated),
    hasPassword: hasPassword(),
  });
});

/** POST /api/auth/login — Login with password */
router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  if (!verifyPassword(password)) {
    return res.status(401).json({ error: 'Falsches Passwort' });
  }

  req.session.authenticated = true;
  res.json({ success: true });
});

/** POST /api/auth/logout — Logout */
router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

/** POST /api/auth/password — Set/change password */
router.post('/password', (req, res) => {
  // Must be authenticated or first-run (no password set)
  if (hasPassword() && !(req.session && req.session.authenticated)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { password } = req.body;
  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Passwort muss mindestens 6 Zeichen lang sein' });
  }
  setPassword(password);
  req.session.authenticated = true;
  res.json({ success: true });
});

module.exports = router;
