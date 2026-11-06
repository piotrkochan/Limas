const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let editorClass;
let attachmentGridClass;
let loadedProject;
const Ext = {
  define: (name, definition) => {
    if (name === 'Limas.ProjectEditor') editorClass = definition;
    if (name === 'Limas.ProjectAttachmentGrid') attachmentGridClass = definition;
  },
  ClassManager: {get: () => ({load: (_id, options) => options.success.call(options.scope, loadedProject)})},
  bind: (fn, scope) => fn.bind(scope),
  Object: {merge: Object.assign},
  create: (name, config) => {
    if (name === 'Ext.data.Store') return {model: config.model};
    const component = {...config};
    if (name === 'Limas.ProjectPartGrid' || name === 'Limas.ProjectAttachmentGrid') {
      component.bindStore = store => { component.boundStore = store; };
      component.setDisabled = disabled => { component.disabled = disabled; };
      component.getDockedItems = () => [{add: () => {}}];
      component.on = (event, handler, scope) => { component.listeners = {[event]: handler.bind(scope)}; };
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
const gridFilename = path.join(__dirname, '../../assets/limas/Components/Project/ProjectAttachmentGrid.js');
vm.runInNewContext(fs.readFileSync(gridFilename, 'utf8'), {Ext}, {filename: gridFilename});

const editor = {
  on: () => {},
  callParent: () => {},
  _onItemSave: () => {},
  bottomToolbar: {setHidden: hidden => { editor.footerHidden = hidden; }}
};
Object.assign(editor, editorClass);
editorClass.initComponent.call(editor);

assert.equal(editorClass.layout, 'fit');
assert.equal(editorClass.editAfterSave, false);
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
assert.equal(editor.attachmentGrid.disabled, false);
assert.equal(editor.footerHidden, true);
editor.tabPanel.setActiveTab(editor.attachmentGrid);
editorClass.updateSaveToolbar.call(editor);
assert.equal(editor.footerHidden, true);
editor.tabPanel.setActiveTab(editor.detailsPanel);
editorClass.updateSaveToolbar.call(editor);
assert.equal(editor.footerHidden, false);
editorClass.markPartsDirty.call(editor);
assert.equal(editor.partsSaveButton.hidden, false);

editor.record = {phantom: true, parts: () => projectParts, attachments: () => attachments};
editorClass.onEditStart.call(editor);
assert.equal(editor.tabPanel.activeTab, editor.detailsPanel);
assert.equal(editor.footerHidden, false);
assert.equal(editor.attachmentGrid.disabled, true);

let uploadSaved = false;
editor.record = {phantom: false};
editor._onItemSave = () => { uploadSaved = true; };
editor.attachmentGrid.listeners.attachmentUploaded();
assert.equal(uploadSaved, true);
editor.record = {phantom: true};
uploadSaved = false;
editor.attachmentGrid.listeners.attachmentUploaded();
assert.equal(uploadSaved, false);

let parentCalled = false;
let uploadEvent;
attachmentGridClass.onFileUploaded.call({
  callParent: () => { parentCalled = true; },
  fireEvent: event => { uploadEvent = event; }
}, {id: 1});
assert.equal(parentCalled, true);
assert.equal(uploadEvent, 'attachmentUploaded');

const freshParts = {on: () => {}, un: () => {}};
const freshAttachments = {};
loadedProject = {getId: () => '/api/projects/6', parts: () => freshParts, attachments: () => freshAttachments};
editor.record = {getId: () => '/api/projects/6'};
editor.model = 'Limas.Entity.Project';
editor.getForm = () => ({loadRecord: record => { editor.formRecord = record; }});
editorClass._onItemSaved.call(editor, editor.record);
assert.equal(editor.record, loadedProject);
assert.equal(editor.attachmentGrid.boundStore, freshAttachments);
assert.equal(editor.attachmentGrid.disabled, false);
assert.equal(editor.formRecord, loadedProject);

console.log('Project attachments reload after save and footer appears only in details');
