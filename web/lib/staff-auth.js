'use strict';
const crypto = require('node:crypto');
const ROLES = Object.freeze({
  owner: ['*'],
  administrator: ['news.write','players.read','players.ban','tickets.read','tickets.write','reports.read','reports.write','game.read','game.tools','game.warn','game.kick','forum.moderate','audit.read','staff.read'],
  moderator: ['players.read','reports.read','reports.write','game.read','game.tools','game.warn','game.kick','forum.moderate','audit.read'],
  support: ['players.read','tickets.read','tickets.write','reports.read','reports.write','game.read']
});
const isRole = role => Object.hasOwn(ROLES, role) && role !== 'owner';
const has = (session, permission) => Boolean(session && (session.role === 'owner' || ROLES[session.role]?.includes(permission)));
const publicStaff = staff => ({ id: staff.id, email: staff.email, role: staff.role, disabled: Boolean(staff.disabled), createdAt: staff.createdAt });
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${digest}`;
}
function verifyPassword(password, stored) {
  const [algo, salt, digest] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(digest || '')) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');
  return crypto.timingSafeEqual(actual, expected);
}
module.exports = { ROLES, isRole, has, publicStaff, hashPassword, verifyPassword };
