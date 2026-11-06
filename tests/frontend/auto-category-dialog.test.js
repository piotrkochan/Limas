const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let dialogClass;
let previewRequest;
const Ext = {
  define: (_name, definition) => { dialogClass = definition; },
  bind: (fn, scope) => fn.bind(scope),
  decode: JSON.parse,
  apply: (target, config, defaults) => Object.assign(target, defaults, config),
  Array: {contains: (items, value) => items.includes(value)},
  htmlEncode: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
  Ajax: {request: options => { previewRequest = options; }},
  create: (_name, config) => ({...config, on: () => {}, setDisabled: () => {}})
};
const filename = path.join(__dirname, '../../assets/limas/Components/Part/AutoCategoryDialog.js');
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {Ext, Limas: {getBasePath: () => ''}, i18n: text => text}, {filename});

const dialog = {callParent: () => {}, close: () => {}, on: () => {}, isVisible: () => true};
Object.assign(dialog, dialogClass);
dialogClass.initComponent.call(dialog);
assert.deepEqual(Array.from(dialog.previewGrid.columns, column => column.text),
  ['Part', 'Description', 'Distributor number', 'Suggested category']);
const suggested = dialog.previewGrid.columns[3];
const proposed = {get: key => ({newCategory: {name: 'New subcategory'}, target: 'Electronics ➤ New subcategory'})[key]};
const markup = suggested.renderer('Electronics ➤ New subcategory', {}, proposed);
assert.match(markup, /limas-auto-category-label/);
assert.match(markup, /Electronics/);
assert.match(markup, /limas-auto-category-new-badge/);
assert.match(markup, /NEW/);
assert.match(markup, /title="New category"/);
const existing = {get: key => ({newCategory: null, target: 'Root Category ➤ Złącza'})[key]};
const existingMarkup = suggested.renderer('', {}, existing);
assert.match(existingMarkup, /limas-auto-category-label[^>]*>Złącza<\/span>/);
assert.doesNotMatch(existingMarkup, /limas-auto-category-new-badge/);
assert.equal(dialog.previewGrid.viewConfig.getRowClass(proposed), 'limas-auto-category-new-row');
const number = dialog.previewGrid.columns[2].renderer('', {}, {get: key => ({
  distributorNumber: 'C123', distributorSource: 'lcsc', distributorUrl: 'https://www.lcsc.com/product-detail/C123.html'
})[key]});
assert.match(number, /distributor-icon lcsc/);
assert.doesNotMatch(number, /&lt;i/);

let rows;
dialog.parts = ['/api/parts/226'];
dialog.partDetails = {'/api/parts/226': {description: 'USB switch', distributorNumber: 'C123', distributorSource: 'lcsc'}};
dialog.proposeNew.getValue = () => true;
dialog.mask = () => {};
dialog.unmask = () => {};
dialog.previewStore.loadData = data => { rows = data; };
dialog.previewStore.getRange = () => [];
dialog.previewGrid.getSelectionModel = () => ({select: () => {}});
dialogClass.previewSuggestions.call(dialog);
previewRequest.success({responseText: JSON.stringify({rows: [{
  partId: 226, partName: 'SR6863D', target: 'Electronics ➤ New subcategory',
  newCategory: {parentId: 1, name: 'New subcategory'}
}]})});
assert.equal(rows[0].description, 'USB switch');
assert.equal(rows[0].distributorNumber, 'C123');
assert.equal(dialog.items.length, 2);

console.log('Auto category preview uses Part Manager details and marks new categories');
