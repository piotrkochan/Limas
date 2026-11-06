const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let grid;
let request;
let viewer;
let table;
const Ext = {
  define: (_name, definition) => { grid = definition; },
  htmlEncode: text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  String: {format: (text, ...args) => text.replace(/\{(\d+)\}/g, (_, index) => args[Number(index)])},
  create: (name, config) => {
    if (name === 'Ext.panel.Panel') {
      viewer = {...config, update: html => { viewer.html = html; }, removeAll() {}, add(item) { table = item; }};
      return viewer;
    }
    return {...config, show() { return this; }};
  },
  Ajax: {request: options => { request = options; }}
};
const filename = path.join(__dirname, '../../assets/limas/Components/Widgets/AttachmentGrid.js');
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {Ext, i18n: text => text}, {filename});

const record = {get: key => key === 'originalFilename' ? 'bom.csv' : null, getId: () => '/api/project_attachments/1'};
grid.viewAttachment.call({viewTextAttachment: grid.viewTextAttachment, parseAttachmentCsv: grid.parseAttachmentCsv}, record);
assert.equal(request.url, '/api/project_attachments/1/getFile');
request.success.call(request.scope, {responseText: 'part,description\n1,<script>alert(1)</script>'});
assert.equal(table.columns[0].text, 'part');
assert.equal(table.columns[1].text, 'description');
assert.equal(table.store.data[0].column0, '1');
assert.equal(table.columns[1].renderer(table.store.data[0].column1), '&lt;script&gt;alert(1)&lt;/script&gt;');
assert.equal(JSON.stringify(grid.parseAttachmentCsv('a;b\n"a;b";"line 1\nline 2"')),
  JSON.stringify([['a', 'b'], ['a;b', 'line 1\nline 2']]));

console.log('CSV attachments render as escaped table cells');
