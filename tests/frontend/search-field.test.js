const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let searchField;
const Ext = {
  baseCSSPrefix: 'x-',
  define: (_name, definition) => { searchField = definition; },
  create: (_name, config) => config
};
const filename = path.join(__dirname, '../../assets/limas/form/field/SearchField.js');
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {Ext}, {filename});

const events = [];
const filter = {
  setConfig: () => {},
  setValue: () => events.push('setValue')
};
const filters = {
  beginUpdate: () => events.push('begin'),
  contains: () => false,
  add: () => events.push('add'),
  itemChanged: () => events.push('changed'),
  endUpdate: () => events.push('end')
};
const field = {
  store: {isLoading: () => false, getFilters: () => filters},
  filter,
  targetField: 'name',
  searchFieldSystemPreference: null,
  splitSearchTermSystemPreference: null,
  getValue: () => 'SR6863D',
  createFilter: () => ({}),
  fireEvent: name => events.push(name),
  getTrigger: () => ({show: () => events.push('show')})
};
searchField.startSearch.call(field);
assert.deepEqual(events, ['begin', 'beforesearch', 'setValue', 'add', 'changed', 'end', 'show']);

console.log('Search clears context before applying filter');
