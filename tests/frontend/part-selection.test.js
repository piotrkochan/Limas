const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let gridClass;
const Ext = {define: (_name, definition) => { gridClass = definition; }};
const filename = path.join(__dirname, '../../assets/limas/Components/Part/PartsGrid.js');
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {Ext, i18n: text => text}, {filename});

assert.equal(gridClass.selModel.selType, 'checkboxmodel');
assert.equal(gridClass.selModel.mode, 'MULTI');
assert.equal(gridClass.selModel.checkOnly, false);
assert.equal(gridClass.selModel.showHeaderCheckbox, true);
assert.equal(gridClass.viewConfig.enableTextSelection, true);

let prevented = 0;
const event = {shiftKey: true, button: 0, preventDefault: () => { prevented++; }};
gridClass.onBeforePartMouseDown(null, null, null, 0, event);
assert.equal(prevented, 1);
const selectedRecord = {};
const rightClick = {button: 2};
assert.equal(gridClass.onBeforePartMouseDown.call({getSelectionModel: () => ({isSelected: part => part === selectedRecord})}, null, selectedRecord, null, 0, rightClick), false);
assert.equal(gridClass.onBeforePartMouseDown.call({getSelectionModel: () => ({isSelected: () => false})}, null, selectedRecord, null, 0, rightClick), undefined);
event.shiftKey = false;
gridClass.onBeforePartMouseDown(null, null, null, 0, event);
assert.equal(prevented, 1);

let countText;
let clearDisabled;
let selectDisabled;
const grid = {
  getSelectionModel: () => ({getCount: () => 2, isSelected: part => part < 2}),
  store: {getRange: () => Array.from({length: 10}, (_, index) => index)},
  selectedCountItem: {setText: text => { countText = text; }},
  clearSelectionButton: {setDisabled: disabled => { clearDisabled = disabled; }},
  selectPageButton: {setDisabled: disabled => { selectDisabled = disabled; }}
};
gridClass.updateSelectionStatus.call(grid);
assert.equal(countText, 'Selected: 2');
assert.equal(clearDisabled, false);
assert.equal(selectDisabled, false);

console.log('Parts selection keeps text copy and reports selected row count');
