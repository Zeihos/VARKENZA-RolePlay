'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {bankAmount, bankBalance, applyBankOperation, validBankLocation, BANK_STATION} = require('../lib/banking');

test('bank amount and location validation', () => {
  for (const input of ['', '0', '-1', '01', '12.5', '1e2', '1000001']) assert.equal(bankAmount(input), null);
  assert.equal(bankAmount('1000000'), 1000000);
  assert.equal(validBankLocation({x:BANK_STATION.x,y:BANK_STATION.y,z:BANK_STATION.z,interior:'0',world:'0'}),true);
  assert.equal(validBankLocation({x:0,y:0,z:0,interior:'0',world:'0'}),false);
});

test('bank operations preserve cash + bank and refuse overdrafts', () => {
  const char={cash:500,bank:125};
  assert.equal(bankBalance(char),125);
  assert.equal(applyBankOperation(char,'DEPOSIT',225).error, undefined);
  assert.deepEqual({cash:char.cash,bank:char.bank}, {cash:275,bank:350});
  assert.equal(applyBankOperation(char,'WITHDRAW',350).error, undefined);
  assert.deepEqual({cash:char.cash,bank:char.bank}, {cash:625,bank:0});
  assert.equal(applyBankOperation(char,'WITHDRAW',1).error,'INSUFFICIENT_BANK');
  assert.equal(applyBankOperation(char,'DEPOSIT',626).error,'INSUFFICIENT_CASH');
  assert.equal(char.cash+char.bank,625);
});
