import React, { useEffect, useState } from 'react';
import { Box, Typography, Button, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Paper, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel, Switch, Chip, Alert } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';
import { api } from '../api';

const EMPTY = { name: '', type: 'A', value: '', ttl: 300 };

export default function DnsManager() {
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState({ running: false });
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);

  const load = () => {
    api.dnsGetAll().then(setRecords).catch(e => setError(e.message));
    api.dnsStatus().then(setStatus).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    try {
      if (editId) {
        await api.dnsUpdate(editId, form);
      } else {
        const result = await api.dnsCreate(form);
        if (result.autoCert) {
          setInfo(`Zertifikat für "${result.autoCert.commonName}" wurde automatisch erstellt.`);
          setTimeout(() => setInfo(null), 6000);
        }
      }
      setDialog(false);
      setForm(EMPTY);
      setEditId(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this record?')) return;
    try { await api.dnsDelete(id); load(); } catch (e) { setError(e.message); }
  };

  const handleEdit = (rec) => {
    setForm({ name: rec.name, type: rec.type, value: rec.value, ttl: rec.ttl });
    setEditId(rec.id);
    setDialog(true);
  };

  const toggleServer = async () => {
    try {
      if (status.running) await api.dnsStop(); else await api.dnsStart();
      load();
    } catch (e) { setError(e.message); }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">DNS Manager</Typography>
        <Box>
          <Button variant={status.running ? 'outlined' : 'contained'} color={status.running ? 'error' : 'success'}
            startIcon={status.running ? <StopIcon /> : <PlayArrowIcon />} onClick={toggleServer} sx={{ mr: 1 }}>
            {status.running ? 'Stop DNS' : 'Start DNS'}
          </Button>
          <Chip label={status.running ? `Port ${status.port}` : 'Stopped'}
            color={status.running ? 'success' : 'default'} />
        </Box>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}
      {info && <Alert severity="success" onClose={() => setInfo(null)} sx={{ mb: 2 }}>✅ {info}</Alert>}

      <Alert severity="info" sx={{ mb: 2 }}>
        <strong>💡 Reverse Proxy:</strong> Wenn du einen Hostnamen über den eingebauten Reverse Proxy erreichbar machen willst,
        muss der DNS-Record auf <strong>lan-cert-manager.home</strong> / <strong>{window.location.hostname}</strong> zeigen — nicht auf den Zielserver direkt.
        Den Zielserver (IP + Port) trägst du dann unter <em>Reverse Proxy → Route hinzufügen</em> ein.
      </Alert>

      <Button variant="contained" startIcon={<AddIcon />}
        onClick={() => { setForm(EMPTY); setEditId(null); setDialog(true); }} sx={{ mb: 2 }}>
        Add Record
      </Button>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Value</TableCell>
              <TableCell>TTL</TableCell>
              <TableCell>Enabled</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {records.map(rec => (
              <TableRow key={rec.id}>
                <TableCell><code>{rec.name}</code></TableCell>
                <TableCell><Chip label={rec.type} size="small" /></TableCell>
                <TableCell>{rec.value}</TableCell>
                <TableCell>{rec.ttl}s</TableCell>
                <TableCell>
                  <Switch checked={!!rec.enabled} onChange={async () => {
                    await api.dnsUpdate(rec.id, { enabled: rec.enabled ? 0 : 1 });
                    load();
                  }} />
                </TableCell>
                <TableCell>
                  <IconButton size="small" onClick={() => handleEdit(rec)}><EditIcon /></IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(rec.id)}><DeleteIcon /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {records.length === 0 && (
              <TableRow><TableCell colSpan={6} align="center">No DNS records yet</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editId ? 'Edit Record' : 'Add DNS Record'}</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="Hostname (e.g. iobroker.lan)" value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })} sx={{ mt: 1, mb: 2 }} />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Type</InputLabel>
            <Select value={form.type} label="Type" onChange={e => setForm({ ...form, type: e.target.value })}>
              <MenuItem value="A">A (IPv4)</MenuItem>
              <MenuItem value="AAAA">AAAA (IPv6)</MenuItem>
              <MenuItem value="CNAME">CNAME</MenuItem>
            </Select>
          </FormControl>
          <TextField fullWidth label="Value (IP or hostname)" value={form.value}
            onChange={e => setForm({ ...form, value: e.target.value })} sx={{ mb: 2 }} />
          <TextField fullWidth label="TTL (seconds)" type="number" value={form.ttl}
            onChange={e => setForm({ ...form, ttl: parseInt(e.target.value, 10) || 300 })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
