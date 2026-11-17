'use strict';
const crypto = require('node:crypto');

function configuredSessionSecret(value) {
  return typeof value === 'string' && value.length >= 32 &&
    /^[A-Za-z0-9_-]+$/.test(value) &&
    !/^(?:replace[_-]|changeme|change[_-]me|your[_-])/i.test(value);
}

function playerSessionSecret(value, randomBytes = crypto.randomBytes) {
  return configuredSessionSecret(value) ? value : randomBytes(48).toString('hex');
}

module.exports = { configuredSessionSecret, playerSessionSecret };
