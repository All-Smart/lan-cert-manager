import React, { useState, useEffect } from 'react';
import { Box, Card, CardContent, Typography, TextField, Button, Alert,
  CircularProgress, Divider } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import FingerprintIcon from '@mui/icons-material/Fingerprint';
import { startAuthentication } from '@simplewebauthn/browser';
import { api } from '../api';

export default function Login({ onLogin, firstRun }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [hasPasskeys, setHasPasskeys] = useState(false);

  useEffect(() => {
    if (!firstRun) {
      api.passkeysAvailable().then(r => setHasPasskeys(r.available)).catch(() => {});
    }
  }, [firstRun]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (firstRun) {
        if (password !== confirm) { setError('Passwörter stimmen nicht überein'); setLoading(false); return; }
        await api.authSetPassword(password);
      } else {
        await api.authLogin(password);
      }
      onLogin();
    } catch (err) { setError(err.message); }
    setLoading(false);
  };

  const handlePasskey = async () => {
    setError(null);
    setPasskeyLoading(true);
    try {
      const options = await api.passkeyAuthOptions();
      const response = await startAuthentication({ optionsJSON: options });
      await api.passkeyAuthVerify(response);
      onLogin();
    } catch (err) {
      if (err.name === 'NotAllowedError') setError('Passkey-Anmeldung abgebrochen.');
      else setError(err.message);
    }
    setPasskeyLoading(false);
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#121212' }}>
      <Card sx={{ width: 380 }}>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 3 }}>
            <LockIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
            <Typography variant="h5" fontWeight="bold">🔐 LAN Cert Manager</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {firstRun ? 'Erstkonfiguration — Passwort festlegen' : 'Bitte einloggen'}
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          {/* Passkey login */}
          {!firstRun && hasPasskeys && (
            <>
              <Button fullWidth variant="outlined" size="large" startIcon={
                passkeyLoading ? <CircularProgress size={20} /> : <FingerprintIcon />
              } onClick={handlePasskey} disabled={passkeyLoading} sx={{ mb: 2 }}>
                Mit Passkey / Fingerprint anmelden
              </Button>
              <Divider sx={{ mb: 2 }}>oder</Divider>
            </>
          )}

          {/* Password login */}
          <form onSubmit={handleSubmit}>
            <TextField fullWidth label="Passwort" type="password" value={password}
              onChange={e => setPassword(e.target.value)} sx={{ mb: 2 }} autoFocus
              helperText={firstRun ? 'Mindestens 6 Zeichen' : ''} />
            {firstRun && (
              <TextField fullWidth label="Passwort wiederholen" type="password" value={confirm}
                onChange={e => setConfirm(e.target.value)} sx={{ mb: 2 }} />
            )}
            <Button fullWidth variant="contained" size="large" type="submit" disabled={loading || !password}>
              {loading ? <CircularProgress size={24} /> : firstRun ? 'Passwort setzen & einloggen' : 'Einloggen'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
}
