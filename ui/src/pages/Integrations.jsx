import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Button, Card, CardContent, CardActions, Chip, Grid,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Select,
  MenuItem, FormControl, InputLabel, Switch, FormControlLabel, Alert,
  IconButton, Tooltip, CircularProgress, Divider
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import WifiTetheringIcon from '@mui/icons-material/WifiTethering';
import { api } from '../api';

const STATUS_COLOR = { success: 'success', error: 'error' };

export default function Integrations() {
  const [targets, setTargets] = useState([]);
  const [plugins, setPlugins] = useState([]);
  const [certs, setCerts] = useState([]);
  const [dialog, setDialog] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState({ name: '', type: '', certId: '', autoDeploy: true, config: {} });
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [testing, setTesting] = useState(null);
  const [deploying, setDeploying] = useState(null);

  const load = () => {
    api.integrationsGetAll().then(setTargets).catch(e => setError(e.message));
  };

  useEffect(() => {
    load();
    api.integrationsGetPlugins().then(setPlugins).catch(() => {});
    api.certsGetAll().then(setCerts).catch(() => {});
  }, []);

  const selectedPlugin = plugins.find(p => p.type === form.type);

  const openCreate = () => {
    setEditTarget(null);
    setForm({ name: '', type: plugins[0]?.type || '', certId: '', autoDeploy: true, config: {} });
    setDialog(true);
  };

  const openEdit = (t) => {
    setEditTarget(t);
    setForm({ name: t.name, type: t.type, certId: t.cert_id || '', autoDeploy: !!t.auto_deploy, config: { ...t.config } });
    setDialog(true);
  };

  const handleSave = async () => {
    try {
      // Fill in defaults for any schema fields not touched by user
      const filledConfig = { ...form.config };
      selectedPlugin?.configSchema.forEach(field => {
        if (filledConfig[field.key] === undefined && field.default !== undefined) {
          filledConfig[field.key] = field.default;
        }
      });
      const payload = {
        name: form.name,
        type: form.type,
        config: filledConfig,
        certId: form.certId || null,
        autoDeploy: form.autoDeploy,
      };
      if (editTarget) {
        await api.integrationUpdate(editTarget.id, payload);
      } else {
        await api.integrationCreate(payload);
      }
      setDialog(false);
      load();
    } catch (e) { setError(e.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Integration löschen?')) return;
    try { await api.integrationDelete(id); load(); } catch (e) { setError(e.message); }
  };

  const handleTest = async (id) => {
    setTesting(id);
    try {
      const result = await api.integrationTest(id);
      setInfo(result.ok ? `✅ ${result.message}` : `❌ ${result.error}`);
      setTimeout(() => setInfo(null), 6000);
    } catch (e) { setError(e.message); }
    setTesting(null);
  };

  const handleDeploy = async (targetId, certId) => {
    if (!certId) return setError('Diesem Target ist kein Zertifikat zugewiesen. Bitte Target bearbeiten.');
    setDeploying(targetId);
    try {
      const result = await api.integrationDeploy(targetId, certId);
      setInfo(result.ok ? `✅ ${result.message}` : `❌ ${result.error}`);
      setTimeout(() => setInfo(null), 6000);
      load();
    } catch (e) { setError(e.message); }
    setDeploying(null);
  };

  const setConfigField = (key, value) => {
    setForm(f => ({ ...f, config: { ...f.config, [key]: value } }));
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Integrations</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Add Target
        </Button>
      </Box>

      {error && <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>{error}</Alert>}
      {info && <Alert severity="info" onClose={() => setInfo(null)} sx={{ mb: 2 }}>{info}</Alert>}

      {targets.length === 0 ? (
        <Alert severity="info">
          Noch keine Deployment Targets konfiguriert. Füge ein Target hinzu, um Zertifikate automatisch zu deployen.
        </Alert>
      ) : (
        <Grid container spacing={2}>
          {targets.map(t => {
            const plugin = plugins.find(p => p.type === t.type);
            const assignedCert = certs.find(c => c.id === t.cert_id);
            return (
              <Grid item xs={12} md={6} key={t.id}>
                <Card>
                  <CardContent>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <Box>
                        <Typography variant="h6">{t.name}</Typography>
                        <Chip label={plugin?.label || t.type} size="small" sx={{ mr: 1, mb: 1 }} />
                        {t.auto_deploy ? <Chip label="Auto-Deploy" size="small" color="primary" /> : null}
                      </Box>
                      <Box>
                        {t.last_status && (
                          <Chip
                            label={t.last_status === 'success' ? 'OK' : 'Fehler'}
                            color={STATUS_COLOR[t.last_status] || 'default'}
                            size="small"
                          />
                        )}
                      </Box>
                    </Box>

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Zertifikat: {assignedCert ? <strong>{assignedCert.common_name}</strong> : <em>Alle Zertifikate</em>}
                    </Typography>

                    {t.last_deployed_at && (
                      <Typography variant="caption" color="text.secondary" display="block">
                        Letzter Deploy: {new Date(t.last_deployed_at).toLocaleString()}
                      </Typography>
                    )}
                    {t.last_error && (
                      <Alert severity="error" sx={{ mt: 1, py: 0 }}>{t.last_error}</Alert>
                    )}
                  </CardContent>
                  <Divider />
                  <CardActions>
                    <Tooltip title="Verbindung testen">
                      <span>
                        <Button size="small" startIcon={testing === t.id ? <CircularProgress size={14} /> : <WifiTetheringIcon />}
                          onClick={() => handleTest(t.id)} disabled={!!testing}>
                          Test
                        </Button>
                      </span>
                    </Tooltip>
                    <Tooltip title="Jetzt deployen">
                      <span>
                        <Button size="small" startIcon={deploying === t.id ? <CircularProgress size={14} /> : <PlayArrowIcon />}
                          onClick={() => handleDeploy(t.id, t.cert_id)} disabled={!!deploying} color="primary">
                          Deploy
                        </Button>
                      </span>
                    </Tooltip>
                    <Box sx={{ flexGrow: 1 }} />
                    <IconButton size="small" onClick={() => openEdit(t)}><EditIcon /></IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(t.id)}><DeleteIcon /></IconButton>
                  </CardActions>
                </Card>
              </Grid>
            );
          })}
        </Grid>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialog} onClose={() => setDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editTarget ? 'Integration bearbeiten' : 'Neue Integration'}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField fullWidth label="Name" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} sx={{ mb: 2 }} />

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Typ</InputLabel>
            <Select value={form.type} label="Typ"
              onChange={e => setForm(f => ({ ...f, type: e.target.value, config: {} }))}>
              {plugins.map(p => (
                <MenuItem key={p.type} value={p.type}>
                  {p.label} — <em style={{ fontSize: 12, color: '#aaa' }}>{p.description}</em>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Plugin-specific help */}
          {form.type === 'proxmox' && (
            <Alert severity="info" sx={{ mb: 2 }}>
              <strong>Proxmox API-Token erstellen:</strong>
              <ol style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                <li>Proxmox WebUI öffnen → <strong>Datacenter → Permissions → API Tokens</strong></li>
                <li>Auf <strong>"Add"</strong> klicken</li>
                <li>User wählen (z.B. <code>root@pam</code>), Token ID vergeben (z.B. <code>lan-cert</code>)</li>
                <li><strong>"Privilege Separation"</strong> deaktivieren (damit der Token die gleichen Rechte wie der User hat)</li>
                <li>Auf <strong>"Add"</strong> klicken → Token Secret wird einmalig angezeigt — kopieren!</li>
                <li>Token ID Format: <code>root@pam!lan-cert</code> (User + <code>!</code> + Token-Name)</li>
              </ol>
              <Box sx={{ mt: 1 }}>
                Der User braucht mindestens die Rolle <strong>PVEAdmin</strong> oder <strong>Administrator</strong> auf Node-Ebene, damit Zertifikate gesetzt werden können.
              </Box>
            </Alert>
          )}

          {/* Dynamic config fields from plugin schema */}
          {selectedPlugin?.configSchema.map(field => (
            field.type === 'checkbox' ? (
              <FormControlLabel key={field.key} sx={{ mb: 1, display: 'block' }}
                control={
                  <Switch
                    checked={
                      form.config[field.key] !== undefined
                        ? form.config[field.key] === 'true' || form.config[field.key] === true
                        : field.default === 'true'
                    }
                    onChange={e => setConfigField(field.key, String(e.target.checked))} />
                }
                label={field.label}
              />
            ) : (
              <TextField key={field.key} fullWidth
                label={field.label}
                type={field.type === 'password' ? 'password' : 'text'}
                value={form.config[field.key] ?? field.default ?? ''}
                placeholder={field.placeholder || ''}
                required={field.required}
                onChange={e => setConfigField(field.key, e.target.value)}
                sx={{ mb: 2 }}
              />
            )
          ))}

          <Divider sx={{ my: 2 }} />

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Zertifikat (optional)</InputLabel>
            <Select value={form.certId} label="Zertifikat (optional)"
              onChange={e => setForm(f => ({ ...f, certId: e.target.value }))}>
              <MenuItem value="">Alle Zertifikate</MenuItem>
              {certs.filter(c => c.status === 'active').map(c => (
                <MenuItem key={c.id} value={c.id}>{c.common_name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControlLabel
            control={<Switch checked={form.autoDeploy}
              onChange={e => setForm(f => ({ ...f, autoDeploy: e.target.checked }))} />}
            label="Auto-Deploy bei Zertifikat-Erstellung/-Erneuerung"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(false)}>Abbrechen</Button>
          <Button variant="contained" onClick={handleSave} disabled={!form.name || !form.type}>Speichern</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
