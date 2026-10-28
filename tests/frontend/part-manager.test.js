const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const classes = {};
const Ext = {
  define: (name, definition) => { classes[name] = definition; },
  Array: {each: (items, callback) => items.forEach(callback)},
  htmlEncode: text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
};
for (const filename of ['PartCategoryTree.js', 'PartsManager.js']) {
  const file = path.join(__dirname, '../../assets/limas/Components/Part', filename);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {Ext, i18n: text => text}, {filename: file});
}

function node(id, children = []) {
  return {get: () => '/api/part_categories/' + id, getId: () => id, childNodes: children};
}
const empty = node(3);
const populated = node(2);
const parent = node(1, [populated, empty]);
const root = {get: () => '@local-tree-root', getId: () => '@local-tree-root', childNodes: [parent]};
const tree = {
  getRootNode: () => root,
  getView: () => ({refresh: () => {}})
};
const categoryTree = classes['Limas.PartCategoryTree'];
categoryTree.setPartCounts.call(tree, {'2': 4});
assert.equal(tree.subtreePartCounts['1'], 4);
assert.equal(tree.subtreePartCounts['2'], 4);
assert.equal(tree.subtreePartCounts['3'], 0);
const populatedMeta = {};
assert.equal(categoryTree.renderCategoryName.call(tree, 'Parent', populatedMeta, parent), 'Parent (4)');
const emptyMeta = {};
assert.equal(categoryTree.renderCategoryName.call(tree, 'Empty', emptyMeta, empty), 'Empty');
assert.match(emptyMeta.tdStyle, /opacity/);

const manager = classes['Limas.PartManager'];
const changes = [];
const filters = {
  beginUpdate: () => changes.push('begin'),
  add: filter => changes.push(['add', filter]),
  remove: filter => changes.push(['remove', filter]),
  endUpdate: () => changes.push('end')
};
Ext.create = (_name, config) => config;
const context = {
  projectsLoaded: true,
  activeProject: '',
  store: {getFilters: () => filters},
  refreshCategoryCounts: () => {},
};
manager.onProjectContextChange.call(context, null, '/api/projects/3');
assert.equal(context.projectContextFilter.property, 'projectParts.project');
assert.equal(context.projectContextFilter.value, '/api/projects/3');
manager.onProjectContextChange.call(context, null, '');
assert.equal(context.activeProject, '');
assert.equal(context.projectContextFilter, null);
assert.equal(changes.filter(change => Array.isArray(change) && change[0] === 'remove').length, 1);

console.log('Part Manager category counts and project context passed');
