const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let grid;
let request;
let viewer;
const Ext = {
  define: (_name, definition) => { grid = definition; },
  htmlEncode: text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
  create: (name, config) => {
    if (name === 'Ext.Component') {
      viewer = {...config, update: html => { viewer.html = html; }};
      return viewer;
    }
    return {...config, show() { return this; }};
  },
  Ajax: {request: options => { request = options; }}
};
const filename = path.join(__dirname, '../../assets/limas/Components/Widgets/AttachmentGrid.js');
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {Ext, i18n: text => text}, {filename});

const record = {get: key => key === 'originalFilename' ? 'bom.csv' : null, getId: () => '/api/project_attachments/1'};
grid.viewAttachment.call({viewTextAttachment: grid.viewTextAttachment}, record);
assert.equal(request.url, '/api/project_attachments/1/getFile');
request.success({responseText: 'part,description\n1,<script>alert(1)</script>'});
assert.match(viewer.html, /&lt;script&gt;/);
assert.doesNotMatch(viewer.html, /<script>/);

console.log('CSV attachments are fetched and escaped in a viewer');
