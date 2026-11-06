const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let grid;
const filename = path.join(__dirname, '../../assets/limas/Components/Project/ProjectPartGrid.js');
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
  Ext: {define: (_name, definition) => { grid = definition; }},
  i18n: text => text
}, {filename});

const partWithoutUnit = {getPartUnit: () => null};
const rowWithoutUnit = {
  getPart: () => partWithoutUnit,
  get: name => name === 'overageType' ? 'absolute' : null
};
assert.equal(grid.columns[0].renderer(8, {}, rowWithoutUnit), '8');
assert.equal(grid.columns[2].renderer(2, {}, rowWithoutUnit), '2');

const unit = {get: name => name === 'shortName' ? 'pcs' : null};
const rowWithUnit = {
  getPart: () => ({getPartUnit: () => unit}),
  get: name => name === 'overageType' ? 'absolute' : null
};
assert.equal(grid.columns[0].renderer(8, {}, rowWithUnit), '8 pcs');
assert.equal(grid.columns[2].renderer(2, {}, rowWithUnit), '2 pcs');

console.log('Project parts render with and without a measurement unit');
