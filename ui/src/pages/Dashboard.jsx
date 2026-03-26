import React, { useEffect, useState } from 'react';
import { Grid, Card, CardContent, Typography, Chip, Box, Alert, CircularProgress } from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import DnsIcon from '@mui/icons-material/Dns';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import WarningIcon from '@mui/icons-material/Warning';
import { api } from '../api';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [version, setVersion] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.dashboard().then(setData).catch(e => setError(e.message));
    api.version().then(v => setVersion(v.version)).catch(() => {});
  }, []);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!data) return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}><CircularProgress /></Box>;

  const { ca, dns, certs } = data;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2, mb: 1 }}>
        <Typography variant="h4">Dashboard</Typography>
        {version && <Chip label={`v${version}`} size="small" variant="outlined" color="primary" />}
      </Box>

      {!ca.initialized && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Root CA not initialized. Go to <strong>CA Setup</strong> to create your Certificate Authority.
        </Alert>
      )}

      {certs.expiringSoon > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }} icon={<WarningIcon />}>
          {certs.expiringSoon} certificate(s) expiring within 30 days!
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <VerifiedUserIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">CA Status</Typography>
              </Box>
              <Chip label={ca.initialized ? 'Initialized' : 'Not Set Up'}
                color={ca.initialized ? 'success' : 'warning'} />
              {ca.fingerprint && (
                <Typography variant="caption" display="block" sx={{ mt: 1, wordBreak: 'break-all' }}>
                  {ca.fingerprint}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <DnsIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">DNS</Typography>
              </Box>
              <Typography variant="h3">{dns.total}</Typography>
              <Typography variant="body2" color="text.secondary">
                {dns.enabled} enabled records
              </Typography>
              <Chip label={dns.server.running ? `Running :${dns.server.port}` : 'Stopped'}
                color={dns.server.running ? 'success' : 'default'} size="small" sx={{ mt: 1 }} />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <SecurityIcon color="primary" sx={{ mr: 1 }} />
                <Typography variant="h6">Certificates</Typography>
              </Box>
              <Typography variant="h3">{certs.active}</Typography>
              <Typography variant="body2" color="text.secondary">
                active of {certs.total} total
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <WarningIcon color={certs.expiringSoon > 0 ? 'warning' : 'primary'} sx={{ mr: 1 }} />
                <Typography variant="h6">Expiring</Typography>
              </Box>
              <Typography variant="h3" color={certs.expiringSoon > 0 ? 'warning.main' : 'text.primary'}>
                {certs.expiringSoon}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                within 30 days
              </Typography>
              {certs.expired > 0 && (
                <Chip label={`${certs.expired} expired`} color="error" size="small" sx={{ mt: 1 }} />
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
