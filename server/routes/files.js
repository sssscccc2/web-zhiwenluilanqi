const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

function safePath(dir) {
  const resolved = path.resolve(UPLOAD_ROOT, dir || '');
  if (!resolved.startsWith(UPLOAD_ROOT)) return null;
  return resolved;
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = safePath(req.query.dir || '');
    if (!dir) return cb(new Error('Invalid path'));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const origName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    cb(null, origName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
});

router.get('/list', (req, res) => {
  const dir = safePath(req.query.dir || '');
  if (!dir || !fs.existsSync(dir)) {
    return res.json({ success: true, data: { path: '/', items: [] } });
  }

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const items = entries.map(e => {
      const fullPath = path.join(dir, e.name);
      const stat = fs.statSync(fullPath);
      return {
        name: e.name,
        type: e.isDirectory() ? 'folder' : 'file',
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        ext: e.isDirectory() ? '' : path.extname(e.name).toLowerCase(),
      };
    });
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const relPath = '/' + path.relative(UPLOAD_ROOT, dir).replace(/\\/g, '/');
    res.json({ success: true, data: { path: relPath === '/.' ? '/' : relPath, items } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/upload', upload.array('files', 50), (req, res) => {
  const uploaded = (req.files || []).map(f => ({
    name: f.originalname,
    size: f.size,
    path: f.path,
  }));
  res.json({ success: true, data: { count: uploaded.length, files: uploaded } });
});

router.post('/mkdir', (req, res) => {
  const { dir, name } = req.body;
  if (!name || /[<>:"|?*]/.test(name)) {
    return res.status(400).json({ success: false, error: 'Invalid folder name' });
  }
  const target = safePath(path.join(dir || '', name));
  if (!target) return res.status(400).json({ success: false, error: 'Invalid path' });

  try {
    fs.mkdirSync(target, { recursive: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/delete', (req, res) => {
  const { dir, name } = req.body;
  const target = safePath(path.join(dir || '', name));
  if (!target || target === UPLOAD_ROOT) {
    return res.status(400).json({ success: false, error: 'Invalid path' });
  }

  try {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      fs.rmSync(target, { recursive: true, force: true });
    } else {
      fs.unlinkSync(target);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/download', (req, res) => {
  const filePath = safePath(req.query.path || '');
  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }
  res.download(filePath);
});

module.exports = router;
