import React, { useEffect, useState } from 'react';
import { Box, Typography, Button, TextField, Card, CardContent, Alert, CircularProgress,
  Chip, Grid, FormControl, InputLabel, Select, MenuItem, Accordion, AccordionSummary,
  AccordionDetails, Divider } from '@mui/material';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import DownloadIcon from '@mui/icons-material/Download';
import QrCodeIcon from '@mui/icons-material/QrCode';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { api } from '../api';

export default function CaSetup() {
  const [status, setStatus] = useState(null);
  const [qr, setQr] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    organization: 'LAN Cert Manager',
    commonName: 'LAN Root CA',
    keyType: 'rsa',
    validityYears: 10,
    passphrase: '',
  });

  const load = () => { api.caStatus().then(setStatus).catch(e => setError(e.message)); };
  useEffect(() => { load(); }, []);

  const handleInit = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.caInit(form);
      load();
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const handleQr = async () => {
    try {
      const data = await api.caQrCode();
      setQr(data);
    } catch (e) { setError(e.message); }
  };

  if (!status) return <CircularProgress />;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>CA Setup</Typography>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}

      {status.initialized ? (
        <Box>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <VerifiedUserIcon color="success" sx={{ mr: 1, fontSize: 40 }} />
                <Box>
                  <Typography variant="h5">Root CA Active</Typography>
                  <Chip label="Initialized" color="success" size="small" />
                </Box>
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Organization</Typography>
                  <Typography>{status.organization}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Common Name</Typography>
                  <Typography>{status.common_name}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Key Type</Typography>
                  <Typography>{status.key_type?.toUpperCase()}</Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">Expires</Typography>
                  <Typography>{status.expires_at ? new Date(status.expires_at).toLocaleDateString() : '-'}</Typography>
                </Grid>
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">Fingerprint (SHA-256)</Typography>
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {status.fingerprint}
                  </Typography>
                </Grid>
              </Grid>
            </CardContent>
          </Card>

          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button variant="contained" startIcon={<DownloadIcon />}
              href="/api/ca/cert" download="lan-root-ca.crt">
              lan-root-ca.crt (PEM — Windows / macOS / Linux / Firefox)
            </Button>
            <Button variant="outlined" startIcon={<DownloadIcon />}
              href="/api/ca/cert/der" download="lan-root-ca.der">
              lan-root-ca.der (DER — iOS / Android)
            </Button>
            <Button variant="outlined" startIcon={<QrCodeIcon />} onClick={handleQr}>
              QR-Code (DER für Mobilgeräte)
            </Button>
          </Box>

          {qr && (
            <Card sx={{ mt: 3, maxWidth: 400 }}>
              <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h6" gutterBottom>Scan to install CA Certificate</Typography>
                <img src={qr.qrcode} alt="QR Code" style={{ maxWidth: '100%' }} />
                <Typography variant="caption" display="block" sx={{ mt: 1 }}>{qr.url}</Typography>
              </CardContent>
            </Card>
          )}

          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom>🔧 CA-Zertifikat installieren</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Das CA-Zertifikat muss auf jedem Gerät installiert werden, das HTTPS-Verbindungen zu deinen lokalen Services vertrauen soll.
            </Typography>

            {[
              {
                label: '🪟 Windows',
                content: (
                  <ol style={{ margin: 0, paddingLeft: 20 }}>
                    <li>CA-Zertifikat als <code>.crt</code> herunterladen (PEM)</li>
                    <li>Doppelklick auf die Datei → <strong>"Zertifikat installieren"</strong></li>
                    <li>Speicherort: <strong>"Lokaler Computer"</strong> → Weiter</li>
                    <li><strong>"Alle Zertifikate im folgenden Speicher speichern"</strong> wählen</li>
                    <li>Durchsuchen → <strong>"Vertrauenswürdige Stammzertifizierungsstellen"</strong> → OK</li>
                    <li>Fertig stellen → Sicherheitswarnung mit <strong>Ja</strong> bestätigen</li>
                    <li>Browser neu starten</li>
                  </ol>
                ),
              },
              {
                label: '🍎 macOS',
                content: (
                  <ol style={{ margin: 0, paddingLeft: 20 }}>
                    <li>CA-Zertifikat als <code>.crt</code> herunterladen</li>
                    <li>Doppelklick → öffnet die <strong>Schlüsselbundverwaltung</strong></li>
                    <li>Zertifikat erscheint mit rotem X unter "System" oder "Anmeldung"</li>
                    <li>Doppelklick auf das Zertifikat → <strong>"Vertrauen"</strong> aufklappen</li>
                    <li>Bei <strong>"Bei Verwendung dieses Zertifikats"</strong> → <strong>"Immer vertrauen"</strong></li>
                    <li>Fenster schließen → Passwort bestätigen</li>
                    <li>Browser neu starten</li>
                  </ol>
                ),
              },
              {
                label: '🐧 Linux (Debian/Ubuntu)',
                content: (
                  <Box>
                    <Box component="pre" sx={{ background: '#1a1a1a', p: 2, borderRadius: 1, fontSize: 13, overflowX: 'auto' }}>
{`# Datei heruntergeladen als lan-root-ca.crt
sudo cp lan-root-ca.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates`}
                    </Box>
                    <Typography variant="body2" sx={{ mt: 1 }}>Fedora/RHEL/CentOS:</Typography>
                    <Box component="pre" sx={{ background: '#1a1a1a', p: 2, borderRadius: 1, fontSize: 13, overflowX: 'auto' }}>
{`sudo cp lan-root-ca.crt /etc/pki/ca-trust/source/anchors/
sudo update-ca-trust`}
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Browser (außer Firefox) übernehmen das System-Zertifikat automatisch.
                    </Typography>
                  </Box>
                ),
              },
              {
                label: '📱 iOS (iPhone / iPad)',
                content: (
                  <ol style={{ margin: 0, paddingLeft: 20 }}>
                    <li>DER-Zertifikat herunterladen oder QR-Code scannen</li>
                    <li><strong>Einstellungen</strong> → oben erscheint <strong>"Profil geladen"</strong> → Antippen</li>
                    <li><strong>"Installieren"</strong> → Gerätecode eingeben → nochmals <strong>"Installieren"</strong></li>
                    <li>⚠️ Noch nicht fertig — Zertifikat ist installiert aber noch nicht vertraut:</li>
                    <li><strong>Einstellungen → Allgemein → Info → Zertifikatsvertrauenseinstellungen</strong></li>
                    <li>Schalter beim CA-Zertifikat aktivieren → <strong>Weiter</strong> bestätigen</li>
                  </ol>
                ),
              },
              {
                label: '🤖 Android',
                content: (
                  <Box>
                    <ol style={{ margin: 0, paddingLeft: 20 }}>
                      <li>DER-Zertifikat herunterladen oder QR-Code scannen</li>
                      <li><strong>Einstellungen → Sicherheit & Datenschutz → Weitere Sicherheitseinstellungen</strong></li>
                      <li><strong>"Von Gerätespeicher installieren"</strong> → Datei auswählen</li>
                      <li>Namen vergeben (z.B. <code>LAN Root CA</code>) → <strong>"CA-Zertifikat"</strong> wählen</li>
                      <li>Sicherheitswarnung mit <strong>"Trotzdem installieren"</strong> bestätigen</li>
                    </ol>
                    <Alert severity="info" sx={{ mt: 2 }} >
                      Menüpfad variiert je nach Hersteller. Samsung: Biometrie & Sicherheit → Weitere Sicherheitseinstellungen.
                    </Alert>
                  </Box>
                ),
              },
              {
                label: '🦊 Firefox (alle Plattformen)',
                content: (
                  <Box>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                      Firefox nutzt einen <strong>eigenen Zertifikatsspeicher</strong> — das System-Zertifikat wird nicht automatisch übernommen.
                    </Alert>
                    <ol style={{ margin: 0, paddingLeft: 20 }}>
                      <li>Firefox öffnen → Menü <strong>(☰) → Einstellungen</strong></li>
                      <li>Links <strong>"Datenschutz & Sicherheit"</strong> auswählen</li>
                      <li>Nach unten scrollen bis zum Abschnitt <strong>"Zertifikate"</strong></li>
                      <li>Auf <strong>"Zertifikate verwalten…"</strong> klicken</li>
                      <li>Im Dialog den Reiter <strong>"Zertifizierungsstellen"</strong> öffnen</li>
                      <li>Unten auf <strong>"Importieren…"</strong> klicken</li>
                      <li><code>lan-root-ca.crt</code> auswählen und öffnen</li>
                      <li>Haken bei <strong>"Dieser CA vertrauen, um Websites zu identifizieren"</strong> setzen → <strong>OK</strong></li>
                      <li>Firefox neu starten</li>
                    </ol>
                  </Box>
                ),
              },
            ].map(({ label, content }) => (
              <Accordion key={label} sx={{ mb: 1 }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography fontWeight="bold">{label}</Typography>
                </AccordionSummary>
                <AccordionDetails>{content}</AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </Box>
      ) : (
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom>Initialize Root CA</Typography>
            <Typography color="text.secondary" sx={{ mb: 3 }}>
              Create a new Certificate Authority for your local network. This is a one-time setup.
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Organization" value={form.organization}
                  onChange={e => setForm({ ...form, organization: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Common Name" value={form.commonName}
                  onChange={e => setForm({ ...form, commonName: e.target.value })} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Key Type</InputLabel>
                  <Select value={form.keyType} label="Key Type"
                    onChange={e => setForm({ ...form, keyType: e.target.value })}>
                    <MenuItem value="rsa">RSA 2048</MenuItem>
                    <MenuItem value="ecdsa">ECDSA</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Validity (years)" type="number" value={form.validityYears}
                  onChange={e => setForm({ ...form, validityYears: parseInt(e.target.value, 10) || 10 })} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Passphrase (optional)" type="password" value={form.passphrase}
                  onChange={e => setForm({ ...form, passphrase: e.target.value })}
                  helperText="Encrypt the CA private key with a passphrase" />
              </Grid>
            </Grid>
            <Button variant="contained" size="large" onClick={handleInit} disabled={loading} sx={{ mt: 3 }}>
              {loading ? <CircularProgress size={24} /> : 'Create Root CA'}
            </Button>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
