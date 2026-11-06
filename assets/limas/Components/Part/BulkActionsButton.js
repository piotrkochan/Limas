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
				}, {
					text: i18n('Update prices'),
					iconCls: 'fugue-icon money-coin',
					handler: Ext.bind(this.onRefreshPricesClick, this)
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
	},
	onRefreshPricesClick: function () {
		this.refreshPrices(this.getSelectedIris());
	},
	refreshPrices: function (iris) {
		if (!iris || !iris.length) return;
		if (iris.length > 100) {
			Ext.Msg.alert(i18n('Update prices'), i18n('Select at most 100 parts per batch.'));
			return;
		}
		this.grid.setLoading(i18n('Updating distributor prices…'));
		Ext.Ajax.request({
			url: Limas.getBasePath() + '/api/parts/refreshPrices',
			method: 'POST',
			timeout: 180000,
			jsonData: {parts: iris},
			scope: this,
			success: function (response) {
				this.grid.setLoading(false);
				let result = Ext.decode(response.responseText);
				this.grid.store.reload();
				let summary = Ext.String.format(i18n('Updated {0} distributor offer(s).'), result.updated || 0);
				let skipped = result.skipped || [];
				if (skipped.length) {
					summary += '<br><br>' + Ext.String.format(i18n('Skipped {0} offer(s):'), skipped.length)
						+ '<br>' + skipped.slice(0, 15).map(function (item) {
							return '#' + Number(item.partId) + ' ' + Ext.htmlEncode(item.distributor)
								+ ': ' + Ext.htmlEncode(item.reason);
						}).join('<br>');
				}
				Ext.Msg.alert(i18n('Update prices'), summary);
			},
			failure: function (response) {
				this.grid.setLoading(false);
				let body = {};
				try { body = Ext.decode(response.responseText); } catch (error) {}
				Ext.Msg.alert(i18n('Update prices'), Ext.htmlEncode(body.error || i18n('Price update failed.')));
			}
		});
	}
});
