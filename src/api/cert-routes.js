/**
 * @module cert-routes
 * @description REST API routes for certificate management
 */

const { Router } = require('express');
const certManager = require('../ca/cert-manager');
const db = require('../db/database');

const router = Router();

/** GET /api/certs - List all certificates */
router.get('/', (req, res) => {
  try {
    const certs = db.certs.getAll().map(c => ({
      ...c,
      san_dns: JSON.parse(c.san_dns || '[]'),
      san_ips: JSON.parse(c.san_ips || '[]'),
    }));
    res.json(certs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/certs/:id - Get certificate details */
router.get('/:id', (req, res) => {
  try {
    const cert = db.certs.getById(req.params.id);
    if (!cert) return res.status(404).json({ error: 'Certificate not found' });
    res.json({
      ...cert,
      san_dns: JSON.parse(cert.san_dns || '[]'),
      san_ips: JSON.parse(cert.san_ips || '[]'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/certs - Create new certificate */
router.post('/', (req, res) => {
  try {
    const { commonName, sanDns, sanIps, keyType, validityDays, passphrase } = req.body;
    if (!commonName) {
      return res.status(400).json({ error: 'commonName is required' });
    }
    const cert = certManager.createCertificate({
      commonName, sanDns, sanIps, keyType, validityDays, passphrase,
    });
    const { certDir, ...safeCert } = cert;
    res.status(201).json(safeCert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/certs/:id/download/:format - Download certificate file */
router.get('/:id/download/:format', (req, res) => {
  try {
    const { filename, content, contentType } = certManager.getCertFile(
      req.params.id, req.params.format
    );
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 500).json({ error: err.message });
  }
});

/** POST /api/certs/:id/renew - Renew certificate */
router.post('/:id/renew', (req, res) => {
  try {
    const newCert = certManager.renewCertificate(req.params.id, req.body.passphrase);
    res.json(newCert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/certs/:id/revoke - Revoke certificate */
router.post('/:id/revoke', (req, res) => {
  try {
    certManager.revokeCertificate(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/certs/:id - Delete certificate */
router.delete('/:id', (req, res) => {
  try {
    certManager.deleteCertificate(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/certs/check-renewal - Trigger renewal check */
router.post('/check-renewal', (req, res) => {
  try {
    const renewed = certManager.checkAndRenew(req.body.passphrase);
    res.json({ renewed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
