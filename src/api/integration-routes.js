/**
 * @module integration-routes
 * @description REST API routes for deployment target integrations
 */

const { Router } = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { getAvailablePlugins, getPlugin } = require('../integrations');

const router = Router();

/** GET /api/integrations/plugins — List available plugin types */
router.get('/plugins', (req, res) => {
  res.json(getAvailablePlugins());
});

/** GET /api/integrations — List all deployment targets */
router.get('/', (req, res) => {
  try {
    res.json(db.targets.getAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/integrations/:id — Get single target */
router.get('/:id', (req, res) => {
  const t = db.targets.getById(req.params.id);
  if (!t) return res.status(404).json({ error: 'Target not found' });
  res.json(t);
});

/** POST /api/integrations — Create deployment target */
router.post('/', (req, res) => {
  try {
    const { name, type, config, certId, autoDeploy } = req.body;
    if (!name || !type || !config) {
      return res.status(400).json({ error: 'name, type, and config are required' });
    }
    if (!getPlugin(type)) {
      return res.status(400).json({ error: `Unknown integration type: ${type}` });
    }
    const target = db.targets.create({ name, type, config, certId, autoDeploy });
    res.status(201).json(target);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/integrations/:id — Update deployment target */
router.put('/:id', (req, res) => {
  try {
    const target = db.targets.update(req.params.id, req.body);
    if (!target) return res.status(404).json({ error: 'Target not found' });
    res.json(target);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/integrations/:id — Delete deployment target */
router.delete('/:id', (req, res) => {
  try {
    const result = db.targets.delete(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Target not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/integrations/:id/test — Test connection */
router.post('/:id/test', async (req, res) => {
  try {
    const target = db.targets.getById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Target not found' });
    const plugin = getPlugin(target.type);
    if (!plugin) return res.status(400).json({ error: `Plugin not found: ${target.type}` });
    const result = await plugin.test(target.config);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/integrations/:id/deploy/:certId — Manual deploy */
router.post('/:id/deploy/:certId', async (req, res) => {
  try {
    const target = db.targets.getById(req.params.id);
    if (!target) return res.status(404).json({ error: 'Target not found' });
    const cert = db.certs.getById(req.params.certId);
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    const plugin = getPlugin(target.type);
    if (!plugin) return res.status(400).json({ error: `Plugin not found: ${target.type}` });

    const result = await plugin.deploy(cert, target.config);
    db.targets.setStatus(target.id, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
