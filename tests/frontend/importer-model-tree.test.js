const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let makerClass;
const Ext = {
  emptyFn: () => false,
  define: (_name, definition) => { makerClass = definition; },
  create: (_name, config) => config
};
const filename = path.join(__dirname, '../../assets/limas/Components/ModelTreeMaker/ModelTreeMaker.js');
vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {Ext}, {filename});

function treeNode() {
  return {
    children: [],
    appendChild(config) {
      const child = Object.assign(treeNode(), config);
      this.children.push(child);
      return child;
    },
    set() {}
  };
}
const childModel = {
  getName: () => 'Child',
  getFields: () => [{name: 'value'}]
};
const parentModel = {
  getName: () => 'Parent',
  getFields: () => [
    {name: '@id'},
    {name: 'name'},
    {name: 'temporary', persist: false},
    {name: 'unresolved', reference: {cls: null}},
    {name: 'child', reference: {cls: childModel}}
  ],
  associations: {missing: {storeName: 'missing', isMany: true, cls: null}}
};
const maker = Object.assign({}, makerClass);
maker.constructor();
maker.addIgnoreField('@id');
const root = treeNode();
assert.doesNotThrow(() => maker.make(root, parentModel));
assert.deepEqual(root.children.map(child => child.text), ['name', 'child']);
assert.equal(root.children[1].children[0].text, 'value');
assert.equal(root.children[0].data.name, 'name');

console.log('Importer model tree handles unresolved references');
