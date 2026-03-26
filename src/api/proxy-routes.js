/**
 * @module proxy-routes
 * @description REST API for reverse proxy route management
 */

const { Router } = require('express');
const db = require('../db/database');
const proxyServer = require('../proxy/proxy-server');

const router = Router();

/** GET /api/proxy — list all routes */
router.get('/', (req, res) => {
  res.json(db.proxy.getAll());
});

/** GET /api/proxy/status — proxy server status */
router.get('/status', (req, res) => {
  res.json(proxyServer.getStatus());
});

/** POST /api/proxy — create route */
router.post('/', (req, res) => {
  try {
    const { hostname, target, certId } = req.body;
    if (!hostname || !target) return res.status(400).json({ error: 'hostname and target are required' });
    // Validate target URL
    try { new URL(target); } catch { return res.status(400).json({ error: 'Invalid target URL' }); }
    const route = db.proxy.create({ hostname, target, certId });
    res.status(201).json(route);
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Hostname already exists' });
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/proxy/:id — update route */
router.put('/:id', (req, res) => {
  try {
    const route = db.proxy.update(req.params.id, req.body);
    if (!route) return res.status(404).json({ error: 'Route not found' });
    res.json(route);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/proxy/:id — delete route */
router.delete('/:id', (req, res) => {
  try {
    const result = db.proxy.delete(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Route not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
