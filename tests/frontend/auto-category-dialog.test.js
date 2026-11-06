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
  htmlEncode: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
  Ajax: {request: options => { previewRequest = options; }},
  create: (_name, config) => ({...config, on: () => {}, setDisabled: () => {}})
};
const filename = path.join(__dirname, '../../assets/limas/Components/Part/AutoCategoryDialog.js');
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {Ext, Limas: {getBasePath: () => ''}, i18n: text => text}, {filename});

const dialog = {callParent: () => {}, close: () => {}};
Object.assign(dialog, dialogClass);
dialogClass.initComponent.call(dialog);
assert.deepEqual(Array.from(dialog.previewGrid.columns, column => column.text),
  ['Part', 'Description', 'Distributor number', 'Suggested category']);
const suggested = dialog.previewGrid.columns[3];
const proposed = {get: key => key === 'newCategory' ? {name: 'New subcategory'} : null};
const markup = suggested.renderer('Electronics ➤ New subcategory', {}, proposed);
assert.match(markup, /limas-auto-category-new-badge/);
assert.match(markup, /NEW/);
assert.equal(dialog.previewGrid.viewConfig.getRowClass(proposed), 'limas-auto-category-new-row');

let rows;
dialog.parts = ['/api/parts/226'];
dialog.partDetails = {'/api/parts/226': {description: 'USB switch', distributorNumber: '<i class="distributor-icon lcsc"></i>C123'}};
dialog.proposeNew.getValue = () => true;
dialog.mask = () => {};
dialog.unmask = () => {};
dialog.previewStore.loadData = data => { rows = data; };
dialog.previewStore.getRange = () => [];
dialog.previewGrid.getSelectionModel = () => ({select: () => {}});
dialogClass.previewSuggestions.call(dialog);
previewRequest.success({responseText: JSON.stringify({rows: [{partId: 226, partName: 'SR6863D', target: 'Switches'}]})});
assert.equal(rows[0].description, 'USB switch');
assert.match(rows[0].distributorNumber, /C123/);

console.log('Auto category preview uses Part Manager details and marks new categories');
