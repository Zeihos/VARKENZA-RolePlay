'use strict';
// All money movement uses one SQLite transaction (or the single-writer JSON lock).
// Persist cash and bank as whole dollars; legacy characters have bank=0.
const MAX_BALANCE = 100_000_000;
const MAX_TRANSACTION = 1_000_000;
const BANK_STATION = Object.freeze({x:1478.9225,y:-1010.1420,z:26.8438,radius:18});

function bankBalance(character) {
  const balance = character.bank ?? 0;
  if (!Number.isSafeInteger(balance) || balance < 0 || balance > MAX_BALANCE) throw Error('Invalid bank balance in store');
  return balance;
}
function bankAmount(value) {
  if (!(typeof value === 'string' && /^[1-9]\d{0,6}$/.test(value))) return null;
  const num = Number(value);
  return num <= MAX_TRANSACTION ? num : null;
}
function validBankLocation(body) {
  const vals = ['x','y','z','interior','world'].map(k => Number(body[k]));
  if (vals.some(n => !Number.isFinite(n))) return false;
  const [x,y,z,interior,world] = vals;
  return interior === 0 && world === 0 &&
    Math.hypot(x-BANK_STATION.x,y-BANK_STATION.y,z-BANK_STATION.z) <= BANK_STATION.radius;
}
function applyBankOperation(character, action, amount) {
  const bank = bankBalance(character);
  const cash = character.cash ?? 0;
  if (!Number.isSafeInteger(cash) || cash < 0 || cash > MAX_BALANCE) return {error:'INVALID_CASH'};
  if (!['DEPOSIT','WITHDRAW'].includes(action) || !Number.isSafeInteger(amount) || amount < 1 || amount > MAX_TRANSACTION) return {error:'INVALID_OPERATION'};
  if (action === 'DEPOSIT') {
    if (cash < amount) return {error:'INSUFFICIENT_CASH'};
    if (bank + amount > MAX_BALANCE) return {error:'BANK_LIMIT'};
    character.cash = cash - amount;
    character.bank = bank + amount;
  } else {
    if (bank < amount) return {error:'INSUFFICIENT_BANK'};
    if (cash + amount > MAX_BALANCE) return {error:'CASH_LIMIT'};
    character.cash = cash + amount;
    character.bank = bank - amount;
  }
  return {cash:character.cash,bank:character.bank,action,amount};
}
module.exports = {BANK_STATION, MAX_BALANCE, MAX_TRANSACTION, bankBalance, bankAmount, validBankLocation, applyBankOperation};
