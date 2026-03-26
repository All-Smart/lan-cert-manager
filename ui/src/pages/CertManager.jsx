import React, { useEffect, useState } from 'react';
import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Chip, Alert, Menu, MenuItem, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import BlockIcon from '@mui/icons-material/Block';
import { api } from '../api';

export default function CertManager() {
  const [certs, setCerts] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ commonName: '', sanDns: '', sanIps: '' });
  const [anchorEl, setAnchorEl] = useState(null);
  const [downloadId, setDownloadId] = useState(null);

  const load = () => { api.certsGetAll().then(setCerts).catch(e => setError(e.message)); };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    try {
      await api.certCreate({
        commonName: form.commonName,
        sanDns: form.sanDns.split(',').map(s => s.trim()).filter(Boolean),
        sanIps: form.sanIps.split(',').map(s => s.trim()).filter(Boolean),
      });
      setDialog(false);
      setForm({ commonName: '', sanDns: '', sanIps: '' });
      load();
    } catch (e) { setError(e.message); }
  };

  const handleRenew = async (id) => {
    try { await api.certRenew(id); load(); } catch (e) { setError(e.message); }
  };

  const handleRevoke = async (id) => {
    if (!confirm('Revoke this certificate?')) return;
    try { await api.certRevoke(id); load(); } catch (e) { setError(e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this certificate and all its files?')) return;
    try { await api.certDelete(id); load(); } catch (e) { setError(e.message); }
  };

  const statusColor = (s) => ({ active: 'success', expired: 'error', revoked: 'default' }[s] || 'default');

  const daysLeft = (expiresAt) => {
    const d = Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 86400));
    return d;
  };

  return (
    <Box>
      <Typography variant="h4" gutterBottom>Certificate Manager</Typography>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}

      <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialog(true)} sx={{ mb: 2 }}>
        New Certificate
      </Button>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Common Name</TableCell>
              <TableCell>SANs</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Expires</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {certs.map(cert => {
              const days = daysLeft(cert.expires_at);
              return (
                <TableRow key={cert.id}>
                  <TableCell><strong>{cert.common_name}</strong></TableCell>
                  <TableCell>
                    {cert.san_dns?.map(d => <Chip key={d} label={d} size="small" sx={{ mr: 0.5, mb: 0.5 }} />)}
                    {cert.san_ips?.map(ip => <Chip key={ip} label={ip} size="small" variant="outlined" sx={{ mr: 0.5, mb: 0.5 }} />)}
                  </TableCell>
                  <TableCell><Chip label={cert.status} color={statusColor(cert.status)} size="small" /></TableCell>
                  <TableCell>
                    <Tooltip title={new Date(cert.expires_at).toLocaleDateString()}>
                      <span style={{ color: days <= 30 ? '#ff9800' : days <= 0 ? '#f44336' : 'inherit' }}>
                        {days > 0 ? `${days} days` : 'Expired'}
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={(e) => { setAnchorEl(e.currentTarget); setDownloadId(cert.id); }}>
                      <DownloadIcon />
                    </IconButton>
                    <IconButton size="small" onClick={() => handleRenew(cert.id)}><RefreshIcon /></IconButton>
                    <IconButton size="small" onClick={() => handleRevoke(cert.id)}><BlockIcon /></IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(cert.id)}><DeleteIcon /></IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
            {certs.length === 0 && (
              <TableRow><TableCell colSpan={5} align="center">No certificates yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Download menu */}
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={() => setAnchorEl(null)}>
        {['pem', 'key', 'chain', 'fullchain', 'p12'].map(fmt => (
          <MenuItem key={fmt} onClick={() => {
            window.open(api.certDownload(downloadId, fmt), '_blank');
            setAnchorEl(null);
          }}>
            {fmt.toUpperCase()}
          </MenuItem>
        ))}
      </Menu>

      {/* Create dialog */}
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Certificate</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Common Name (e.g. iobroker.lan)" value={form.commonName}
            onChange={e => setForm({ ...form, commonName: e.target.value })} sx={{ mt: 1, mb: 2 }} />
          <TextField fullWidth label="Additional DNS Names (comma-separated)" value={form.sanDns}
            onChange={e => setForm({ ...form, sanDns: e.target.value })} sx={{ mb: 2 }}
            helperText="e.g. *.iobroker.lan, iobroker.home" />
          <TextField fullWidth label="IP Addresses (comma-separated)" value={form.sanIps}
            onChange={e => setForm({ ...form, sanIps: e.target.value })}
            helperText="e.g. 192.168.1.100, 10.0.0.1" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!form.commonName}>Create</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
