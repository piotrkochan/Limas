const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const classes = {};
class FilterPlugin {
  constructor(enabled, filter = null) { this.enabled = enabled; this.filter = filter; }
  isEnabled() { return this.enabled; }
  getFilter() { throw new Error('A disabled filter must not be rebuilt'); }
}
const Limas = {Util: {FilterPlugin}, getApplication: () => ({writeRoute: () => {}})};
const Ext = {
  define: (name, definition) => { classes[name] = definition; },
  Array: {each: (items, callback) => items.forEach(callback), map: (items, callback) => items.map(callback)},
  decode: JSON.parse,
  htmlEncode: text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
};
for (const filename of ['PartCategoryTree.js', 'PartsManager.js', 'PartFilterPanel.js']) {
  const file = path.join(__dirname, '../../assets/limas/Components/Part', filename);
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), {Ext, Limas, URLSearchParams, i18n: text => text}, {filename: file});
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
assert.equal(categoryTree.folderColorFilter('#ff0000') !== '', true);
assert.equal(categoryTree.folderColorFilter(null), '');
assert.equal(categoryTree.folderColorFilter('red'), '');

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
  allPartsValue: manager.allPartsValue,
  store: {getFilters: () => filters},
  refreshCategoryCounts: () => {},
};
assert.ok(manager.allPartsValue);
manager.onProjectContextChange.call(context, null, '/api/projects/3');
assert.equal(context.projectContextFilter.property, 'projectParts.project');
assert.equal(context.projectContextFilter.value, '/api/projects/3');
manager.onProjectContextChange.call(context, null, manager.allPartsValue);
assert.equal(context.activeProject, '');
assert.equal(context.projectContextFilter, null);
assert.equal(changes.filter(change => Array.isArray(change) && change[0] === 'remove').length, 1);
manager.onProjectContextChange.call(context, null, 'extModel442-2');
assert.equal(context.activeProject, '');
assert.equal(changes.filter(change => Array.isArray(change) && change[0] === 'add').length, 1);

let projectOptions;
let selectedProjectValue;
const choicesContext = {
  allPartsValue: manager.allPartsValue,
  activeProject: '',
  projectChoices: {loadData: items => { projectOptions = items; }},
  projectSelector: {setValue: value => { selectedProjectValue = value; }},
  applyPendingRoute: () => {}
};
Ext.Ajax = {request: options => options.success.call(options.scope, {responseText: '[]'})};
manager.loadProjects.call(choicesContext);
assert.equal(projectOptions[0].id, manager.allPartsValue);
assert.equal(selectedProjectValue, manager.allPartsValue);

let categoryDeselected = false;
let categoryFilterRemoved = false;
const categorySearchContext = {
  selectedCategory: {},
  categoryFilter: {},
  store: {getFilters: () => ({remove: () => { categoryFilterRemoved = true; }})},
  tree: {getSelectionModel: () => ({deselectAll: () => { categoryDeselected = true; }})},
  grid: {removeNotification: () => {}}
};
manager.onBeforePartSearch.call(categorySearchContext);
assert.equal(categorySearchContext.selectedCategory, null);
assert.equal(categorySearchContext.categoryFilter, null);
assert.equal(categoryDeselected, true);
assert.equal(categoryFilterRemoved, true);

let request;
let responseCounts;
Ext.Ajax = {request: options => { request = options; }};
manager.refreshCategoryCounts.call({
  activeProject: '/api/projects/3',
  tree: {setPartCounts: counts => { responseCounts = counts; }}
});
assert.equal(request.method, 'GET');
assert.equal(request.params.project, '3');
request.success.call(request.scope, {responseText: '{"2":1}'});
assert.equal(responseCounts['2'], 1);

const disabledFilter = new FilterPlugin(false);
let disabledCalls = 0;
const filterPanel = {
  suspendRemovals: false,
  filterControls: [{findPlugin: () => disabledFilter, disableFilter: () => { disabledCalls++; }}],
  store: {getFilters: () => ({contains: () => false})}
};
classes['Limas.PartFilterPanel']._onFilterRemove.call(filterPanel);
assert.equal(disabledCalls, 0);

const enabledFilter = new FilterPlugin(true, {id: 'categoryFilter'});
filterPanel.filterControls = [{findPlugin: () => enabledFilter, disableFilter: () => { disabledCalls++; }}];
classes['Limas.PartFilterPanel']._onFilterRemove.call(filterPanel);
assert.equal(disabledCalls, 1);

const routeContext = {
  activeProject: '/api/projects/78',
  selectedCategory: {get: key => key === '@id' ? '/api/part_categories/123' : null},
  store: {currentPage: 2},
  grid: {
    gridPresetButton: {activePresetId: '42'},
    selectedDistributorField: 'orderNumber',
    selectedDistributorIds: ['/api/distributors/30', '/api/distributors/31'],
    searchField: {hasSearch: true, getValue: () => 'SR6863D'},
    getSelectionModel: () => ({getSelection: () => [{get: () => '/api/parts/456'}]})
  }
};
assert.equal(manager.getRouteQuery.call(routeContext), '?project=78&category=123&page=2&search=SR6863D&field=orderNumber&distributors=30%2C31&part=456&preset=42');

let selectedPart;
let selectedCategory;
let requestedPage;
const category = {get: () => '/api/part_categories/123'};
const part = {get: () => '/api/parts/456'};
const restoreContext = {
  projectsLoaded: true,
  projectChoices: {findRecord: () => true},
  projectSelector: {setValue: value => { restoreContext.project = value; }},
  tree: {
    getStore: () => ({isLoaded: () => true}),
    getRootNode: () => ({findChild: () => category}),
    getSelectionModel: () => ({select: node => { selectedCategory = node; }}),
    getView: () => ({ensureVisible: () => {}})
  },
  store: {loadPage: (page, options) => {
    requestedPage = page;
    options.callback.call(options.scope, [part]);
  }},
  grid: {
    gridPresetButton: {presetsLoaded: true, restorePreset: id => { restoreContext.preset = id; }},
    catalogField: {setValue: value => { restoreContext.field = value; }},
    setSelectedCatalogDistributors: ids => { restoreContext.distributors = ids; },
    searchField: {hasSearch: false, getValue: () => '', setValue: value => { restoreContext.search = value; }, startSearch: () => {}},
    getSelectionModel: () => ({select: record => { selectedPart = record; }})
  },
  onCategoryClick: () => {},
  applyPendingRoute() { manager.applyPendingRoute.call(this); }
};
manager.applyRouteQuery.call(restoreContext, new URLSearchParams('project=78&category=123&page=2&part=456&preset=42&search=SR6863D&field=orderNumber&distributors=30,31'));
assert.equal(restoreContext.project, '/api/projects/78');
assert.equal(restoreContext.field, 'orderNumber');
assert.equal(restoreContext.preset, '42');
assert.equal(restoreContext.search, 'SR6863D');
assert.deepEqual(Array.from(restoreContext.distributors), ['/api/distributors/30', '/api/distributors/31']);
assert.equal(selectedCategory, category);
assert.equal(requestedPage, 2);
assert.equal(selectedPart, part);
assert.equal(restoreContext.routePending, false);

console.log('Part Manager category counts and project context passed');
