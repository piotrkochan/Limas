Ext.define('Limas.PartsGrid', {
	extend: 'Limas.EditorGrid',
	alias: 'widget.PartsGrid',
	cls: 'limas-parts-grid',
	selModel: {
		selType: 'checkboxmodel',
		mode: 'MULTI',
		checkOnly: false,
		showHeaderCheckbox: true
	},

	/**
	 * Display button texts by default
	 */
	buttonTextMode: 'show',

	/**
	 * @cfg {String} Defines the text of the "Add" button
	 */
	addButtonText: i18n('Add Part'),
	/**
	 * @cfg {String} Defines the icon of the "Add" button
	 */
	addButtonIconCls: 'web-icon brick_add',
	/**
	 * @cfg {String} Defines the text of the "Delete" button
	 */
	deleteButtonText: i18n('Delete Part'),
	/**
	 * @cfg {String} Defines the icon of the "Add" button
	 */
	deleteButtonIconCls: 'web-icon brick_delete',
	/**
	 * @cfg {String} Defines the icon of the "Expand Row" button
	 */
	expandRowButtonIconCls: 'limas-icon group-expand',
	/**
	 * @cfg {String} Defines the icon of the "Collapse Row" button
	 */
	collapseRowButtonIconCls: 'limas-icon group-collapse',

	/**
	 * Configure drag'n'drop.
	 * @todo Check if this messes up with the Part drop down in the project view
	 */
	viewConfig: {
		enableTextSelection: true,
		plugins: {
			ddGroup: 'CategoryTree',
			ptype: 'gridviewdragdrop',
			enableDrop: false
		},
		// PK #821: tint rows where stockLevel <= minStockLevel (lowStock is
		// the backend's auto-computed boolean — already lives on Part)
		getRowClass: function (record) {
			let classes = [];
			if (record.get('lowStock')) classes.push('limas-row-low-stock');
			let stock = record.get('stockLevel');
			if (stock !== null && stock !== undefined && stock !== '' && Number(stock) === 0) {
				classes.push('limas-row-zero-stock');
			}
			return classes.join(' ');
		}
	},
	enableDragDrop: true,
	stripeRows: true,
	multiSelect: true,
	autoScroll: false,
	invalidateScrollerOnRefresh: true,
	titleProperty: 'name',
	searchFieldSystemPreference: 'limas.part.search.field',
	searchFieldSystemPreferenceDefaults: ['name', 'description', 'comment', 'internalPartNumber', 'distributors.sku', 'distributors.orderNumber', 'manufacturers.partNumber'],
	splitSearchTermSystemPreference: 'limas.part.search.split',
	splitSearchTermSystemPreferenceDefaults: true,

	initComponent: function () {
		this.groupingFeature = Ext.create('Ext.grid.feature.Grouping', {
			//enableGroupingMenu: false,
			groupHeaderTpl: [
				'{[this.displayPath(values.name)]} ({rows.length} ' + i18n('Part(s)') + ')',
				{displayPath: function (path) {
					return Ext.htmlEncode(String(path || '').replace(/^Root Category(?:\s*➤\s*|$)/, ''));
				}}
			]
		});

		// Create the columns
		this.defineColumns();

		this.features = [this.groupingFeature];

		this.on('itemdblclick', this.onDoubleClick, this);

		// Bugfix for scroller becoming detached.
		// @todo Remove with ExtJS 4.1
		this.on('scrollershow', function (scroller) {
			if (scroller && scroller.scrollEl) {
				scroller.clearManagedListeners();
				scroller.mon(scroller.scrollEl, 'scroll', scroller.onElScroll, scroller);
			}
		});

		if (this.enableEditing) {
			this.editing = Ext.create('Ext.grid.plugin.CellEditing', {
				clicksToEdit: 1
			});

			this.editing.on('edit', this.onEdit, this);

			this.plugins = [this.editing];
		}

		// Initialize the panel
		this.callParent();
		this.getView().on('beforeitemmousedown', this.onBeforePartMouseDown, this);

		this.bottomToolbar.add({
			xtype: 'button',
			tooltip: i18n('Expand all Groups'),
			iconCls: this.expandRowButtonIconCls,
			listeners: {
				scope: this.groupingFeature,
				click: this.groupingFeature.expandAll
			}
		});

		this.bottomToolbar.add({
			xtype: 'button',
			tooltip: i18n('Collapse all Groups'),
			iconCls: this.collapseRowButtonIconCls,
			listeners: {
				scope: this.groupingFeature,
				click: this.groupingFeature.collapseAll
			}
		});
		this.selectPageButton = Ext.create('Ext.button.Button', {
			text: i18n('Select page'),
			tooltip: i18n('Select all parts on this page'),
			handler: Ext.bind(function () { this.getSelectionModel().selectAll(); }, this)
		});
		this.clearSelectionButton = Ext.create('Ext.button.Button', {
			text: i18n('Clear selection'),
			handler: Ext.bind(function () { this.getSelectionModel().deselectAll(); }, this)
		});
		this.selectedCountItem = Ext.create('Ext.toolbar.TextItem', {text: ''});
		this.bottomToolbar.add('->');
		this.bottomToolbar.add(this.selectPageButton);
		this.bottomToolbar.add(this.clearSelectionButton);
		this.bottomToolbar.add(this.selectedCountItem);
		this.getSelectionModel().on('selectionchange', this.updateSelectionStatus, this);
		this.store.on('load', this.updateSelectionStatus, this);
		this.updateSelectionStatus();

		this.bottomToolbar.insert(this.bottomToolbar.items.indexOf(this.bottomToolbar.down('#addFilter')), {
			xtype: 'button',
			tooltip: i18n('Filter by Part Parameter'),
			iconCls: 'fugue-icon table--plus',
			listeners: {
				scope: this,
				click: this.addParameterFilter
			}
		});

		let duplicateBasicData = i18n('Duplicates the selected part with the data found in the "basic" tab and opens the editor. Doesn\'t immediately saves the duplicate, in order to allow editing.'),
			duplicateAllData = i18n('Duplicates the selected part with all data including attachments, distributors etc. Doesn\'t immediately saves the duplicate, in order to allow editing.');

		this.addFromTemplateButton = Ext.create('Ext.button.Split', {
			disabled: true,
			handler: Ext.bind(function () {
				this.fireEvent('duplicateItemWithBasicData');
			}, this),
			tooltip: duplicateBasicData,
			text: i18n('Duplicate'),
			iconCls: 'web-icon brick_link',
			menu: new Ext.menu.Menu({
				items: [
					{
						text: i18n('Duplicate with all data'),
						tooltip: duplicateAllData,
						handler: function () {
							this.fireEvent('duplicateItemWithAllData');
						},
						scope: this
					}, {
						text: i18n('Duplicate basic data only'),
						tooltip: duplicateBasicData,
						handler: function () {
							this.fireEvent('duplicateItemWithBasicData');
						},
						scope: this
					}
				]
			})
		});

		if (this.enableEditing) {
			this.topToolbar.insert(2, this.addFromTemplateButton);
		}

		// "Print labels" acts on the current grid selection — same
		// helper as StorageLocationGrid's toolbar button. Enabled for
		// any non-empty selection so a single row works too. Landed
		// right after Duplicate so the "per-selection actions" cluster
		// stays visually together
		this.printLabelsButton = Ext.create('Ext.button.Button', {
			text: i18n('Print labels'),
			iconCls: 'fugue-icon printer',
			tooltip: i18n('Print labels for the selected parts'),
			disabled: true,
			handler: Ext.bind(this.onPrintLabelsClick, this)
		});
		if (this.enableEditing) {
			this.topToolbar.insert(3, this.printLabelsButton);
		}
		this.on('selectionchange', function (sm, selections) {
			this.printLabelsButton.setDisabled(!selections || selections.length === 0);
		}, this);

		this.createMetaPartButton = Ext.create('Ext.button.Button', {
			iconCls: 'web-icon bricks',
			text: i18n('Add Meta-Part'),
			handler: function () {
				this.fireEvent('addMetaPart');
			},
			scope: this
		});

		this.topToolbar.insert(1, this.createMetaPartButton);

		this.selectedDistributorField = this.readCatalogPreference('field', 'sku');
		if (this.selectedDistributorField !== 'sku' && this.selectedDistributorField !== 'orderNumber') {
			this.selectedDistributorField = 'sku';
		}
		this.selectedDistributorIds = null;
		let distributorStore = Ext.data.StoreManager.lookup('DistributorStore');
		this.catalogDistributors = Ext.create('Ext.data.Store', {
			fields: ['@id', 'name'], data: []
		});
		this.catalogDistributorMenu = Ext.create('Ext.menu.Menu');
		this.catalogDistributor = Ext.create('Ext.button.Button', {
			text: i18n('Distributor') + ': ' + i18n('Auto'),
			menu: this.catalogDistributorMenu
		});
		this.catalogField = Ext.create('Ext.form.field.ComboBox', {
			fieldLabel: i18n('Field'), labelWidth: 35, width: 110,
			store: Ext.create('Ext.data.Store', {
				fields: ['key', 'label'],
				data: [{key: 'sku', label: 'SKU'}, {key: 'orderNumber', label: i18n('Order Number')}]
			}),
			displayField: 'label', valueField: 'key', queryMode: 'local',
			forceSelection: true, editable: false, value: this.selectedDistributorField,
			listeners: {
				change: function (field, value) {
					this.selectedDistributorField = value;
					this.writeCatalogPreference('field', value);
					this.getView().refresh();
					this.fireEvent('catalogselectionchange');
				}, scope: this
			}
		});
		let searchIndex = this.topToolbar.items.indexOf(this.searchField);
		this.topToolbar.insert(searchIndex, this.catalogDistributor);
		this.topToolbar.insert(searchIndex + 1, this.catalogField);
		this.catalogField.on('afterrender', function () {
			this.fitCatalogSelector(this.catalogField, this.catalogField.getStore(), 'label');
		}, this);
		distributorStore.on('load', this.refreshCatalogDistributors, this);
		this.store.on('load', this.refreshCatalogDistributors, this);
		this.refreshCatalogDistributors();

		// Bulk actions menu — enabled only when grid selection > 0 (the
		// button wires its own selectionchange listener). First action:
		// Move to storage location (PK #1193/#664).
		this.bulkActionsButton = Ext.create('Limas.Components.Part.BulkActionsButton', {
			grid: this
		});
		// Land just before the tbfill spacer so it sits at the right end of
		// the per-item action cluster (after Add / MetaPart / Delete /
		// Duplicate), rather than wedging into the middle
		let tbfillIdx = -1;
		this.topToolbar.items.each(function (item, i) {
			if (item.xtype === 'tbfill') {
				tbfillIdx = i;
				return false;
			}
		});
		if (tbfillIdx === -1) {
			this.topToolbar.add(this.bulkActionsButton);
		} else {
			this.topToolbar.insert(tbfillIdx, this.bulkActionsButton);
		}

		this.mapSearchHotkey();

		// PK #1217 (b): list endpoint elides PartParameter collection for perf.
		// When the user has Param Renderer columns configured, ask the backend
		// to bulk-load those specific parameter values into a flat paramValues
		// map so the renderer has data to show. Re-evaluated on every
		// reconfigure (preset / column add / remove) so the request matches
		// the current column set.
		this.store.on('beforeload', this._injectIncludeParameters, this);
		this._enableDistributorNumbers();
		this.on('reconfigure', this._refreshIncludeParameters, this);
	},
	onBeforePartMouseDown: function (view, record, item, index, event) {
		// Shift-click selects a row range. Stop only the browser's native
		// text-range gesture; ordinary drag-to-copy remains available.
		if (event.shiftKey && event.button === 0) event.preventDefault();
	},
	updateSelectionStatus: function () {
		let selectionModel = this.getSelectionModel();
		let selected = selectionModel.getCount();
		let onPage = this.store.getRange();
		this.selectedCountItem.setText(i18n('Selected') + ': ' + selected);
		this.clearSelectionButton.setDisabled(selected === 0);
		this.selectPageButton.setDisabled(onPage.length === 0 || onPage.every(function (part) { return selectionModel.isSelected(part); }));
	},
	readCatalogPreference: function (key, fallback) {
		try { return window.localStorage.getItem('limas.parts.catalog.' + key) || fallback; }
		catch (e) { return fallback; }
	},
	writeCatalogPreference: function (key, value) {
		try { window.localStorage.setItem('limas.parts.catalog.' + key, value); }
		catch (e) { /* Storage can be disabled in private browsing. */ }
	},
	refreshCatalogDistributors: function () {
		let source = Ext.data.StoreManager.lookup('DistributorStore');
		if (!source) return;
		let used = {};
		this.store.each(function (part) {
			Ext.Object.each(part.get('distributorNumbers') || {}, function (id) {
				used[id] = true;
			});
		});
		let available = [];
		source.each(function (distributor) {
			let id = distributor.get('@id');
			if (used[id]) available.push({'@id': id, name: distributor.get('name')});
		});
		this.catalogDistributors.loadData(available);
		this.refreshCatalogDistributorMenu();
		this.getView().refresh();
	},
	setSelectedCatalogDistributors: function (ids) {
		this.selectedDistributorIds = ids === null ? null : ids.slice();
		this.syncCatalogDistributorMenu();
		this.getView().refresh();
		this.fireEvent('catalogselectionchange');
	},
	refreshCatalogDistributorMenu: function () {
		let available = [];
		this.catalogDistributors.each(function (record) { available.push(record); });
		this.catalogDistributorItems = [];
		this.catalogDistributorMenu.removeAll();
		this.catalogDistributorItems.push(this.catalogDistributorMenu.add({
			xtype: 'menucheckitem', text: i18n('Auto / all available'),
			hideOnClick: false,
			listeners: {checkchange: function (item, checked) {
				this.setSelectedCatalogDistributors(checked ? null : available.map(function (record) { return record.get('@id'); }));
			}, scope: this}
		}));
		if (available.length) this.catalogDistributorMenu.add('-');
		available.forEach(function (record) {
			let id = record.get('@id');
			this.catalogDistributorItems.push(this.catalogDistributorMenu.add({
				xtype: 'menucheckitem', text: record.get('name'), distributorId: id,
				hideOnClick: false,
				listeners: {checkchange: function (item, checked) {
					let current = this.selectedDistributorIds || available.map(function (entry) { return entry.get('@id'); });
					let next = current.filter(function (value) { return value !== id; });
					if (checked) next.push(id);
					this.setSelectedCatalogDistributors(next);
				}, scope: this}
			}));
		}, this);
		this.syncCatalogDistributorMenu();
	},
	syncCatalogDistributorMenu: function () {
		let automatic = this.selectedDistributorIds === null;
		let selected = this.selectedDistributorIds || [];
		(this.catalogDistributorItems || []).forEach(function (item, index) {
			let checked = index === 0 ? automatic : automatic || selected.indexOf(item.distributorId) !== -1;
			item.setChecked(checked, true);
		});
		let label = automatic ? i18n('Auto / all available')
			: (selected.length === 0 ? i18n('None') : selected.length + ' ' + i18n('selected'));
		this.catalogDistributor.setText(i18n('Distributor') + ': ' + label);
	},
	getSelectedCatalogEntries: function (record) {
		let numbers = record.get('distributorNumbers') || {};
		let entries = [];
		this.catalogDistributors.each(function (distributor) {
			let id = distributor.get('@id');
			if (numbers[id] && (this.selectedDistributorIds === null || this.selectedDistributorIds.indexOf(id) !== -1)) {
				entries.push({id: id, name: String(distributor.get('name'))});
			}
		}, this);
		return entries;
	},
	fitCatalogSelector: function (combo, store, displayField) {
		if (!combo.rendered) return;
		let input = combo.inputEl && combo.inputEl.dom;
		if (!input) return;
		let canvas = input.ownerDocument.createElement('canvas');
		let context = canvas.getContext('2d');
		if (!context) return;
		let style = window.getComputedStyle(input);
		context.font = style.font || (style.fontSize + ' ' + style.fontFamily);
		let textWidth = 0;
		store.each(function (record) {
			let label = String(record.get(displayField) || '');
			textWidth = Math.max(textWidth, context.measureText(label).width);
		});
		let width = Math.ceil(textWidth + (combo.labelWidth || 0) + 50);
		combo.setWidth(Math.min(Math.max(width, 110), 420));
	},
	_enableDistributorNumbers: function () {
		let proxy = this.store.getProxy();
		if (proxy) {
			proxy.extraParams = proxy.extraParams || {};
			proxy.extraParams.includeDistributorNumbers = 1;
		}
	},
	getLcscProductUrl: function (record) {
		let distributors = Ext.data.StoreManager.lookup('DistributorStore');
		let numbers = record.get('distributorNumbers') || {};
		let code = null;
		if (distributors) {
			distributors.each(function (distributor) {
				if (String(distributor.get('name')).toLowerCase() !== 'lcsc') return;
				let entry = numbers[distributor.get('@id')];
				if (entry) code = entry.sku || entry.orderNumber;
			});
		}
		return /^C[1-9][0-9]*$/i.test(String(code || ''))
			? 'https://www.lcsc.com/product-detail/' + String(code).toUpperCase() + '.html' : null;
	},
	getDistributorNumberInfo: function (record) {
		let entries = this.getSelectedCatalogEntries(record);
		if (!entries.length) return null;
		let entry = entries[0];
		return this.getDistributorNumberInfoFor(record, entry.id, entry.name.toLowerCase().replace(/[^a-z0-9]/g, ''));
	},
	getDistributorNumberInfoFor: function (record, distributorId, distributorName) {
		let numbers = record.get('distributorNumbers') || {};
		let identifiers = numbers[distributorId];
		let number = identifiers && identifiers[this.selectedDistributorField];
		if (!number) return null;
		let source = distributorName || '';
		let url = null;
		if (source === 'lcsc') url = this.getLcscProductUrl(record);
		if (source === 'tme') {
			let sku = String(identifiers.sku || identifiers.orderNumber || '').trim();
			if (sku) url = 'https://www.tme.eu/details/' + encodeURIComponent(sku) + '/';
		}
		return {
			number: String(number),
			source: source,
			url: url
		};
	},
	renderDistributorNumber: function (record) {
		let entries = this.getSelectedCatalogEntries(record);
		return entries.map(function (entry) {
			let source = entry.name.toLowerCase().replace(/[^a-z0-9]/g, '');
			let info = this.getDistributorNumberInfoFor(record, entry.id, source);
			if (!info) return '';
			let content = this.renderDistributorNumberInfo(info);
			return entries.length > 1 ? '<div title="' + Ext.htmlEncode(entry.name) + '">' + content + '</div>' : content;
		}, this).join('');
	},
	renderDistributorNumberInfo: function (info) {
		let source = info.source;
		let hasSprite = Ext.Array.contains(
			['avnet', 'mouser', 'digikey', 'element14', 'farnell', 'lcsc', 'newark', 'oemsecrets', 'rs', 'tme'], source);
		let icon = hasSprite
			? '<i class="distributor-icon ' + source + '" style="margin-right:6px;"></i>'
			: '<i class="web-icon lorry" style="margin-right:6px;"></i>';
		let content = icon + Ext.htmlEncode(info.number);
		return info.url ? '<a href="' + Ext.htmlEncode(info.url) + '" target="_blank" rel="noopener noreferrer">' + content + '</a>' : content;
	},
	renderDistributorPrice: function (record, metadata) {
		let entries = this.getSelectedCatalogEntries(record);
		return entries.map(function (entry) {
			let cellMetadata = entries.length === 1 ? metadata : {};
			let price = this.renderDistributorPriceFor(record, entry.id, cellMetadata);
			if (!price) return '';
			return entries.length > 1
				? '<div ' + (cellMetadata.tdAttr || '') + '>' + Ext.htmlEncode(entry.name) + ': ' + price + '</div>' : price;
		}, this).filter(Boolean).join('');
	},
	renderDistributorPriceFor: function (record, distributorId, metadata) {
		let offer = (record.get('distributorNumbers') || {})[distributorId];
		if (!offer) return '';
		let breaks = Ext.isArray(offer.priceBreaks) ? offer.priceBreaks : [];
		if (!breaks.length && (offer.price === null || offer.price === undefined || offer.price === '')) return '';
		let price = breaks.length ? breaks[0].price : offer.price;
		let currency = offer.currency || '';
		let app = Limas.getApplication();
		let display = function (value) {
			let converted = app.convertCurrency(value, currency || 'EUR');
			let amount = converted === null ? value : converted.toFixed(8);
			let code = converted === null ? (currency || 'EUR') : app.getDisplayCurrency();
			return String(amount).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '') + ' ' + code;
		};
		if (breaks.length) {
			metadata.tdAttr = 'data-qtip="' + breaks.map(function (tier) {
				return Ext.htmlEncode(tier.quantity + '+: ' + display(tier.price));
			}).join('<br>') + '"';
		}
		let suffix = breaks.length && Number(breaks[0].quantity) > 1 ? ' (' + breaks[0].quantity + '+)' : '';
		return Ext.htmlEncode(display(price) + suffix);
	},

	_collectIncludeParameters: function () {
		let names = [];
		this.getColumns().forEach(function (col) {
			if (!Ext.isArray(col.renderers)) return;
			col.renderers.forEach(function (r) {
				if (r.rtype === 'partParameter' && r.rendererConfig && r.rendererConfig.parameterName) {
					if (names.indexOf(r.rendererConfig.parameterName) === -1) {
						names.push(r.rendererConfig.parameterName);
					}
				}
			});
		});
		return names;
	},

	_injectIncludeParameters: function () {
		let proxy = this.store.getProxy();
		if (!proxy) {
			return;
		}
		let names = this._collectIncludeParameters();
		if (names.length > 0) {
			proxy.extraParams['includeParameters[]'] = names;
		} else {
			delete proxy.extraParams['includeParameters[]'];
		}
	},

	_refreshIncludeParameters: function () {
		this._enableDistributorNumbers();
		this._injectIncludeParameters();
		this.store.load();
	},
	/**
	 * Maps a search hotkey to the search box
	 * Right now, this is hardcoded to alt+x.
	 */
	mapSearchHotkey: function () {
		this.searchKey = new Ext.util.KeyMap({
			target: Ext.get(document),
			binding: [{
				key: 'x',
				ctrl: false,
				alt: true,
				fn: function () {
					let searchBox = this.searchField;
					if (Ext.get(document).activeElement !== searchBox) {
						searchBox.focus('', 10);
					}
					searchBox.setValue('');
				},
				scope: this,
				stopEvent: true
			}]
		});
	},
	/**
	 * Called when an item was selected. Enables/disables the delete button.
	 */
	_updateAddTemplateButton: function () {
		/* Right now, we support delete on a single record only */
		if (this.getSelectionModel().getCount() === 1) {
			this.addFromTemplateButton.enable();
		} else {
			this.addFromTemplateButton.disable();
		}
	},
	_onItemSelect: function (selectionModel, record) {
		this._updateAddTemplateButton(selectionModel, record);
		this.callParent(arguments);
	},
	_onItemDeselect: function (selectionModel, record) {
		this._updateAddTemplateButton(selectionModel, record);
		this.callParent(arguments);
	},
	onDoubleClick: function (view, record) {
		if (record) {
			this.fireEvent('editPart', record);
		}
	},
	onPrintLabelsClick: function () {
		let ids = this.getSelectionModel().getSelection()
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
		Limas.printLabelSheet({parts: ids});
	},
	preparePresetColumns: function (columns) {
		let defaults = this.getDefaultColumnConfiguration();
		let distributorColumns = defaults.filter(function (column) {
			return column.dataIndex === 'distributorNumbers';
		});
		let label = function (column) { return column.text || column.header; };
		let priceLabel = i18n('Distributor price');
		let numberLabel = i18n('Distributor number');
		let prepared = columns.filter(function (column) {
			return column.dataIndex !== 'averagePrice' && column.dataIndex !== '@id';
		}).map(function (column) {
			// Saved presets keep column metadata, but omit custom renderer functions.
			let source = distributorColumns.find(function (candidate) {
				return label(candidate) === label(column);
			});
			return source ? Object.assign({}, column, {renderer: source.renderer}) : column;
		});
		if (!prepared.some(function (column) { return label(column) === priceLabel; })) {
			let priceColumn = distributorColumns.find(function (column) { return label(column) === priceLabel; });
			let numberIndex = prepared.findIndex(function (column) { return label(column) === numberLabel; });
			if (priceColumn) prepared.splice(numberIndex >= 0 ? numberIndex + 1 : prepared.length, 0, priceColumn);
		}
		return prepared;
	},
	defineColumns: function () {
		let grid = this;
		this.columns = [
			{
				header: '<span class="web-icon fugue-icon paper-clip"></span>',
				dataIndex: '',
				width: 30,
				tooltip: i18n('Has attachments?'),
				renderers: [{
					rtype: 'partAttachment'
				}]
			}, {
				text: '<span class="web-icon flag_orange"></span>',
				dataIndex: 'needsReview',
				width: 30,
				tooltip: i18n('Needs Review?'),
				renderers: [{
					rtype: 'icon',
					rendererConfig: {
						iconCls: 'web-icon flag_orange'
					}
				}]
			}, {
				text: '<span class="web-icon bricks"></span>',
				dataIndex: 'metaPart',
				width: 30,
				tooltip: i18n('Meta Part'),
				renderers: [{
					rtype: 'icon',
					rendererConfig: {
						iconCls: 'web-icon bricks'
					}
				}]
			}, {
				header: i18n('Name'),
				dataIndex: 'name',
				flex: 1,
				minWidth: 150
			}, {
				header: i18n('Description'),
				dataIndex: 'description',
				flex: 2,
				minWidth: 150
			}, {
				header: i18n('Distributor number'),
				dataIndex: 'distributorNumbers',
				minWidth: 130,
				flex: 1,
				sortable: false,
				renderer: function (value, metadata, record) {
					// The column override HTML-encodes value before this renderer runs.
					// Read the original map from the ExtJS record instead.
					return grid.renderDistributorNumber(record);
				}
			}, {
				header: i18n('Distributor price'),
				dataIndex: 'distributorNumbers',
				minWidth: 120,
				flex: 1,
				sortable: false,
				renderer: function (value, metadata, record) {
					return grid.renderDistributorPrice(record, metadata);
				}
			}, {
				header: i18n('Storage Location'),
				dataIndex: 'storageLocation.name'
			}, {
				header: i18n('Status'),
				dataIndex: 'status'
			}, {
				header: i18n('Condition'),
				dataIndex: 'partCondition'
			}, {
				header: i18n('Stock'),
				dataIndex: 'stockLevel',
				renderers: [{
					rtype: 'stockLevel'
				}],
				editor: {
					xtype: 'textfield',
					allowBlank: false
				}
			}, {
				header: i18n('Min. Stock'),
				dataIndex: 'minStockLevel',
				renderers: [{
					rtype: 'stockLevel'
				}]
			}, {
				header: i18n('Footprint'),
				dataIndex: 'footprint.name'
			}, {
				header: i18n('Category'),
				dataIndex: 'category.categoryPath',
				renderer: function (value) {
					return Ext.htmlEncode(String(value || '').replace(/^Root Category(?:\s*➤\s*|$)/, ''));
				},
				hidden: true
			}, {
				header: i18n('Create Date'),
				dataIndex: 'createDate',
				hidden: true
			}
		];
	},
	/**
	 * Sets the category. Triggers a store reload with a category filter.
	 */
	setCategory: function (category) {
		this.store.getProxy().extraParams.category = category;
		this.store.currentPage = 1;
		this.store.load({
			start: 0
		});
	},
	/**
	 * Handles editing of the grid fields. Right now, only the stock level editing is supported.
	 *
	 * @param editor Not used
	 * @param e An edit event, as documented in
	 *            http://docs.sencha.com/ext-js/4-0/#!/api/Ext.grid.plugin.CellEditing-event-edit
	 */
	onEdit: function (editor, e) {
		switch (e.field) {
			case 'stockLevel':
				if (e.value !== e.originalValue.toString()) {
					this.handleStockFieldEdit(e);
				}
				break;
			default:
				break;
		}
	},
	addParameterFilter: function () {
		this.addFilterWindow = Ext.create('Limas.Components.Widgets.PartParameterSearchWindow', {
			sourceModel: this.getStore().getModel(),
			listeners: {
				apply: this.onAddParameterFilter,
				scope: this
			}
		});

		this.addFilterWindow.show();
	},
	/**
	 * @todo Refactor this function as well as the one in DataApplicator to a single central function
	 *
	 * Note that this function takes the input and multiplies it by the si prefix
	 * @param value
	 * @param siPrefix
	 * @returns {*}
	 */
	applySiPrefix: function (value, siPrefix) {
		if (siPrefix instanceof Limas.Entity.SiPrefix) {
			let exponent = siPrefix.get('exponent'),
				fractionValue = value * Math.pow(siPrefix.get('base'), exponent);

			if (exponent < 0) {
				// Decimals needed = the prefix magnitude PLUS the value's own
				// decimal places. toFixed(|exponent|) alone rounded e.g. 4.7 µ
				// (0.0000047, needs 7 places) to 0.000005, so the '=' filter on
				// normalizedValue never matched the stored 4.7e-6.
				let valueDecimals = (String(value).split('.')[1] || '').length;
				return fractionValue.toFixed(Math.abs(exponent) + valueDecimals);
			}
			return fractionValue;
		}
		return value;
	},
	onAddParameterFilter: function (rec) {
		let subFilters = [];
		subFilters.push(Ext.create('Limas.util.Filter', {
			property: 'parameters.name',
			operator: '=',
			value: rec.get('partParameterName')
		}));

		let value;
		if (rec.get('valueType') === 'numeric') {
			value = this.applySiPrefix(rec.get('value'), rec.getSiPrefix());

			subFilters.push(Ext.create('Limas.util.Filter', {
				property: 'parameters.normalizedValue',
				operator: rec.get('operator'),
				value: value
			}));
		} else {
			value = rec.get('stringValue');

			subFilters.push(Ext.create('Limas.util.Filter', {
				property: 'parameters.stringValue',
				operator: rec.get('operator'),
				value: value
			}));
		}

		this.getStore().addFilter(
			Ext.create('Limas.util.Filter', {
				type: 'AND',
				subfilters: subFilters
			})
		);
	},

	/**
	 * Handles the editing of the stock level field. Checks if the user has opted in to skip the
	 * online stock edit confirm window, and runs the changes afterwards.
	 *
	 * @param e An edit event, as documented in
	 *            http://docs.sencha.com/ext-js/4-0/#!/api/Ext.grid.plugin.CellEditing-event-edit
	 */
	handleStockFieldEdit: function (e) {
		if (Limas.getApplication().getUserPreference('limas.inline-stock-change.confirm', true) === false) {
			this.handleStockChange(e);
		} else {
			this.confirmStockChange(e);
		}
	},
	getStockChangeMode: function (value) {
		if (value.indexOf('+') !== -1) {
			return 'addition';
		}
		if (value.indexOf('-') !== -1) {
			return 'removal';
		}
		return 'fixed';
	},
	/**
	 * Opens the confirm dialog
	 *
	 * @param e An edit event, as documented in
	 *            http://docs.sencha.com/ext-js/4-0/#!/api/Ext.grid.plugin.CellEditing-event-edit
	 */
	confirmStockChange: function (e) {
		let mode = this.getStockChangeMode(e.value),
			value = Math.abs(parseInt(e.value)),
			confirmText = '',
			headerText = '';

		switch (mode) {
			case 'removal':
				confirmText = sprintf(i18n('You wish to remove <b>%s %s</b> of the part <b>%s</b>. Is this correct?'),
					value,
					e.record.getPartUnit().get('name'),
					e.record.get('name')
				);

				// Set the stock level to a temporary calculated value.
				e.record.set('stockLevel', (e.originalValue - value));
				headerText = i18n('Remove Part(s)');
				break;
			case 'addition':
				confirmText = sprintf(i18n('You wish to add  <b>%s %s</b> of part <b>%s</b>. Is this correct?'),
					value,
					e.record.getPartUnit().get('name'),
					e.record.get('name')
				);

				e.record.set('stockLevel', (e.originalValue + value));
				headerText = i18n('Add Part(s)');
				break;
			case 'fixed':
				confirmText = sprintf(i18n('You wish to set the stock level to <b>%s %s</b> for part <b>%s</b>. Is this correct?'),
					value,
					e.record.getPartUnit().get('name'),
					e.record.get('name')
				);

				e.record.set('stockLevel', value);
				headerText = i18n('Set Stock Level for Part(s)');
				break;
		}

		let j = Ext.create('Limas.RememberChoiceMessageBox', {
			escButtonAction: 'cancel',
			dontAskAgainProperty: 'limas.inline-stock-change.confirm',
			dontAskAgainValue: false
		});
		j.show({
			title: headerText,
			msg: confirmText,
			buttons: Ext.Msg.OKCANCEL,
			fn: this.afterConfirmStockChange,
			scope: this,
			originalOnEdit: e,
			dialog: j
		});
	},
	/**
	 * Callback for the stock removal confirm window.
	 *
	 * The parameters are documented on:
	 * http://docs.sencha.com/ext-js/4-0/#!/api/Ext.window.MessageBox-method-show
	 */
	afterConfirmStockChange: function (buttonId, text, opts) {
		if (buttonId === 'cancel') {
			opts.originalOnEdit.record.set('stockLevel', opts.originalOnEdit.originalValue);
			return;
		}

		this.handleStockChange(opts.originalOnEdit);
	},
	/**
	 * Handles the stock change. Automatically figures out which method to call (deleteStock or addStock) and
	 * sets the correct quantity.
	 *
	 * @param e An edit event, as documented in
	 *            http://docs.sencha.com/ext-js/4-0/#!/api/Ext.grid.plugin.CellEditing-event-edit
	 */
	handleStockChange: function (e) {
		let mode = this.getStockChangeMode(e.value),
			value = Math.abs(parseInt(e.value)),
			call;

		if (e.value === 0) {
			return;
		}

		switch (mode) {
			case 'removal':
				call = 'removeStock';
				break;
			case 'addition':
				call = 'addStock';
				break;
			case 'fixed':
				call = 'setStock';
				break;
			default:
				return;
		}

		e.record.callPutAction(call, {
			quantity: value
		}, Ext.bind(function () {
			this.reloadPart(e);
			Ext.GlobalEvents.fireEvent('partStockChanged');
		}, this));
	},
	reloadPart: function (opts) {
		this.loadPart(opts.record.getId(), opts);
	},
	loadPart: function (id) {
		Limas.Entity.Part.load(id, {
			scope: this,
			success: this.onPartLoaded
		});
	},
	onPartLoaded: function (record) {
		// The Part model declares `idProperty: '@id'` (IRI string like
		// `/api/parts/123`), so the previous `findRecord('id', …)` always
		// missed — there is no scalar `id` field on the model. Use
		// `store.getById(...)` so ExtJS resolves the lookup against the
		// model's declared idProperty, then update the record in place.
		let rec = this.store.getById(record.getId());
		if (rec) {
			rec.set('stockLevel', record.get('stockLevel'));
		}
	}
});
