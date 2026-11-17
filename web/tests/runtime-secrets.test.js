'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { configuredSessionSecret, playerSessionSecret } = require('../lib/runtime-secrets');

test('rejects example and weak session secrets', () => {
  for (const candidate of ['', 'abc', 'CHANGE_ME_1234567890123456789012345', 'REPLACE_WITH_DIFFERENT_RANDOM_32_PLUS_SECRET', 'a'.repeat(32) + ' ', 'secret\n' + 'a'.repeat(40)]) {
    assert.equal(configuredSessionSecret(candidate), false);
  }
  const generated = playerSessionSecret('REPLACE_WITH_DIFFERENT_RANDOM_32_PLUS_SECRET', n => Buffer.alloc(n, 3));
  assert.equal(generated, Buffer.alloc(48, 3).toString('hex'));
});

test('preserves valid operator-defined URL-safe secret', () => {
  const candidate = 'S4wgQhPjE_KfJbZXJCgmzAlx4N6rtO71sYeQ4GiO3Dg';
  assert.equal(configuredSessionSecret(candidate), true);
  assert.equal(playerSessionSecret(candidate), candidate);
});
