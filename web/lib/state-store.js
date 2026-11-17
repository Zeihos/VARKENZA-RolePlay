'use strict';
// SQLite-backed state adapter for the v0.4 LOCAL development runtime.
// Existing player-api / game-bridge mutate a snapshot; commit a row-level diff atomically.
// This is a transitional persistence layer, not an ORM or multi-process service.
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const names = ['users', 'characters', 'tickets', 'topics', 'replies', 'gameReports', 'staffUsers', 'vehicles'];
const physical = { gameReports: 'game_reports', staffUsers: 'staff_users' };
function initialState() { return Object.fromEntries(names.map(name => [name, []])); }
function normalize(state) {
  for (const name of names) if (!Array.isArray(state[name])) state[name] = [];
  return state;
}
function createStateStore({ databaseFile, legacyFile }) {
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
  const isNew = !fs.existsSync(databaseFile);
  const db = new DatabaseSync(databaseFile);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, nickname TEXT NOT NULL COLLATE NOCASE UNIQUE,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE, payload TEXT NOT NULL CHECK(json_valid(payload))
    );
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL COLLATE NOCASE UNIQUE, payload TEXT NOT NULL CHECK(json_valid(payload))
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), payload TEXT NOT NULL CHECK(json_valid(payload))
    );
    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), payload TEXT NOT NULL CHECK(json_valid(payload))
    );
    CREATE TABLE IF NOT EXISTS replies (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), payload TEXT NOT NULL CHECK(json_valid(payload))
    );
    CREATE TABLE IF NOT EXISTS game_reports (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), payload TEXT NOT NULL CHECK(json_valid(payload))
    );
    CREATE TABLE IF NOT EXISTS staff_users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      payload TEXT NOT NULL CHECK(json_valid(payload))
    );
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      payload TEXT NOT NULL CHECK(json_valid(payload))
    );
    CREATE INDEX IF NOT EXISTS ix_characters_user ON characters(user_id);
    CREATE INDEX IF NOT EXISTS ix_reports_user ON game_reports(user_id);
    CREATE INDEX IF NOT EXISTS ix_topics_user ON topics(user_id);
    CREATE INDEX IF NOT EXISTS ix_vehicles_user ON vehicles(user_id);
    PRAGMA user_version=3;
  `);
  function snapshot() {
    const data = initialState();
    for (const name of names) {
      const table = physical[name] || name;
      data[name] = db.prepare(`SELECT payload FROM ${table} ORDER BY rowid`).all().map(r => JSON.parse(r.payload));
    }
    return data;
  }
  // Apply only changed records; preserve unchanged row order. Parent users first.
  // SQLite transactions guarantee all-or-nothing updates across accounts/characters/reports.
  function commit(before, after) {
    normalize(after);
    const deletions = [...names].reverse();
    for (const name of deletions) {
      const table = physical[name] || name;
      const keep = new Set(after[name].map(r => r.id));
      for (const old of before[name]) if (!keep.has(old.id)) db.prepare(`DELETE FROM ${table} WHERE id=?`).run(old.id);
    }
    for (const name of names) {
      const table = physical[name] || name;
      const prev = new Map(before[name].map(x => [x.id, JSON.stringify(x)]));
      const statement = name === 'staffUsers'
        ? db.prepare(`INSERT INTO staff_users(id,email,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,payload=excluded.payload`)
        : name === 'users'
        ? db.prepare(`INSERT INTO users(id,nickname,email,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET nickname=excluded.nickname,email=excluded.email,payload=excluded.payload`)
        : name === 'characters'
          ? db.prepare(`INSERT INTO characters(id,user_id,name,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,name=excluded.name,payload=excluded.payload`)
          : db.prepare(`INSERT INTO ${table}(id,user_id,payload) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,payload=excluded.payload`);
      for (const item of after[name]) {
        if (!item || typeof item.id !== 'string') throw Error(`Invalid record in ${name}`);
        const json = JSON.stringify(item);
        if (prev.get(item.id) === json) continue;
        if (name === 'staffUsers') statement.run(item.id, item.email, json);
        else if (name === 'users') statement.run(item.id, item.nickname, item.email, json);
        else if (name === 'characters') statement.run(item.id, item.userId, item.name, json);
        else statement.run(item.id, item.userId, json);
      }
    }
  }
  // Read-only import from the old JSON file on the FIRST initialization of a new DB.
  // Does not alter the old file: keep it as a rollback/archive copy.
  if (isNew && legacyFile && fs.existsSync(legacyFile)) {
    let obj;
    try { obj = normalize(JSON.parse(fs.readFileSync(legacyFile, 'utf8'))); }
    catch (e) { db.close(); fs.rmSync(databaseFile, { force: true }); throw Error(`Cannot import legacy JSON: ${e.message}`); }
    db.exec('BEGIN IMMEDIATE');
    try { commit(initialState(), obj); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); db.close(); fs.rmSync(databaseFile, { force: true }); throw Error(`Legacy JSON migration failed: ${e.message}`); }
  }
  let queue = Promise.resolve();
  async function readStore() { return snapshot(); }
  function writeStore(fn) {
    const operation = queue.catch(() => {}).then(async () => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const before = snapshot();
        const updated = structuredClone(before);
        // All mutations are synchronous: never yield while holding SQLite transaction.
        const result = fn(updated);
        if (result && typeof result.then === 'function') throw Error('Async state mutations are not supported');
        commit(before, updated);
        db.exec('COMMIT');
        return result;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    });
    queue = operation.catch(() => {});
    return operation;
  }
  return { readStore, writeStore, close: () => db.close(), kind: 'sqlite', databaseFile };
}
module.exports = { createStateStore };
