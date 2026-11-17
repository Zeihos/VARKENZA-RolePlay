'use strict';
// Run from web/: npm run db:backup. Uses SQLite online-backup API.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync, backup } = require('node:sqlite');
const databaseFile = process.env.VARKENZA_SQLITE_FILE || path.join(__dirname, '..', 'data', 'varkenza.sqlite3');
if (!fs.existsSync(databaseFile)) { console.error('SQLite database not found:', databaseFile); process.exit(1); }
const backupDir = path.join(path.dirname(databaseFile), 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const target = path.join(backupDir, `varkenza-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite3`);
(async () => {
  const db = new DatabaseSync(databaseFile, { readOnly: true });
  try {
    await backup(db, target);
    const b = new DatabaseSync(target, { readOnly: true });
    try {
      const result = b.prepare('PRAGMA quick_check').get();
      if (Object.values(result)[0] !== 'ok') throw Error('Backup quick_check failed');
    } finally { b.close(); }
    console.log('SQLite backup created and checked:', target);
  } catch (e) {
    fs.rmSync(target, { force: true }); console.error('Backup failed:', e); process.exitCode = 1;
  } finally { db.close(); }
})();
