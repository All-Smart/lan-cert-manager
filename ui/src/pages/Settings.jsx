import React, { useEffect, useState } from 'react';
import { Box, Typography, TextField, Button, Card, CardContent, Grid, Alert, Divider,
  List, ListItem, ListItemText, ListItemSecondaryAction, IconButton, Chip } from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import { startRegistration } from '@simplewebauthn/browser';
import { api } from '../api';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  // Password change
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState(null);
  const [pwSaved, setPwSaved] = useState(false);
  // Passkeys
  const [passkeys, setPasskeys] = useState([]);
  const [passkeyName, setPasskeyName] = useState('');
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyError, setPasskeyError] = useState(null);
  const [passkeyInfo, setPasskeyInfo] = useState(null);

  useEffect(() => {
    api.settingsGet().then(setSettings).catch(e => setError(e.message));
    api.passkeysGetAll().then(setPasskeys).catch(() => {});
  }, []);

  const handlePasswordChange = async () => {
    setPwError(null);
    if (pwNew !== pwConfirm) { setPwError('Passwörter stimmen nicht überein'); return; }
    if (pwNew.length < 6) { setPwError('Mindestens 6 Zeichen'); return; }
    try {
      // Verify current password first
      await api.authLogin(pwCurrent);
      await api.authSetPassword(pwNew);
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
      setPwSaved(true);
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err) { setPwError(err.message); }
  };

  const handleRegisterPasskey = async () => {
    setPasskeyError(null);
    setPasskeyLoading(true);
    try {
      const options = await api.passkeyRegisterOptions();
      const response = await startRegistration({ optionsJSON: options });
      await api.passkeyRegisterVerify(response, passkeyName || undefined);
      setPasskeyName('');
      setPasskeyInfo('Passkey erfolgreich registriert!');
      setTimeout(() => setPasskeyInfo(null), 4000);
      api.passkeysGetAll().then(setPasskeys);
    } catch (err) {
      if (err.name === 'NotAllowedError') setPasskeyError('Registrierung abgebrochen.');
      else setPasskeyError(err.message);
    }
    setPasskeyLoading(false);
  };

  const handleDeletePasskey = async (id) => {
    if (!confirm('Passkey löschen?')) return;
    await api.passkeyDelete(id);
    api.passkeysGetAll().then(setPasskeys);
  };

  const handleSave = async () => {
    try {
      await api.settingsUpdate(settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError(e.message); }
  };

  if (!settings) return null;

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Settings</Typography>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}
      {saved && <Alert severity="success" sx={{ mb: 2 }}>Settings saved!</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>DNS Settings</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Upstream DNS (comma-separated)" value={settings.upstreamDns || ''}
                onChange={e => setSettings({ ...settings, upstreamDns: e.target.value })}
                helperText="e.g. 8.8.8.8,1.1.1.1" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Default Zone" value={settings.defaultZone || ''}
                onChange={e => setSettings({ ...settings, defaultZone: e.target.value })}
                helperText="e.g. lan, home, local" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="DNS Port" value={settings.dnsPort} disabled
                helperText="Set via DNS_PORT env variable" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Web Port" value={settings.webPort} disabled
                helperText="Set via WEB_PORT env variable" />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>Certificate Settings</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Default Validity (days)" type="number"
                value={settings.certValidityDays || ''}
                onChange={e => setSettings({ ...settings, certValidityDays: e.target.value })} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Auto-Renew Before (days)" type="number"
                value={settings.renewBeforeDays || ''}
                onChange={e => setSettings({ ...settings, renewBeforeDays: e.target.value })}
                helperText="Renew certificates this many days before expiry" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Renewal Check Interval (minutes)" type="number"
                value={settings.renewalCheckInterval || ''}
                onChange={e => setSettings({ ...settings, renewalCheckInterval: e.target.value })} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Button variant="contained" startIcon={<SaveIcon />} onClick={handleSave} size="large">
        Save Settings
      </Button>

      {/* Password change */}
      <Card sx={{ mt: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>🔑 Passwort ändern</Typography>
          {pwError && <Alert severity="error" sx={{ mb: 2 }}>{pwError}</Alert>}
          {pwSaved && <Alert severity="success" sx={{ mb: 2 }}>Passwort geändert!</Alert>}
          <Grid container spacing={2}>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth label="Aktuelles Passwort" type="password" value={pwCurrent}
                onChange={e => setPwCurrent(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth label="Neues Passwort" type="password" value={pwNew}
                onChange={e => setPwNew(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth label="Wiederholen" type="password" value={pwConfirm}
                onChange={e => setPwConfirm(e.target.value)} />
            </Grid>
          </Grid>
          <Button variant="contained" sx={{ mt: 2 }} onClick={handlePasswordChange}
            disabled={!pwCurrent || !pwNew || !pwConfirm}>
            Passwort ändern
          </Button>
        </CardContent>
      </Card>

      {/* Passkeys */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            <FingerprintIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            Passkeys / Fingerprint
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Passkeys ermöglichen die Anmeldung per Fingerabdruck, Gesichtserkennung oder Sicherheitsschlüssel.
          </Typography>
          {passkeyError && <Alert severity="error" sx={{ mb: 2 }}>{passkeyError}</Alert>}
          {passkeyInfo && <Alert severity="success" sx={{ mb: 2 }}>{passkeyInfo}</Alert>}

          {passkeys.length > 0 && (
            <List dense sx={{ mb: 2 }}>
              {passkeys.map(pk => (
                <ListItem key={pk.id} sx={{ px: 0 }}>
                  <ListItemText
                    primary={pk.name}
                    secondary={`Registriert: ${new Date(pk.createdAt).toLocaleString()}`}
                  />
                  <ListItemSecondaryAction>
                    <IconButton edge="end" color="error" onClick={() => handleDeletePasskey(pk.id)}>
                      <DeleteIcon />
                    </IconButton>
                  </ListItemSecondaryAction>
                </ListItem>
              ))}
            </List>
          )}

          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Name (optional)" placeholder="z.B. Fingerprint Laptop"
                value={passkeyName} onChange={e => setPasskeyName(e.target.value)} size="small" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Button variant="outlined" startIcon={<FingerprintIcon />}
                onClick={handleRegisterPasskey} disabled={passkeyLoading}>
                {passkeyLoading ? 'Warte auf Gerät…' : 'Passkey registrieren'}
              </Button>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}
