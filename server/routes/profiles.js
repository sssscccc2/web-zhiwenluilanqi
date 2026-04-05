const express = require('express');
const router = express.Router();
const database = require('../services/database');
const { generateFingerprint } = require('../services/fingerprint');
const { resolveProxyGeo } = require('../services/geolocation');

router.get('/', (req, res) => {
  try {
    const profiles = database.getAllProfiles();
    res.json({ success: true, data: profiles });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const profile = database.getProfile(req.params.id);
    if (!profile) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const data = req.body;
    if (!data.name) return res.status(400).json({ success: false, error: 'Name is required' });
    if (!data.fingerprint) {
      data.fingerprint = generateFingerprint();
    }
    const profile = database.createProfile(data);
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const profile = database.updateProfile(req.params.id, req.body);
    if (!profile) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    database.deleteProfile(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/generate-fingerprint', (req, res) => {
  try {
    const fp = generateFingerprint(req.body || {});
    res.json({ success: true, data: fp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/resolve-proxy', async (req, res) => {
  try {
    const { host, port, user, pass, type } = req.body;
    if (!host) return res.status(400).json({ success: false, error: 'host is required' });
    const geo = await resolveProxyGeo(host, port, user, pass, type || 'socks5');
    const fp = generateFingerprint({
      timezone: geo.timezone,
      languages: geo.languages,
    });
    fp.timezone = geo.timezone;
    fp.timezoneOffset = geo.timezoneOffset;
    fp.languages = geo.languages;
    fp.geolocation = geo.geolocation;
    res.json({ success: true, data: { geo, fingerprint: fp } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
