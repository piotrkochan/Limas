const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let app;
const format = {
  currency(value) { return `${Number(value).toFixed(this.currencyPrecision)} ${this.currencySign}`; }
};
const Ext = {
  namespace() {},
  application: definition => { app = definition; },
  util: {Format: format},
  data: {StoreManager: {lookup: () => ({findRecord: (field, code) => ({get: () => code})})}}
};
const filename = path.join(__dirname, '../../assets/limas/Limas.js');
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {Ext, Limas: {}}, {filename});
app.getUserPreference = (key, fallback) => key === 'limas.formatting.currency.code' ? 'USD' : fallback;
app.exchangeRates = {base: 'EUR', date: '2026-11-06', rates: {EUR: 1, USD: 1.1, PLN: 4.4}};
assert.equal(app.convertCurrency(100, 'PLN'), 25);
assert.equal(app.convertCurrency(100, 'EUR'), 110.00000000000001);
assert.equal(app.convertCurrency(100, 'USD'), 100);
assert.equal(app.convertCurrency(100, 'XYZ'), null);
assert.equal(app.formatCurrency(100, 'PLN'), '25.00 USD');
assert.equal(app.formatCurrency(100, 'XYZ'), '100.00 XYZ');
assert.equal(app.formatCurrency(100, 'USD'), '100.00 USD');
console.log('ECB cross rates and display currency passed');
