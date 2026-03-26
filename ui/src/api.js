/** @module api - Fetch wrapper for backend API */

const BASE = '/api';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  // Handle binary downloads
  const ct = res.headers.get('content-type');
  if (ct && !ct.includes('json')) return res;
  return res.json();
}

export const api = {
  version: () => request('/version'),
  // Auth
  authStatus: () => request('/auth/status'),
  authLogin: (password) => request('/auth/login', { method: 'POST', body: { password } }),
  authLogout: () => request('/auth/logout', { method: 'POST' }),
  authSetPassword: (password) => request('/auth/password', { method: 'POST', body: { password } }),
  // Passkeys
  passkeysAvailable: () => request('/passkeys/available'),
  passkeysGetAll: () => request('/passkeys'),
  passkeyDelete: (id) => request(`/passkeys/${id}`, { method: 'DELETE' }),
  passkeyRegisterOptions: () => request('/passkeys/register/options', { method: 'POST' }),
  passkeyRegisterVerify: (response, name) => request('/passkeys/register/verify', { method: 'POST', body: { response, name } }),
  passkeyAuthOptions: () => request('/passkeys/auth/options', { method: 'POST' }),
  passkeyAuthVerify: (response) => request('/passkeys/auth/verify', { method: 'POST', body: { response } }),
  dashboard: () => request('/dashboard'),
  // DNS
  dnsGetAll: () => request('/dns'),
  dnsCreate: (data) => request('/dns', { method: 'POST', body: data }),
  dnsUpdate: (id, data) => request(`/dns/${id}`, { method: 'PUT', body: data }),
  dnsDelete: (id) => request(`/dns/${id}`, { method: 'DELETE' }),
  dnsStatus: () => request('/dns/status'),
  dnsStart: () => request('/dns/server/start', { method: 'POST' }),
  dnsStop: () => request('/dns/server/stop', { method: 'POST' }),
  // CA
  caStatus: () => request('/ca/status'),
  caInit: (data) => request('/ca/init', { method: 'POST', body: data }),
  caQrCode: () => request('/ca/qrcode'),
  // Certs
  certsGetAll: () => request('/certs'),
  certCreate: (data) => request('/certs', { method: 'POST', body: data }),
  certDownload: (id, format) => `${BASE}/certs/${id}/download/${format}`,
  certRenew: (id, passphrase) => request(`/certs/${id}/renew`, { method: 'POST', body: { passphrase } }),
  certRevoke: (id) => request(`/certs/${id}/revoke`, { method: 'POST' }),
  certDelete: (id) => request(`/certs/${id}`, { method: 'DELETE' }),
  // Settings
  settingsGet: () => request('/settings'),
  settingsUpdate: (data) => request('/settings', { method: 'PUT', body: data }),
  // Integrations
  integrationsGetPlugins: () => request('/integrations/plugins'),
  integrationsGetAll: () => request('/integrations'),
  integrationCreate: (data) => request('/integrations', { method: 'POST', body: data }),
  integrationUpdate: (id, data) => request(`/integrations/${id}`, { method: 'PUT', body: data }),
  integrationDelete: (id) => request(`/integrations/${id}`, { method: 'DELETE' }),
  integrationTest: (id) => request(`/integrations/${id}/test`, { method: 'POST' }),
  integrationDeploy: (id, certId) => request(`/integrations/${id}/deploy/${certId}`, { method: 'POST' }),
  // Proxy
  proxyGetAll: () => request('/proxy'),
  proxyStatus: () => request('/proxy/status'),
  proxyCreate: (data) => request('/proxy', { method: 'POST', body: data }),
  proxyUpdate: (id, data) => request(`/proxy/${id}`, { method: 'PUT', body: data }),
  proxyDelete: (id) => request(`/proxy/${id}`, { method: 'DELETE' }),
};
