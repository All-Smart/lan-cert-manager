/**
 * @module dns-routes
 * @description REST API routes for DNS record management
 */

const { Router } = require('express');
const db = require('../db/database');
const dnsServer = require('../dns/dns-server');
const caManager = require('../ca/ca-manager');
const certManager = require('../ca/cert-manager');

const router = Router();

/** GET /api/dns - List all DNS records */
router.get('/', (req, res) => {
  try {
    res.json(db.dns.getAll());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/dns/status - DNS server status */
router.get('/status', (req, res) => {
  res.json(dnsServer.getStatus());
});

/** GET /api/dns/:id - Get single record */
router.get('/:id', (req, res) => {
  const record = db.dns.getById(req.params.id);
  if (!record) return res.status(404).json({ error: 'Record not found' });
  res.json(record);
});

/** POST /api/dns - Create DNS record */
router.post('/', (req, res) => {
  try {
    const { name, type, value, ttl } = req.body;
    if (!name || !type || !value) {
      return res.status(400).json({ error: 'name, type, and value are required' });
    }
    if (!['A', 'AAAA', 'CNAME'].includes(type.toUpperCase())) {
      return res.status(400).json({ error: 'type must be A, AAAA, or CNAME' });
    }
    // Validate hostname
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
      return res.status(400).json({ error: 'Invalid hostname' });
    }
    // Validate IP for A/AAAA records
    if (type.toUpperCase() === 'A' && !/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
      return res.status(400).json({ error: 'Invalid IPv4 address' });
    }
    const record = db.dns.create({ name, type, value, ttl });

    // Auto-create certificate for A and CNAME records if CA is initialized
    let autoCert = null;
    if (['A', 'CNAME'].includes(type.toUpperCase()) && caManager.isInitialized()) {
      try {
        // Check if a cert for this hostname already exists
        const existing = db.certs.getAll().find(c =>
          c.common_name === name ||
          JSON.parse(c.san_dns || '[]').includes(name)
        );
        if (!existing) {
          const sanIps = type.toUpperCase() === 'A' ? [value] : [];
          autoCert = certManager.createCertificate({ commonName: name, sanDns: [name], sanIps });
          console.log(`Auto-created certificate for ${name}`);
        }
      } catch (certErr) {
        console.warn(`Auto-cert for ${name} failed: ${certErr.message}`);
        // Don't fail the DNS record creation because of cert error
      }
    }

    res.status(201).json({ ...record, autoCert: autoCert ? { id: autoCert.id, commonName: autoCert.common_name } : null });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Record already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

/** PUT /api/dns/:id - Update DNS record */
router.put('/:id', (req, res) => {
  try {
    const record = db.dns.update(req.params.id, req.body);
    if (!record) return res.status(404).json({ error: 'Record not found' });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/dns/:id - Delete DNS record */
router.delete('/:id', (req, res) => {
  try {
    const result = db.dns.delete(req.params.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Record not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/dns/server/start - Start DNS server */
router.post('/server/start', async (req, res) => {
  try {
    await dnsServer.start();
    res.json({ success: true, ...dnsServer.getStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/dns/server/stop - Stop DNS server */
router.post('/server/stop', (req, res) => {
  try {
    dnsServer.stop();
    res.json({ success: true, ...dnsServer.getStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
