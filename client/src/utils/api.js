const BASE = '/api';

async function request(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.error || 'Request failed');
  return data.data;
}

export const api = {
  getProfiles: () => request('/profiles'),
  getProfile: (id) => request(`/profiles/${id}`),
  createProfile: (data) => request('/profiles', { method: 'POST', body: JSON.stringify(data) }),
  updateProfile: (id, data) => request(`/profiles/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProfile: (id) => request(`/profiles/${id}`, { method: 'DELETE' }),
  generateFingerprint: (opts) => request('/profiles/generate-fingerprint', { method: 'POST', body: JSON.stringify(opts || {}) }),

  resolveProxy: (proxy) => request('/profiles/resolve-proxy', { method: 'POST', body: JSON.stringify(proxy) }),

  launchBrowser: (profileId) => request(`/browsers/launch/${profileId}`, { method: 'POST' }),
  closeBrowser: (profileId) => request(`/browsers/close/${profileId}`, { method: 'POST' }),
  getBrowserStatus: (profileId) => request(`/browsers/status/${profileId}`),
  getActiveBrowsers: () => request('/browsers/active'),
  closeAllBrowsers: () => request('/browsers/close-all', { method: 'POST' }),
};
