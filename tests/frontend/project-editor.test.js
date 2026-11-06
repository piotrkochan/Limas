const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let editorClass;
const Ext = {
  define: (_name, definition) => { editorClass = definition; },
  bind: (fn, scope) => fn.bind(scope),
  Object: {merge: Object.assign},
  create: (name, config) => {
    if (name === 'Ext.data.Store') return {model: config.model};
    const component = {...config};
    if (name === 'Limas.ProjectPartGrid' || name === 'Limas.ProjectAttachmentGrid') {
      component.bindStore = store => { component.boundStore = store; };
      component.getDockedItems = () => [{add: () => {}}];
    }
    if (name === 'Ext.tab.Panel') {
      component.setActiveTab = tab => { component.activeTab = tab; };
      component.getActiveTab = () => component.activeTab;
      component.on = () => {};
    }
    if (name === 'Ext.button.Button') {
      component.show = () => { component.hidden = false; };
      component.hide = () => { component.hidden = true; };
    }
    return component;
  }
};
const filename = path.join(__dirname, '../../assets/limas/Components/Project/ProjectEditor.js');
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {Ext, i18n: text => text}, {filename});

const editor = {
  on: () => {},
  callParent: () => {},
  _onItemSave: () => {},
  bottomToolbar: {setHidden: hidden => { editor.footerHidden = hidden; }}
};
Object.assign(editor, editorClass);
editorClass.initComponent.call(editor);

assert.equal(editorClass.layout, 'fit');
assert.equal(editor.items, editor.tabPanel);
assert.equal(editor.tabPanel.items[0], editor.partGrid);
assert.equal(editor.tabPanel.items[1], editor.detailsPanel);
assert.equal(editor.tabPanel.items[2], editor.attachmentGrid);
assert.deepEqual(Array.from(editor.detailsPanel.items, field => field.name), ['name', 'description']);

const projectParts = {on: () => {}, un: () => {}};
const attachments = {};
editor.record = {phantom: false, parts: () => projectParts, attachments: () => attachments};
editorClass.onEditStart.call(editor);
assert.equal(editor.tabPanel.activeTab, editor.partGrid);
assert.equal(editor.partGrid.boundStore, projectParts);
assert.equal(editor.attachmentGrid.boundStore, attachments);
assert.equal(editor.footerHidden, true);
editorClass.markPartsDirty.call(editor);
assert.equal(editor.partsSaveButton.hidden, false);

editor.record = {phantom: true, parts: () => projectParts, attachments: () => attachments};
editorClass.onEditStart.call(editor);
assert.equal(editor.tabPanel.activeTab, editor.detailsPanel);
assert.equal(editor.footerHidden, false);

console.log('Existing projects open on parts; new projects open on details');
