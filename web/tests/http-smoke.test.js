'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'varkenza-http-smoke-'));
process.env.VARKENZA_SQLITE_FILE = path.join(temporary, 'test.sqlite3');
process.env.VARKENZA_DATA_FILE = path.join(temporary, 'news.json');
process.env.VARKENZA_AUDIT_FILE = path.join(temporary, 'audit.jsonl');
process.env.HOST = '127.0.0.1';
delete process.env.ADMIN_PASSWORD;
delete process.env.ADMIN_SESSION_SECRET;
const { server } = require('../server');
const { version } = require('../package.json');

test('website serves health, homepage, and private admin redirect on loopback', async () => {
  server.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const { port } = server.address();
    const base = 'http://127.0.0.1:' + port;
    const health = await fetch(base + '/healthz');
    assert.equal(health.status, 200);
    const status = await health.json();
    assert.equal(status.ok, true);
    assert.equal(status.version, version);

    const homepage = await fetch(base, { redirect: 'manual' });
    assert.equal(homepage.status, 200);
    assert.match(homepage.headers.get('content-type'), /text\/html/);

    const admin = await fetch(base + '/admin', { redirect: 'manual' });
    assert.equal(admin.status, 302);
    assert.equal(admin.headers.get('location'), '/login');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
