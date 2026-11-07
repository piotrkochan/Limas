const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let definition;
let saved;
let applied;
let routeEvents = 0;
const Ext = {
  define: (_name, value) => { definition = value; },
  bind: (fn, scope) => fn.bind(scope),
  encode: JSON.stringify,
  htmlEncode: value => value,
  toast: () => {}
};
const Limas = {Components: {Grid: {GridPresetState: {
  capture: () => ({columns: [{dataIndex: 'name'}], filters: []}),
  apply: (_grid, configuration) => { applied = configuration; },
  applyDefault: () => { applied = 'default'; }
}}}};
const filename = path.join(__dirname, '../../assets/limas/Components/Grid/GridPresetButton.js');
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {Ext, Limas, i18n: value => value}, {filename});

const record = {
  data: {'@id': '/api/grid_presets/42', name: 'My preset', configuration: '{}'},
  get(key) { return this.data[key]; },
  set(key, value) { this.data[key] = value; },
  save(options) { saved = this.data.configuration; options.success(); }
};
const items = [];
const button = Object.assign(Object.create(definition), {
  activePresetId: null,
  initialPresetRestore: true,
  grid: {fireEvent: () => { routeEvents++; }},
  menu: {removeAll: () => { items.length = 0; }, add: item => items.push(...(Array.isArray(item) ? item : [item]))},
  presetStore: {getRange: () => [record], load: () => {}}
});
button.rebuildMenu();
assert.equal(items[0].disabled, true);
button.onPresetSelect(record);
assert.equal(button.activePresetId, '42');
assert.equal(applied, '{}');
assert.equal(items[0].disabled, false);
assert.match(items.at(-1).text, /✓/);
button.onSaveCurrentPreset();
assert.deepEqual(JSON.parse(saved), {columns: [{dataIndex: 'name'}], filters: []});
assert.ok(routeEvents > 0);
button.onDefaultSelect();
assert.equal(button.activePresetId, null);
assert.equal(applied, 'default');
button.restorePreset('42');
assert.equal(button.activePresetId, '42');
console.log('Grid preset saves in place and restores by URL ID');
