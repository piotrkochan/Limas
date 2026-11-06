const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let editorClass;
const Ext = {
  define: (_name, definition) => { editorClass = definition; },
  Object: {merge: Object.assign},
  create: (name, config) => {
    if (name === 'Ext.data.Store') return {model: config.model};
    const component = {...config};
    if (name === 'Limas.ProjectPartGrid' || name === 'Limas.ProjectAttachmentGrid') {
      component.bindStore = store => { component.boundStore = store; };
    }
    if (name === 'Ext.tab.Panel') {
      component.setActiveTab = tab => { component.activeTab = tab; };
    }
    return component;
  }
};
const filename = path.join(__dirname, '../../assets/limas/Components/Project/ProjectEditor.js');
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {Ext, i18n: text => text}, {filename});

const editor = {on: () => {}, callParent: () => {}};
editorClass.initComponent.call(editor);

assert.equal(editorClass.layout, 'fit');
assert.equal(editor.items, editor.tabPanel);
assert.equal(editor.tabPanel.items[0], editor.partGrid);
assert.equal(editor.tabPanel.items[1], editor.detailsPanel);
assert.equal(editor.tabPanel.items[2], editor.attachmentGrid);
assert.deepEqual(Array.from(editor.detailsPanel.items, field => field.name), ['name', 'description']);

const projectParts = {};
const attachments = {};
editor.record = {phantom: false, parts: () => projectParts, attachments: () => attachments};
editorClass.onEditStart.call(editor);
assert.equal(editor.tabPanel.activeTab, editor.partGrid);
assert.equal(editor.partGrid.boundStore, projectParts);
assert.equal(editor.attachmentGrid.boundStore, attachments);

editor.record = {phantom: true, parts: () => projectParts, attachments: () => attachments};
editorClass.onEditStart.call(editor);
assert.equal(editor.tabPanel.activeTab, editor.detailsPanel);

console.log('Existing projects open on parts; new projects open on details');
