const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

let grid;
let targetCurrency = 'EUR';
const rates = {EUR: 1, USD: 2};
const app = {
  getDisplayCurrency: () => targetCurrency,
  convertCurrency: (value, source) => Number(value) / rates[source] * rates[targetCurrency]
};
const filename = path.join(__dirname, '../../assets/limas/Components/Project/ProjectReportResultGrid.js');
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
  Ext: {define: (_name, definition) => { grid = definition; }},
  i18n: text => text,
  Limas: {getApplication: () => app}
}, {filename});

function distributor(price, packagingUnit, priceBreaks, currency = 'EUR') {
  return {
    get: key => ({price, packagingUnit, priceBreaks, currency, ignoreForReports: false})[key],
    getDistributor: () => ({get: () => true})
  };
}

const lcsc = distributor('0.30', 1, [
  {quantity: 1, price: '0.30'},
  {quantity: 10, price: '0.20'},
  {quantity: 100, price: '0.10'}
]);
assert.equal(grid.getUnitPriceForQuantity(lcsc, 9), 0.30);
assert.equal(grid.getUnitPriceForQuantity(lcsc, 10), 0.20);
assert.equal(grid.getUnitPriceForQuantity(lcsc, 100), 0.10);

const pack = distributor('0.50', 5, [{quantity: 10, price: '0.40'}]);
assert.equal(grid.getOrderAmount(pack, 1), 10);
assert.equal(grid.getOrderAmount(pack, 11), 15);
assert.equal(grid.getUnitPriceForQuantity(distributor('0.70', 1, []), 100), 0.70);

const record = {values: {missing: 11}, get(key) { return this.values[key]; }, set(key, value) { this.values[key] = value; }};
grid.applyOrderSizing(record, pack);
assert.equal(record.get('orderAmount'), 15);
assert.equal(record.get('itemPrice'), 0.40);
assert.equal(record.get('orderSum'), 6);

const offers = [lcsc, distributor('0.25', 1, [])];
const part = {distributors: () => ({count: () => offers.length, getAt: index => offers[index]})};
assert.equal(grid.getCheapestDistributor(part, 9), offers[1]);
assert.equal(grid.getCheapestDistributor(part, 10), offers[0]);

targetCurrency = 'USD';
grid.applyOrderSizing(record, pack);
assert.equal(record.get('itemPrice'), 0.8);
assert.equal(record.get('orderSum'), 12);
const mixedOffers = [distributor('0.20', 1, [], 'EUR'), distributor('0.30', 1, [], 'USD')];
const mixedPart = {distributors: () => ({count: () => mixedOffers.length, getAt: index => mixedOffers[index]})};
assert.equal(grid.getCheapestDistributor(mixedPart, 1), mixedOffers[1]);

console.log('Price break calculation passed');
