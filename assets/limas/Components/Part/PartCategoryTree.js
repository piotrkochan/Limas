Ext.define('Limas.PartCategoryTree', {
	extend: 'Limas.CategoryEditorTree',
	alias: 'widget.PartCategoryTree',

	viewConfig: {
		plugins: {
			ptype: 'treeviewdragdrop',
			sortOnDrop: true,
			ddGroup: 'PartTree'
		}
	},
	categoryModel: 'Limas.Entity.PartCategory',
	editorWindowClass: 'Limas.PartCategoryEditorWindow',
	rootVisible: false,

	initComponent: function () {
		this.store = Ext.create('Limas.Data.store.PartCategoryStore');

		this.callParent();
		let nameColumn = this.down('treecolumn');
		// Ext.tree.Column owns renderer: it draws indentation, expanders and icons.
		// Its innerRenderer changes only the label inside that structure.
		nameColumn.rendererScope = this;
		nameColumn.innerRenderer = this.renderCategoryName;

		this.syncButton = Ext.create('Ext.button.Button', {
			tooltip: i18n('Reveal Category for selected part'),
			iconCls: 'fugue-icon arrow-split-180',
			handler: Ext.bind(function () {
				this.fireEvent('syncCategory');
			}, this),
			disabled: true
		});
		this.toolbar.add(['->', this.syncButton]);
	},
	setPartCounts: function (directCounts) {
		let totals = {};
		let visit = function (node) {
			let iri = String(node.get('@id') || node.getId() || '');
			let match = iri.match(/(\d+)$/);
			let count = match ? Number(directCounts[match[1]] || 0) : 0;
			Ext.Array.each(node.childNodes || [], function (child) { count += visit(child); });
			if (match) totals[match[1]] = count;
			return count;
		};
		if (this.getRootNode()) visit(this.getRootNode());
		this.subtreePartCounts = totals;
		this.getView().refresh();
	},
	renderCategoryName: function (value, metadata, record) {
		let text = Ext.htmlEncode(String(value || ''));
		if (!this.subtreePartCounts) return text;
		let iri = String(record.get('@id') || record.getId() || '');
		let match = iri.match(/(\d+)$/);
		let count = match ? Number(this.subtreePartCounts[match[1]] || 0) : 0;
		if (count === 0) {
			metadata.tdStyle = 'opacity: 0.5;';
			return text;
		}
		return text + ' (' + count + ')';
	},
	listeners: {
		foreignModelDrop: function (records, target) {
			for (let i in records) {
				switch (Ext.getClassName(records[i])) {
					case 'Limas.Entity.Part':
						records[i].setCategory(target);
						records[i].save({
							callback: function () { this.fireEvent('partCategoryChanged'); },
							scope: this
						});
						break;
					case 'Limas.Entity.PartCategory':
						records[i].callPutAction('move', {parent: target.getId()}, Ext.bind(function () {
							this.store.load();
						}, this));
						break;
				}
			}
		}
	}
});
