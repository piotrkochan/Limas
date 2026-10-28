Ext.define('Limas.PartDistributorGrid', {
	extend: 'Limas.BaseGrid',
	alias: 'widget.PartDistributorGrid',
	border: false,
	selModel: {
		selType: 'rowmodel',
		mode: 'MULTI'
	},
	initComponent: function () {
		this.store = Ext.create('Ext.data.Store', {
			model: 'Limas.Entity.PartDistributor',
			proxy: {
				type: 'memory',
				reader: {
					type: 'json'
				}
			}
		});

		this.editing = Ext.create('Ext.grid.plugin.RowEditing', {
			clicksToEdit: 2
		});

		this.plugins = [this.editing];

		this.deleteButton = Ext.create('Ext.button.Button', {
			text: 'Delete',
			disabled: true,
			itemId: 'delete',
			scope: this,
			iconCls: 'web-icon lorry_delete',
			handler: this.onDeleteClick
		});
		this.priceBreakButton = Ext.create('Ext.button.Button', {
			text: i18n('Price breaks'),
			disabled: true,
			scope: this,
			handler: this.onPriceBreakClick
		});

		this.dockedItems = [
			{
				xtype: 'toolbar',
				items: [
					{
						text: 'Add',
						scope: this,
						iconCls: 'web-icon lorry_add',
						handler: this.onAddClick
				}, this.deleteButton, this.priceBreakButton
				]
			}
		];

		this.columns = [
			{
				header: i18n('Distributor'),
				dataIndex: 'distributor',
				renderer: function (val, p, rec) {
					if (rec.getDistributor() !== null) {
						return rec.getDistributor().get('name');
					}
					return null;
				},
				flex: 1,
				editor: {
					xtype: 'DistributorComboBox',
					returnObject: true,
					allowBlank: false
				}
			}, {
				header: i18n('Order Number'),
				dataIndex: 'orderNumber',
				flex: 1,
				editor: {
					xtype: 'textfield',
					allowBlank: this.isOptional('orderNumber')
				}
			}, {
				header: i18n('Packaging Unit'),
				dataIndex: 'packagingUnit',
				flex: 1,
				editor: {
					xtype: 'numberfield',
					allowDecimals: false,
					allowBlank: false,
					minValue: 1
				}
			}, {
				header: i18n('Price per Item'),
				dataIndex: 'price',
				flex: 1,
				tooltip: i18n('Base price; quantity price breaks take precedence in BOM calculations'),
				renderer: function (val, m, rec) {
					return Limas.getApplication().formatCurrency(val, rec.get('currency'));
				},
				editor: {
					xtype: 'CurrencyField',
					allowBlank: false
				}
			}, {
				header: i18n('Price breaks'),
				dataIndex: 'priceBreaks',
				flex: 2,
				sortable: false,
				renderer: function (value, metadata, record) {
					if (!Ext.isArray(value) || value.length === 0) return '';
					let currency = record.get('currency') || '';
					return Ext.Array.map(value, function (entry) {
						return Ext.htmlEncode(String(entry.quantity) + '+: ' + String(entry.price) + ' ' + currency);
					}).join('; ');
				}
			}, {
				header: i18n('Currency'),
				dataIndex: 'currency',
				editor: {
					xtype: 'combobox',
					displayField: 'code',
					valueField: 'code',
					store: Ext.data.StoreManager.lookup('CurrencyStore'),
					forceSelection: true,
					queryMode: 'local'
				}
			}, {
				header: i18n('Package Price'),
				flex: 1,
				dataIndex: 'packagePrice',
				renderer: function (val, p, rec) {
					return Limas.getApplication().formatCurrency(rec.get('price') * rec.get('packagingUnit'), rec.get('currency'));
				}
			}, {
				header: i18n('SKU'),
				dataIndex: 'sku',
				flex: 1,
				editor: {
					xtype: 'urltextfield',
					allowBlank: this.isOptional('sku'),
					triggerCls: 'x-form-trigger-link',

					getUrl: function () {
						let distributor = this.ownerCt.context.record.getDistributor();
						if (distributor !== null) {
							let skuurl = distributor.get('skuurl');
							if (skuurl) {
								skuurl = skuurl.replace('%s', this.value);
								return skuurl;
							}
						}

						return false;
					}
				}
			}, {
				header: i18n('Pricing'),
				dataIndex: 'distributor.enabledForReports',
				width: 80,
				renderers: [{
					rtype: 'icon',
					rendererConfig: {
						iconCls: 'web-icon fugue-icon money-bag-dollar',
						title: i18n('Distributor is used for price calculations')
					}
				}]
			}, {
				header: i18n('Ignore'),
				dataIndex: 'ignoreForReports',
				tooltip: i18n('Ignore this entry for price calculations'),
				width: 80,
				xtype: 'checkcolumn'
			}
		];

		this.callParent();

		this.getSelectionModel().on('selectionchange',
			this.onSelectChange,
			this);
	},
	onAddClick: function () {
		this.editing.cancelEdit();

		let rec = Ext.create('Limas.Entity.PartDistributor', {
			packagingUnit: 1
		});

		this.store.insert(0, rec);

		this.editing.startEdit(0, 0);
	},
	onDeleteClick: function () {
		this.store.remove(this.getView().getSelectionModel().getSelection());
	},
	onSelectChange: function (selModel, selections) {
		this.deleteButton.setDisabled(selections.length === 0);
		this.priceBreakButton.setDisabled(selections.length !== 1);
	},
	onPriceBreakClick: function () {
		let selected = this.getSelectionModel().getSelection();
		if (selected.length !== 1) return;
		let partDistributor = selected[0];
		let store = Ext.create('Ext.data.Store', {
			fields: ['quantity', 'price'],
			data: Ext.Array.map(partDistributor.get('priceBreaks') || [], function (entry) {
				return {quantity: entry.quantity, price: entry.price};
			})
		});
		let editing = Ext.create('Ext.grid.plugin.RowEditing', {clicksToEdit: 2});
		let grid = Ext.create('Ext.grid.Panel', {
			store: store,
			plugins: [editing],
			columns: [{
				text: i18n('From quantity'), dataIndex: 'quantity', flex: 1,
				editor: {xtype: 'numberfield', allowDecimals: false, minValue: 1, allowBlank: false}
			}, {
				text: i18n('Unit price'), dataIndex: 'price', flex: 1,
				editor: {xtype: 'numberfield', minValue: 0, decimalPrecision: 8, allowBlank: false}
			}],
			tbar: [{
				text: i18n('Add'),
				handler: function () {
					let row = store.add({quantity: 1, price: 0})[0];
					editing.startEdit(row, 0);
				}
			}, {
				text: i18n('Delete'),
				handler: function () { store.remove(grid.getSelectionModel().getSelection()); }
			}]
		});
		let window = Ext.create('Ext.window.Window', {
			title: i18n('Price breaks'),
			width: 480,
			height: 340,
			layout: 'fit',
			modal: true,
			items: [grid],
			buttons: [{
				text: i18n('Save'),
				handler: function () {
					if (editing.editing && editing.completeEdit() === false) return;
					let breaks = [], quantities = {};
					store.each(function (row) {
						let quantity = Number(row.get('quantity'));
						let price = Number(row.get('price'));
						if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0
							|| quantities[quantity]) {
							breaks = null;
							return false;
						}
						quantities[quantity] = true;
						breaks.push({quantity: quantity, price: price});
					});
					if (breaks === null) {
						Ext.Msg.alert(i18n('Price breaks'), i18n('Use unique positive quantities and non-negative prices.'));
						return;
					}
					breaks.sort(function (a, b) { return a.quantity - b.quantity; });
					partDistributor.set('priceBreaks', breaks);
					if (breaks.length) partDistributor.set('price', breaks[0].price);
					window.close();
				}
			}, {text: i18n('Cancel'), handler: function () { window.close(); }}]
		});
		window.show();
	},
	isOptional: function (field) {
		let fields = Limas.getApplication().getSystemPreference('limas.partDistributor.requiredFields', []);
		return !Ext.Array.contains(fields, field);
	}
});
