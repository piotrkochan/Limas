const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const classes = {};
let request;
let opened;
const Ext = {
  define: (name, body) => { classes[name] = body; },
  create: (name, config) => {
    if (name === 'Limas.Importer.Importer') return {model: config.model};
    if (name === 'Ext.window.Window') return {show: () => { opened = config; }};
    return config;
  },
  Ajax: {request: config => { request = config; }},
  Msg: {alert: () => { throw new Error('Unexpected alert'); }},
  htmlEncode: value => String(value)
};
class FakeFormData {
  constructor() { this.values = {}; }
  append(key, value) { this.values[key] = value; }
}
const context = {
  Ext,
  FormData: FakeFormData,
  Blob,
  i18n: value => value,
  Limas: {
    getBasePath: () => '',
    Auth: {AuthenticationProvider: {getAuthenticationProvider: () => ({getHeaders: () => ({})})}}
  }
};
for (const file of ['BulkImport/BulkImportWindow.js', 'Importer/GridImporterButton.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../../assets/limas/Components', file), 'utf8'), context);
}

const field = value => ({
  value,
  getValue() { return this.value; },
  setVisible(visible) { this.visible = visible; },
  setDisabled(disabled) { this.disabled = disabled; },
  setFieldLabel(label) { this.label = label; }
});
const dialog = {
  parsedFile: {name: 'bom.csv'},
  projectModeCombo: field('existing'),
  projectCombo: field(6),
  projectNameField: field(''),
  bomQuantityCheckbox: field(true),
  stockQuantityCheckbox: field(false),
  projectQuantityOptions: field(null),
  mpnColumn: field(null),
  lcscColumn: field(0),
  designatorColumn: field(null),
  commentColumn: field(null),
  footprintColumn: field(null),
  mfrColumn: field(null),
  catColumn: field(null),
  stoColumn: field(null),
  qtyColumn: field(1),
  defaultCategoryCombo: field('/api/part_categories/1'),
  defaultStorageCombo: field('/api/storage_locations/2'),
  hasHeaderCheckbox: field(true),
  duplicatesCombo: field('skip'),
  submitButton: field(null),
  extractIri: value => value,
  iriId: iri => Number(iri.split('/').at(-1))
};
const bulk = classes['Limas.Components.BulkImport.BulkImportWindow'];
for (const [bom, stock] of [[true, false], [false, true], [true, true], [false, false]]) {
  dialog.bomQuantityCheckbox.value = bom;
  dialog.stockQuantityCheckbox.value = stock;
  dialog.qtyColumn.value = null;
  bulk.refreshSubmitButton.call(dialog);
  assert.equal(dialog.submitButton.disabled, bom || stock);
  assert.equal(dialog.projectQuantityOptions.visible, true);
  dialog.qtyColumn.value = 1;
  bulk.refreshSubmitButton.call(dialog);
  assert.equal(dialog.submitButton.disabled, false);
  bulk.onSubmit.call(dialog);
  const meta = JSON.parse(request.rawData.values.meta);
  assert.equal(meta.projectId, 6);
  assert.equal(meta.projectBomQuantity, bom);
  assert.equal(meta.projectStockQuantity, stock);
  assert.equal(meta.mapping.quantity, 1);
}
dialog.projectModeCombo.value = 'inventory';
bulk.refreshSubmitButton.call(dialog);
assert.equal(dialog.projectQuantityOptions.visible, false);
assert.equal(dialog.qtyColumn.label, 'Stock quantity (Update stock only)');

const model = {getName: () => 'Limas.Entity.Part'};
classes['Limas.Importer.GridImporterButton'].onImport.call({
  grid: {getStore: () => ({getModel: () => model})}
});
assert.equal(opened.items.model, model);

const reviewStore = {
  rows: [],
  loadData(rows) { this.rows = rows; },
  getCount() { return this.rows.length; }
};
const selection = {
  selected: [],
  selectAll() { this.selected = reviewStore.rows.map(row => ({get: key => row[key]})); },
  getSelection() { return this.selected; }
};
const review = Object.assign({}, dialog, {
  parsedRows: [
    ['MPN', 'LCSC', 'Qty'],
    ['first', 'C1', '10'],
    ['second,"part"', 'C2', '20']
  ],
  csvDelimiter: ',',
  reviewStore,
  reviewGrid: {getSelectionModel: () => selection},
  reviewCount: {setText(value) { review.count = value; }},
  reviewStartButton: {setDisabled(value) { review.startDisabled = value; }},
  getLayout: () => ({setActiveItem: value => { review.activeCard = value; }}),
  refreshReviewCount() { bulk.refreshReviewCount.call(this); },
  selectedCsvFile() { return bulk.selectedCsvFile.call(this); }
});
review.projectModeCombo = field('inventory');
review.mpnColumn = field(0);
review.lcscColumn = field(1);
review.qtyColumn = field(2);
review.hasHeaderCheckbox = field(true);
bulk.onReview.call(review);
assert.equal(review.activeCard, 'step-review');
assert.equal(review.count, '2 / 2 selected');
selection.selected = [selection.selected[1]];
bulk.refreshReviewCount.call(review);
assert.equal(review.count, '1 / 2 selected');
bulk.onSubmit.call(review);
assert.equal(request.url, '/api/bulk-import');
request.rawData.values.file.text().then(text => {
  assert.equal(text, 'MPN,LCSC,Qty\r\n"second,""part""",C2,20\r\n');
  console.log('Bulk import review selects rows locally; existing API receives only selected CSV rows');
}).catch(error => { throw error; });
