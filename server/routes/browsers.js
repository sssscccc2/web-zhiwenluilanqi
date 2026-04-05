const express = require('express');
const router = express.Router();
const browserService = require('../services/browser');

router.post('/launch/:profileId', async (req, res) => {
  try {
    const info = await browserService.launchBrowser(req.params.profileId);
    res.json({
      success: true,
      data: {
        profileId: info.profileId,
        wsPort: info.wsPort,
        vncPort: info.vncPort,
        display: info.display,
        startedAt: info.startedAt,
      },
    });
  } catch (err) {
    console.error('Launch error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/close/:profileId', async (req, res) => {
  try {
    await browserService.closeBrowser(req.params.profileId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/status/:profileId', (req, res) => {
  try {
    const info = browserService.getBrowserInfo(req.params.profileId);
    res.json({ success: true, data: info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/active', (req, res) => {
  try {
    const browsers = browserService.getAllActiveBrowsers();
    res.json({ success: true, data: browsers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/close-all', async (req, res) => {
  try {
    await browserService.closeAllBrowsers();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
