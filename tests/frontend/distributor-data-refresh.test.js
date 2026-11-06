const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let dialogClass;
let request;
let selected = [];
let rows = [];
const selection = {
  on: () => {},
  select: items => { selected = items; },
  selectAll: () => { selected = rows; },
  deselectAll: () => { selected = []; },
  getSelection: () => selected
};
const Ext = {
  define: (_name, definition) => { dialogClass = definition; },
  bind: (fn, scope) => fn.bind(scope),
  create: (name, config) => {
    if (name === 'Ext.data.Store') {
      return {loadData: data => { rows = data.map(value => ({get: key => value[key]})); }, getRange: () => rows};
    }
    if (name === 'Ext.grid.Panel') return {...config, getSelectionModel: () => selection};
    if (name === 'Ext.button.Button') return {...config, setDisabled: value => { config.disabled = value; }};
    if (name === 'Ext.toolbar.TextItem') return {setText: value => { config.text = value; }};
    return config;
  },
  Ajax: {request: options => { request = options; }},
  decode: JSON.parse,
  htmlEncode: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
  String: {format: (template, value) => template.replace('{0}', value)},
  Msg: {alert: () => {}}
};
const file = path.join(__dirname, '../../assets/limas/Components/Part/DistributorDataRefreshDialog.js');
vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
  Ext, i18n: value => value, Limas: {getBasePath: () => ''}
}, {filename: file});

const dialog = Object.assign({}, dialogClass, {
  parts: ['/api/parts/226'],
  callParent: () => {},
  on: () => {},
  setLoading: () => {},
  close: () => {}
});
dialog.initComponent();
assert.equal(dialog.previewGrid.selModel.selType, 'checkboxmodel');
dialog.loadPreview();
assert.equal(request.url, '/api/parts/distributor-data/preview');
assert.deepEqual(Array.from(request.jsonData.parts), ['/api/parts/226']);
request.success.call(dialog, {responseText: JSON.stringify({rows: [
  {key: '226:3:rohsStatus', fingerprint: 'a'.repeat(64), defaultSelected: true},
  {key: '226:3:description', fingerprint: 'b'.repeat(64), defaultSelected: false}
]})});
assert.equal(selected.length, 1);
dialog.applyChanges();
assert.equal(request.url, '/api/parts/distributor-data/apply');
assert.deepEqual(Object.fromEntries(Object.entries(request.jsonData.selected)), {
  '226:3:rohsStatus': 'a'.repeat(64)
});
dialog.bbar[0].handler.call(dialog);
assert.equal(selected.length, 2);
dialog.bbar[1].handler.call(dialog);
assert.equal(selected.length, 0);

console.log('Distributor data refresh preview and field selection passed');
