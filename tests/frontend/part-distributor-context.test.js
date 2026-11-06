const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const classes = {};
const deferred = [];
const opened = [];
const distributors = [
  {get: key => key === 'name' ? 'LCSC' : '/api/distributors/30'},
  {get: key => key === 'name' ? 'TME' : '/api/distributors/31'}
];
const distributorStore = {each: callback => distributors.forEach(callback)};
let menu;
const Ext = {
  define: (name, definition) => { classes[name] = definition; },
  bind: (handler, scope) => handler.bind(scope),
  defer: (handler, delay, scope) => deferred.push(() => handler.call(scope)),
  Array: {
    contains: (items, value) => items.includes(value),
    each: (items, callback, scope) => items.forEach(item => callback.call(scope, item))
  },
  isArray: Array.isArray,
  Object: {each: (object, callback) => Object.entries(object).forEach(([key, value]) => callback(key, value))},
  data: {StoreManager: {lookup: () => distributorStore}},
  htmlEncode: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
};
const context = {Ext, Limas: {getApplication: () => ({
  convertCurrency: (value, source) => source === 'EUR' ? Number(value) : null,
  getDisplayCurrency: () => 'EUR'
})}, i18n: text => text, window: {
  open: (...args) => opened.push(args),
  getComputedStyle: () => ({font: '14px sans-serif'})
}};
for (const filename of ['PartsGrid.js', 'PartsManager.js', 'Editor/PartDistributorGrid.js']) {
  const file = path.join(__dirname, '../../assets/limas/Components/Part', filename);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, {filename: file});
}

const part = {get: key => key === 'distributorNumbers'
  ? {'/api/distributors/30': {
    sku: 'C25862', orderNumber: 'C25862', price: '0.0127', currency: 'USD',
    priceBreaks: [{quantity: 50, price: '0.01270000'}, {quantity: 500, price: '0.01100000'}],
    rohsStatus: 'certified', assemblyClass: 'basic'
  }, '/api/distributors/31': {
    sku: 'SMD0402-10K-1%', price: '0.02', currency: 'EUR', priceBreaks: []
  }} : null};
const gridClass = classes['Limas.PartsGrid'];
assert.equal(gridClass.viewConfig.getRowClass({get: key => key === 'stockLevel' ? 0 : false}), 'limas-row-zero-stock');
assert.equal(gridClass.viewConfig.getRowClass({get: key => key === 'stockLevel' ? 5 : false}), '');
assert.equal(classes['Limas.PartDistributorGrid'].formatExactPrice('0.01270000', 'USD'), '0.0127 USD');
let selectorWidth;
gridClass.fitCatalogSelector({
  rendered: true,
  inputEl: {dom: {ownerDocument: {createElement: () => ({
    getContext: () => ({measureText: text => ({width: text.length * 10})})
  })}}},
  labelWidth: 35,
  setWidth: width => { selectorWidth = width; }
}, {each: callback => ['SKU', 'Order Number'].forEach(label => callback({get: () => label}))}, 'label');
assert.equal(selectorWidth, 205);
const grid = {
  selectedDistributorIds: null,
  selectedDistributorField: 'sku',
  getLcscProductUrl: record => gridClass.getLcscProductUrl.call(grid, record),
  getSelectedCatalogEntries: record => gridClass.getSelectedCatalogEntries.call(grid, record),
  getDistributorNumberInfoFor: (record, id, name) => gridClass.getDistributorNumberInfoFor.call(grid, record, id, name),
  getDistributorNumberInfo: record => gridClass.getDistributorNumberInfo.call(grid, record),
  renderDistributorNumberInfo: info => gridClass.renderDistributorNumberInfo.call(grid, info),
  renderDistributorNumber: record => gridClass.renderDistributorNumber.call(grid, record),
  renderDistributorPriceFor: (record, id, metadata) => gridClass.renderDistributorPriceFor.call(grid, record, id, metadata),
  renderDistributorPrice: (record, metadata) => gridClass.renderDistributorPrice.call(grid, record, metadata),
  renderDistributorAttribute: (record, field, labels) => gridClass.renderDistributorAttribute.call(grid, record, field, labels),
  fitCatalogSelector: () => {}
};
assert.equal(grid.getLcscProductUrl(part), 'https://www.lcsc.com/product-detail/C25862.html');
grid.catalogDistributors = {
  each: (callback, scope) => distributors.forEach(distributor => callback.call(scope, distributor))
};
assert.equal(grid.getDistributorNumberInfo(part).number, 'C25862');
const priceCell = {};
assert.match(grid.renderDistributorPrice(part, priceCell), /LCSC: 0\.0127 USD \(50\+\)/);
assert.match(grid.renderDistributorPrice(part, priceCell), /TME: 0\.02 EUR/);
assert.match(grid.renderDistributorPrice(part, priceCell), /50\+: 0\.0127 USD<br>500\+: 0\.011 USD/);
grid.selectedDistributorIds = ['/api/distributors/30'];
assert.equal(grid.renderDistributorPrice(part, priceCell), '0.0127 USD (50+)');
assert.match(priceCell.tdAttr, /500\+: 0\.011 USD/);
gridClass.defineColumns.call(grid);
const categoryColumn = grid.columns.find(item => item.dataIndex === 'category.categoryPath');
assert.equal(categoryColumn.renderer('Root Category ➤ Złącza'), 'Złącza');
grid.getDefaultColumnConfiguration = () => grid.columns;
const presetColumns = gridClass.preparePresetColumns.call(grid, [
  {text: 'Avg. Price', dataIndex: 'averagePrice'},
  {text: 'Distributor number', dataIndex: 'distributorNumbers'},
  {text: 'Internal ID', dataIndex: '@id'}
]);
assert.deepEqual(presetColumns.map(item => item.text || item.header),
  ['Distributor number', 'Distributor price', 'RoHS', 'Assembly class', 'Catalog package']);
assert.equal(presetColumns[2].hidden, true);
assert.equal(presetColumns[3].hidden, true);
assert.equal(presetColumns[4].hidden, true);
assert.equal(grid.columns.find(item => item.header === 'RoHS').renderer(null, {}, part), 'Certified');
assert.equal(grid.columns.find(item => item.header === 'Assembly class').renderer(null, {}, part), 'Basic');
assert.equal(presetColumns[0].renderer('[object Object]', {}, part).includes('C25862'), true);
assert.equal(presetColumns[1].renderer('[object Object]', {}, part), '0.0127 USD (50+)');
const column = grid.columns.find(item => item.dataIndex === 'distributorNumbers');
const cell = column.renderer('[object Object]', {}, part);
assert.match(cell, /distributor-icon lcsc/);
assert.match(cell, /C25862/);
assert.match(cell, /href="https:\/\/www\.lcsc\.com\/product-detail\/C25862\.html"/);
assert.match(cell, /target="_blank"/);
const missingCode = {get: () => ({})};
assert.equal(grid.getLcscProductUrl(missingCode), null);
assert.equal(column.renderer('[object Object]', {}, missingCode), '');

const choices = [];
grid.store = {each: callback => [part].forEach(callback)};
grid.catalogDistributors = {
  loadData: data => { choices.splice(0, choices.length, ...data.map(item => ({get: key => item[key]}))); },
  findRecord: (field, value) => choices.find(item => item.get(field) === value),
  each: (callback, scope) => choices.forEach(item => callback.call(scope, item)),
  getAt: index => choices[index]
};
let menuItems = [];
grid.catalogDistributorMenu = {
  removeAll: () => { menuItems = []; },
  add: item => {
    if (typeof item === 'string') return item;
    const component = {...item, setChecked: checked => { component.checked = checked; }};
    menuItems.push(component);
    return component;
  }
};
grid.catalogDistributor = {setText: text => { grid.catalogLabel = text; }};
grid.getView = () => ({refresh: () => {}});
grid.fireEvent = () => {};
grid.refreshCatalogDistributorMenu = () => gridClass.refreshCatalogDistributorMenu.call(grid);
grid.syncCatalogDistributorMenu = () => gridClass.syncCatalogDistributorMenu.call(grid);
grid.setSelectedCatalogDistributors = ids => gridClass.setSelectedCatalogDistributors.call(grid, ids);
grid.selectedDistributorIds = null;
gridClass.refreshCatalogDistributors.call(grid);
assert.deepEqual(choices.map(item => item.get('name')), ['LCSC', 'TME']);
assert.match(grid.catalogLabel, /Auto/);
assert.equal(menuItems[0].checked, true);
assert.equal(menuItems[2].checked, true);
assert.match(grid.renderDistributorNumber(part), /C25862/);
assert.match(grid.renderDistributorNumber(part), /SMD0402-10K-1%/);
assert.match(grid.renderDistributorNumber(part), /href="https:\/\/www\.tme\.eu\/details\/SMD0402-10K-1%25\/"/);
assert.match(grid.renderDistributorPrice(part, {}), /LCSC: 0\.0127 USD/);
assert.match(grid.renderDistributorPrice(part, {}), /TME: 0\.02 EUR/);
menuItems[1].listeners.checkchange.call(grid, null, false);
assert.deepEqual(Array.from(grid.selectedDistributorIds), ['/api/distributors/31']);
assert.doesNotMatch(grid.renderDistributorNumber(part), /C25862/);
assert.match(grid.renderDistributorNumber(part), /SMD0402-10K-1%/);
menuItems[0].listeners.checkchange.call(grid, null, true);
assert.equal(grid.selectedDistributorIds, null);
grid.store = {each: callback => [missingCode].forEach(callback)};
gridClass.refreshCatalogDistributors.call(grid);
assert.equal(choices.length, 0);
assert.equal(grid.selectedDistributorIds, null);
grid.store = {each: callback => [part].forEach(callback)};
gridClass.refreshCatalogDistributors.call(grid);

let store;
Ext.create = (name, config) => {
  if (name === 'Limas.Data.Store.PartStore') {
    assert.equal(config.autoLoad, false);
    store = {
      proxy: {extraParams: {}},
      getProxy() { return this.proxy; },
      load() { assert.equal(this.proxy.extraParams.includeDistributorNumbers, 1); }
    };
    return store;
  }
  if (name === 'Ext.menu.Menu') {
    menu = {
      items: config.items,
      on(event, handler) { assert.equal(event, 'hide'); this.onHide = handler; },
      showAt() {},
      destroy() { this.destroyed = true; },
      click(index) {
        this.onHide(); // ExtJS hides the menu before calling the item handler.
        if (!this.destroyed) this.items[index].handler();
      }
    };
    return menu;
  }
  return config;
};
const managerClass = classes['Limas.PartManager'];
managerClass.createStore.call({});

const actions = [];
const manager = {
  grid,
  projects: [],
  onEditPart: () => actions.push('edit'),
  changeStockFromMenu: (_record, add) => actions.push(add ? 'add' : 'remove')
};
for (const [index, action] of [[0, 'edit'], [1, 'add'], [2, 'remove']]) {
  managerClass.showPartContextMenu.call(manager, part, [10, 20]);
  menu.click(index);
  assert.equal(actions.at(-1), action);
  assert.equal(menu.destroyed, undefined);
  deferred.shift()();
  assert.equal(menu.destroyed, true);
}
managerClass.showPartContextMenu.call(manager, part, [10, 20]);
assert.equal(menu.items[4].text, 'Update distributor data…');
assert.equal(menu.items[5].disabled, false);
menu.click(5);
assert.deepEqual(opened[0], ['https://www.lcsc.com/product-detail/C25862.html', '_blank', 'noopener,noreferrer']);

console.log('Part distributor column, LCSC link, and context actions passed');
