import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Card, CardContent, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Paper, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Select, MenuItem, FormControl,
  InputLabel, Switch, Chip, Alert, Tooltip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { api } from '../api';

const EMPTY = { hostname: '', target: '', certId: '', enabled: true };

export default function ProxyManager() {
  const [routes, setRoutes] = useState([]);
  const [status, setStatus] = useState({ running: false, port: 443 });
  const [certs, setCerts] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    api.proxyGetAll().then(setRoutes).catch(e => setError(e.message));
    api.proxyStatus().then(setStatus).catch(() => {});
  };

  useEffect(() => {
    load();
    api.certsGetAll().then(setCerts).catch(() => {});
  }, []);

  const handleSave = async () => {
    try {
      const payload = { ...form, certId: form.certId || null };
      if (editId) {
        await api.proxyUpdate(editId, payload);
      } else {
        await api.proxyCreate(payload);
      }
      setDialog(false);
      setForm(EMPTY);
      setEditId(null);
      load();
    } catch (e) { setError(e.message); }
  };

  const handleEdit = (r) => {
    setForm({ hostname: r.hostname, target: r.target, certId: r.cert_id || '', enabled: !!r.enabled });
    setEditId(r.id);
    setDialog(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Route löschen?')) return;
    try { await api.proxyDelete(id); load(); } catch (e) { setError(e.message); }
  };

  const toggleEnabled = async (r) => {
    try { await api.proxyUpdate(r.id, { enabled: r.enabled ? 0 : 1 }); load(); } catch (e) { setError(e.message); }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Reverse Proxy</Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Chip label={status.running ? `Läuft :${status.port}` : 'Gestoppt'}
            color={status.running ? 'success' : 'default'} />
          <Button variant="contained" startIcon={<AddIcon />}
            onClick={() => { setForm(EMPTY); setEditId(null); setDialog(true); }}>
            Route hinzufügen
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}

      {!status.running && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Reverse Proxy ist nicht aktiv. CA muss initialisiert und ein Self-Zertifikat vorhanden sein.
        </Alert>
      )}

      <Alert severity="info" sx={{ mb: 3 }}>
        Der Reverse Proxy lauscht auf Port <strong>443</strong>. DNS-Record für den Hostnamen anlegen → Route hier konfigurieren → HTTPS ohne Port im URL.
      </Alert>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Hostname</TableCell>
              <TableCell>Ziel</TableCell>
              <TableCell>Zertifikat</TableCell>
              <TableCell>Aktiv</TableCell>
              <TableCell>Aktionen</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {routes.map(r => {
              const cert = certs.find(c => c.id === r.cert_id);
              return (
                <TableRow key={r.id}>
                  <TableCell>
                    <code>{r.hostname}</code>
                    <Tooltip title="Im Browser öffnen">
                      <IconButton size="small" onClick={() => window.open(`https://${r.hostname}`, '_blank')}>
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                  <TableCell>{r.target}</TableCell>
                  <TableCell>
                    {cert ? <Chip label={cert.common_name} size="small" color="success" /> : <Chip label="Auto" size="small" />}
                  </TableCell>
                  <TableCell>
                    <Switch checked={!!r.enabled} onChange={() => toggleEnabled(r)} />
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" onClick={() => handleEdit(r)}><EditIcon /></IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(r.id)}><DeleteIcon /></IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
            {routes.length === 0 && (
              <TableRow><TableCell colSpan={5} align="center">Keine Routen konfiguriert</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Route bearbeiten' : 'Neue Route'}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField fullWidth label="Hostname" placeholder="iobroker.home"
            value={form.hostname} onChange={e => setForm(f => ({ ...f, hostname: e.target.value }))}
            sx={{ mb: 2 }} helperText="Muss als DNS-Record existieren" />
          <TextField fullWidth label="Ziel-URL" placeholder="https://192.168.0.3:8081"
            value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))}
            sx={{ mb: 2 }} helperText="Interne URL inkl. Protokoll und Port" />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Zertifikat (optional)</InputLabel>
            <Select value={form.certId} label="Zertifikat (optional)"
              onChange={e => setForm(f => ({ ...f, certId: e.target.value }))}>
              <MenuItem value="">Automatisch (passend zum Hostnamen)</MenuItem>
              {certs.filter(c => c.status === 'active').map(c => (
                <MenuItem key={c.id} value={c.id}>{c.common_name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Abbrechen</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.hostname || !form.target}>Speichern</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
