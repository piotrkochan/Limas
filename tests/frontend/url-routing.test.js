const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let app;
const Limas = {};
const window = {location: {hash: ''}};
const Ext = {
  namespace: () => {},
  application: config => { app = config; }
};
const file = path.join(__dirname, '../../assets/limas/Limas.js');
vm.runInNewContext(fs.readFileSync(file, 'utf8'), {Ext, Limas, window, URLSearchParams}, {filename: file});

let active;
let applied;
let opened;
const parts = {
  getRouteQuery: () => '?project=78&category=123&page=2&part=456',
  applyRouteQuery: params => { applied = Object.fromEntries(params); }
};
app.partManager = parts;
app.centerPanel = {
  getActiveTab: () => active,
  setActiveTab: tab => { active = tab; }
};
app.openAppItem = target => { opened = target; active = {$className: target}; };
active = parts;
assert.equal(app.buildRoute(), '#/parts?project=78&category=123&page=2&part=456');
app.writeRoute();
assert.equal(window.location.hash, '#/parts?project=78&category=123&page=2&part=456');
assert.equal(app.lastWrittenRoute, window.location.hash);
app.onRouteHashChange();
assert.equal(applied, undefined); // Own hash change must not reload the parts store.

window.location.hash = '#/projects';
app.onRouteHashChange();
assert.equal(opened, 'Limas.ProjectEditorComponent');
assert.equal(app.buildRoute(), '#/projects');

window.location.hash = '#/parts?project=78&category=123&page=2&part=456';
app.onRouteHashChange();
assert.equal(active, parts);
assert.deepEqual(applied, {project: '78', category: '123', page: '2', part: '456'});

parts.routePending = true;
window.location.hash = '#/parts';
app.writeRoute();
assert.equal(window.location.hash, '#/parts');

console.log('URL routing and browser history passed');
