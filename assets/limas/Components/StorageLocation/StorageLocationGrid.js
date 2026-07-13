Ext.define('Limas.StorageLocationGrid', {
	extend: 'Limas.EditorGrid',
	xtype: 'limas.StorageLocationGrid',

	features: [
		{
			ftype: 'grouping',
			groupHeaderTpl: '{name} ({children.length})',
			enableNoGroups: true
		}
	],

	columns: [
		{header: i18n('Storage Location'), dataIndex: 'name', flex: 1}
	],
	addButtonText: i18n('Add Storage Location'),
	addButtonIconCls: 'fugue-icon wooden-box--plus',
	deleteButtonText: i18n('Delete Storage Location'),
	deleteButtonIconCls: 'fugue-icon wooden-box--minus',
	initComponent: function () {
		this.callParent();

		if (this.enableEditing) {
			// Adds a button which shows the multi-create window
			this.multiCreateButton = Ext.create('Ext.button.Button', {
				iconCls: 'limas-icon storagelocation_multiadd',
				tooltip: i18n('Multi-create storage locations'),
				handler: this.onMultiCreateClick,
				scope: this
			});

			this.topToolbar.insert(2, {xtype: 'tbseparator'});
			this.topToolbar.insert(3, this.multiCreateButton);
		}

		this.printLabelsButton = Ext.create('Ext.button.Button', {
			iconCls: 'fugue-icon printer',
			tooltip: i18n('Print labels for selected storage locations'),
			disabled: true,
			handler: Ext.bind(this.onPrintLabelsClick, this)
		});
		this.topToolbar.add({xtype: 'tbseparator'});
		this.topToolbar.add(this.printLabelsButton);

		this.on('selectionchange', this.onLabelsSelectionChange, this);
	},
	onLabelsSelectionChange: function (sm, selections) {
		if (this.printLabelsButton) {
			this.printLabelsButton.setDisabled(!selections || selections.length === 0);
		}
	},
	onPrintLabelsClick: function () {
		let ids = this.getSelection()
			.map(function (rec) {
				return rec.get('@id') || '';
			})
			.map(function (iri) {
				let m = iri.match(/\/(\d+)$/);
				return m ? parseInt(m[1], 10) : null;
			})
			.filter(function (id) {
				return id !== null;
			});
		if (ids.length === 0) {
			return;
		}
		Limas.printLabelSheet({storageLocations: ids});
	},
	/**
	 * Creates a new storage location multi-create window
	 */
	onMultiCreateClick: function () {
		this.fireEvent('storageLocationMultiAdd');
	}
});
