const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const classes = {};
const deferred = [];
const opened = [];
const distributors = [{get: key => key === 'name' ? 'LCSC' : '/api/distributors/30'}];
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
  data: {StoreManager: {lookup: () => distributorStore}},
  htmlEncode: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
};
const context = {Ext, i18n: text => text, window: {open: (...args) => opened.push(args)}};
for (const filename of ['PartsGrid.js', 'PartsManager.js']) {
  const file = path.join(__dirname, '../../assets/limas/Components/Part', filename);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, {filename: file});
}

const part = {get: key => key === 'distributorNumbers'
  ? {'/api/distributors/30': {sku: 'C25862', orderNumber: 'C25862'}} : null};
const gridClass = classes['Limas.PartsGrid'];
const grid = {
  selectedDistributorId: '/api/distributors/30',
  selectedDistributorName: 'lcsc',
  selectedDistributorField: 'sku',
  getLcscProductUrl: record => gridClass.getLcscProductUrl.call(grid, record)
};
assert.equal(grid.getLcscProductUrl(part), 'https://www.lcsc.com/product-detail/C25862.html');
gridClass.defineColumns.call(grid);
const column = grid.columns.find(item => item.dataIndex === 'distributorNumbers');
const cell = column.renderer('[object Object]', {}, part);
assert.match(cell, /distributor-icon lcsc/);
assert.match(cell, /C25862/);
assert.match(cell, /href="https:\/\/www\.lcsc\.com\/product-detail\/C25862\.html"/);
assert.match(cell, /target="_blank"/);
const missingCode = {get: () => ({})};
assert.equal(grid.getLcscProductUrl(missingCode), null);
assert.equal(column.renderer('[object Object]', {}, missingCode), '');

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
assert.equal(menu.items[3].disabled, false);
menu.click(3);
assert.deepEqual(opened[0], ['https://www.lcsc.com/product-detail/C25862.html', '_blank', 'noopener,noreferrer']);

console.log('Part distributor column, LCSC link, and context actions passed');
