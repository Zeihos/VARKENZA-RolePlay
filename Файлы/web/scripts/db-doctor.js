'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const file = process.env.VARKENZA_SQLITE_FILE || path.join(__dirname, '..', 'data', 'varkenza.sqlite3');
if (!fs.existsSync(file)) { console.error('SQLite database does not exist:', file); process.exit(1); }
const db = new DatabaseSync(file, { readOnly: true });
try {
  const integrity = db.prepare('PRAGMA integrity_check').get();
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  console.log('Database:', file, '\nIntegrity:', Object.values(integrity)[0], '\nForeign-key errors:', fk.length);
  for (const table of ['users', 'characters', 'tickets', 'topics', 'replies', 'game_reports', 'staff_users', 'vehicles']) {
    console.log(`${table}:`, db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
  }
  if (Object.values(integrity)[0] !== 'ok' || fk.length) process.exitCode = 1;
} finally { db.close(); }
