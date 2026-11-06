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
		this.getView().on('refresh', this.colorFolderIcons, this);
		this.getView().on('itemadd', this.colorFolderIcons, this);
		this.getView().on('itemupdate', this.colorFolderIcons, this);

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
	colorFolderIcons: function () {
		let view = this.getView();
		Ext.Array.each(view.getNodes(), function (row) {
			let record = view.getRecord(row);
			let icon = row.querySelector('.x-tree-icon');
			if (!record || !icon) return;
			let color = record.get('color');
			icon.style.filter = this.folderColorFilter(color);
		}, this);
	},
	// Tint the existing ExtJS folder artwork; its shape and shading remain.
	folderColorFilter: function (color) {
		if (!/^#[0-9a-f]{6}$/i.test(String(color || ''))) return '';
		let rgb = [1, 3, 5].map(function (index) { return parseInt(color.slice(index, index + 2), 16) / 255; });
		let max = Math.max.apply(null, rgb), min = Math.min.apply(null, rgb), delta = max - min;
		let hue = 0;
		if (delta) {
			if (max === rgb[0]) hue = ((rgb[1] - rgb[2]) / delta) % 6;
			else if (max === rgb[1]) hue = (rgb[2] - rgb[0]) / delta + 2;
			else hue = (rgb[0] - rgb[1]) / delta + 4;
		}
		hue = (hue * 60 + 360) % 360;
		let saturation = max ? delta / max : 0;
		if (saturation < 0.08) return 'grayscale(1) brightness(' + (0.5 + max).toFixed(2) + ')';
		return 'grayscale(1) sepia(1) saturate(' + Math.round(200 + saturation * 800)
			+ '%) hue-rotate(' + Math.round(hue - 40) + 'deg) brightness(' + (0.55 + max * 0.6).toFixed(2) + ')';
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
