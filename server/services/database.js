const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '..', 'data', 'fingerprint.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      group_name TEXT DEFAULT 'default',
      proxy_type TEXT DEFAULT '',
      proxy_host TEXT DEFAULT '',
      proxy_port INTEGER DEFAULT 0,
      proxy_user TEXT DEFAULT '',
      proxy_pass TEXT DEFAULT '',
      fingerprint TEXT NOT NULL,
      user_data_dir TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      status TEXT DEFAULT 'idle',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function createProfile(data) {
  const db = getDb();
  const id = uuidv4();
  const stmt = db.prepare(`
    INSERT INTO profiles (id, name, group_name, proxy_type, proxy_host, proxy_port, proxy_user, proxy_pass, fingerprint, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    data.name,
    data.group_name || 'default',
    data.proxy_type || '',
    data.proxy_host || '',
    data.proxy_port || 0,
    data.proxy_user || '',
    data.proxy_pass || '',
    JSON.stringify(data.fingerprint),
    data.notes || ''
  );
  return getProfile(id);
}

function getProfile(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM profiles WHERE id = ?').get(id);
  if (row) row.fingerprint = JSON.parse(row.fingerprint);
  return row;
}

function getAllProfiles() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM profiles ORDER BY created_at DESC').all();
  return rows.map(r => {
    r.fingerprint = JSON.parse(r.fingerprint);
    return r;
  });
}

function updateProfile(id, data) {
  const db = getDb();
  const fields = [];
  const values = [];
  for (const [key, val] of Object.entries(data)) {
    if (key === 'id' || key === 'created_at') continue;
    if (key === 'fingerprint') {
      fields.push('fingerprint = ?');
      values.push(JSON.stringify(val));
    } else {
      fields.push(`${key} = ?`);
      values.push(val);
    }
  }
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE profiles SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getProfile(id);
}

function deleteProfile(id) {
  const db = getDb();
  db.prepare('DELETE FROM profiles WHERE id = ?').run(id);
}

function setProfileStatus(id, status) {
  const db = getDb();
  db.prepare("UPDATE profiles SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);
}

module.exports = {
  getDb,
  createProfile,
  getProfile,
  getAllProfiles,
  updateProfile,
  deleteProfile,
  setProfileStatus,
};
