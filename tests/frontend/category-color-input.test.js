const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const classes = {};
const Ext = {define: (name, definition) => { classes[name] = definition; }};
const filename = path.join(__dirname, '../../assets/limas/Components/Part/PartCategoryEditorWindow.js');
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {Ext, i18n: text => text}, {filename});

const colorInput = classes['Limas.ColorInput'];
const input = {
  value: '#d4ad4a',
  rendered: false,
  el: {dom: {value: '', disabled: false}},
  callParent(args) { if (args.length && typeof args[0] === 'boolean') this.disabled = args[0]; },
  mon: () => {}
};
assert.equal(colorInput.getValue.call(input), '#d4ad4a');
colorInput.setValue.call(input, '#2196f3');
colorInput.setDisabled.call(input, true);
colorInput.afterRender.call(input);
assert.equal(input.el.dom.value, '#2196f3');
assert.equal(input.el.dom.disabled, true);
input.rendered = true;
input.el.dom.value = '#ff0000';
colorInput.onNativeColorChange.call(input);
assert.equal(colorInput.getValue.call(input), '#ff0000');
colorInput.setValue.call(input, '#00ff00');
assert.equal(input.el.dom.value, '#00ff00');
colorInput.setDisabled.call(input, true);
assert.equal(input.el.dom.disabled, true);

console.log('Native folder color value stays in sync with the visible picker');
