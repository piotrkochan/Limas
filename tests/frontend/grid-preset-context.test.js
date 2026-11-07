const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let state;
const Ext = {
  define: (_name, definition) => { state = definition; },
  isArray: Array.isArray,
  apply: (_target, source) => ({...source}),
  create: (_name, config) => ({...config})
};
const filename = path.join(__dirname, '../../assets/limas/Components/Grid/GridPresetState.js');
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {Ext}, {filename});

const filter = (id, property, value) => ({
  id, property, value,
  getId() { return this.id; },
  getProperty() { return this.property; },
  getState() { return {id, property, value}; }
});
const project = filter('projectContextFilter', 'projectParts.project', '/api/projects/5');
const category = filter('categoryFilter', 'category', ['/api/part_categories/1']);
const custom = filter('stock', 'stockLevel', 0);
let live = [project, category, custom];
const store = {
  getFilters: () => ({items: live}),
  setFilters: filters => { live = filters; }
};
const grid = {
  store,
  getColumns: () => [],
  reconfigure: () => {},
  getDefaultColumnConfiguration: () => []
};
assert.deepEqual(Array.from(state.captureFilters(grid), item => item.id), ['stock']);
state.apply(grid, {columns: [], filters: [
  {id: 'projectContextFilter', property: 'projectParts.project', value: '/api/projects/7'},
  {id: 'categoryFilter', property: 'category', value: ['/api/part_categories/9']},
  {id: 'name', property: 'name', value: 'test'}
]});
assert.equal(live[0], project);
assert.equal(live[1], category);
assert.equal(live[2].property, 'name');
assert.equal(live.length, 3);
state.applyDefault(grid);
assert.deepEqual(Array.from(live, item => item.id), ['projectContextFilter', 'categoryFilter']);
console.log('Grid preset keeps current project and category filters');
