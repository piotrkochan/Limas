/**
 * Toolbar dropdown hosting actions that operate on the current PartsGrid
 * selection. Disabled when nothing is selected; each menu item performs
 * its own count check against the live selection (selection may have
 * changed between menu show and click). Designed to host future actions
 * (bulk delete, bulk re-category) without churning the host grid wiring.
 */
Ext.define('Limas.Components.Part.BulkActionsButton', {
	extend: 'Ext.button.Button',
	alias: 'widget.PartsBulkActionsButton',

	iconCls: 'fugue-icon ui-check-boxes-list',
	text: i18n('Bulk actions'),
	disabled: true,

	grid: null,

	initComponent: function () {
		this.menu = Ext.create('Ext.menu.Menu', {
			items: [
				{
					text: i18n('Move to storage location…'),
					iconCls: 'fugue-icon truck',
					handler: Ext.bind(this.onMoveClick, this)
				}, {
					text: i18n('Auto category…'),
					iconCls: 'web-icon folder',
					handler: Ext.bind(this.onAutoCategoryClick, this)
				}
			]
		});

		this.callParent(arguments);

		if (this.grid && this.grid.getSelectionModel) {
			this.grid.getSelectionModel().on('selectionchange', this.onSelectionChange, this);
		}
	},

	onSelectionChange: function (sm, selections) {
		this.setDisabled(!selections || selections.length === 0);
	},

	getSelectedIris: function () {
		if (!this.grid || !this.grid.getSelectionModel) {
			return [];
		}
		return this.grid.getSelectionModel().getSelection()
			.map(function (rec) {
				return rec.get('@id');
			})
			.filter(function (iri) {
				return !!iri;
			});
	},

	onMoveClick: function () {
		let iris = this.getSelectedIris();
		if (iris.length === 0) {
			return;
		}

		Ext.create('Limas.Components.Part.BulkMoveDialog', {
			parts: iris,
			onSuccess: Ext.bind(function () {
				if (this.grid && this.grid.store) {
					this.grid.store.reload();
				}
			}, this)
		}).show();
	},

	onAutoCategoryClick: function () {
		let iris = this.getSelectedIris();
		if (!iris.length) return;
		if (iris.length > 40) {
			Ext.Msg.alert(i18n('Auto category'), i18n('Select at most 40 parts per batch.'));
			return;
		}
		let partDetails = {};
		this.grid.getSelectionModel().getSelection().forEach(function (part) {
			let distributor = this.grid.getDistributorNumberInfo(part) || {};
			partDetails[part.get('@id')] = {
				description: part.get('description') || '',
				distributorNumber: distributor.number || '',
				distributorSource: distributor.source || '',
				distributorUrl: distributor.url || ''
			};
		}, this);
		Ext.create('Limas.Components.Part.AutoCategoryDialog', {
			parts: iris,
			partDetails: partDetails,
			onSuccess: Ext.bind(function (result) {
				if (this.grid && this.grid.store) this.grid.store.reload();
				let manager = Ext.getCmp('limas-partmanager');
				if (manager && manager.tree) {
					if ((result.createdCategories || []).length) manager.tree.getStore().load();
					else manager.refreshCategoryCounts();
				}
			}, this)
		}).show();
	}
});
