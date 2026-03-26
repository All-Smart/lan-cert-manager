/**
 * @module ca-routes
 * @description REST API routes for CA management
 */

const { Router } = require('express');
const QRCode = require('qrcode');
const caManager = require('../ca/ca-manager');

const router = Router();

/** GET /api/ca/status - CA status */
router.get('/status', (req, res) => {
  try {
    res.json(caManager.getStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/ca/init - Initialize Root CA */
router.post('/init', (req, res) => {
  try {
    if (caManager.isInitialized()) {
      return res.status(409).json({ error: 'CA already initialized. Delete existing CA first.' });
    }
    const result = caManager.createRootCA(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/ca/cert - Download CA certificate (PEM) */
router.get('/cert', (req, res) => {
  try {
    const pem = caManager.getCACertPem();
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.setHeader('Content-Disposition', 'attachment; filename="lan-root-ca.crt"');
    res.send(pem);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/ca/cert/der - Download CA certificate (DER) */
router.get('/cert/der', (req, res) => {
  try {
    const der = caManager.getCACertDer();
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', 'attachment; filename="lan-root-ca.der"');
    res.send(der);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/ca/qrcode - QR code for CA cert download URL */
router.get('/qrcode', async (req, res) => {
  try {
    if (!caManager.isInitialized()) {
      return res.status(400).json({ error: 'CA not initialized' });
    }
    const host = req.headers.host || 'localhost:3000';
    const protocol = req.protocol || 'http';
    const downloadUrl = `${protocol}://${host}/api/ca/cert/der`;
    const qr = await QRCode.toDataURL(downloadUrl, { width: 300 });
    res.json({ qrcode: qr, url: downloadUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
