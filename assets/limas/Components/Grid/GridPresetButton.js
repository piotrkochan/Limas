/**
 * Toolbar dropdown for picking / saving / managing GridPreset rows for the
 * current grid. Presets capture column layout and active store filters; the
 * Limas.Components.Grid.GridPresetState helper does the serialization.
 *
 * Builds its own menu manually instead of going through Ext.ux.menu.StoreMenu —
 * StoreMenu copied `record.data.id` straight onto the menu item config, and
 * Ext rejects "1" as a component id, blowing up the first time the user
 * actually saved a preset.
 */
Ext.define('Limas.Components.Grid.GridPresetButton', {
	extend: 'Ext.button.Button',

	iconCls: 'fugue-icon folder-open-table',
	tooltip: i18n('Choose preset…'),
	overflowText: i18n('Choose preset…'),

	grid: null,
	presetStore: null,
	activePresetId: null,
	presetsLoaded: false,
	initialPresetRestore: true,

	initComponent: function () {
		this.presetStore = Ext.create('Ext.data.Store', {
			model: 'Limas.Entity.GridPreset',
			autoLoad: false
		});

		this.menu = Ext.create('Ext.menu.Menu');
		this.presetStore.on('load', this.rebuildMenu, this);
		// Auto-apply runs ONCE after first load (cleared with this.didAutoApply).
		// Subsequent loads (e.g. after Save / Manage dialogs close) shouldn't
		// reset the user's current preset selection.
		this.didAutoApply = false;
		this.presetStore.on('load', this.maybeAutoApplyDefault, this);
		this.presetStore.on('load', function () {
			this.presetsLoaded = true;
			if (this.activePresetId && !this.getActivePreset()) this.setActivePreset(null);
			this.grid.fireEvent('presetload');
		}, this);

		this.callParent(arguments);

		if (this.grid !== null) {
			this.setGrid(this.grid);
		}
	},

	maybeAutoApplyDefault: function () {
		if (this.didAutoApply) {
			return;
		}
		this.didAutoApply = true;
		let defaultRec = this.presetStore.findRecord('gridDefault', true, 0, false, false, true);
		if (defaultRec) {
			this.onPresetSelect(defaultRec);
		}
	},

	setGrid: function (grid) {
		this.grid = grid;
		this.presetStore.clearFilter();
		this.presetStore.addFilter({
			property: 'grid',
			operator: '=',
			value: grid.$className
		});
		this.presetStore.load();
	},

	rebuildMenu: function () {
		this.menu.removeAll();
		this.menu.add([
			{
				text: i18n('Save current preset'),
				iconCls: 'fugue-icon disk',
				disabled: !this.getActivePreset(),
				handler: Ext.bind(this.onSaveCurrentPreset, this)
			},
			{
				text: i18n('Save as new preset…'),
				iconCls: 'fugue-icon disk--plus',
				handler: Ext.bind(this.onSavePreset, this)
			},
			{
				text: i18n('Manage presets…'),
				iconCls: 'fugue-icon gear',
				handler: Ext.bind(this.onManagePresets, this)
			},
			{xtype: 'menuseparator'},
			{
				text: i18n('Default'),
				iconCls: 'fugue-icon inbox-table',
				handler: Ext.bind(this.onDefaultSelect, this)
			}
		]);

		let records = this.presetStore.getRange();
		if (records.length > 0) {
			this.menu.add({xtype: 'menuseparator'});
		}
		records.forEach(function (rec) {
			let label = rec.get('name') + (rec.get('gridDefault') ? ' ★' : '')
				+ (this.presetId(rec) === this.activePresetId ? ' ✓' : '');
			this.menu.add({
				text: label,
				iconCls: 'fugue-icon table',
				presetRecord: rec,
				handler: Ext.bind(this.onPresetSelect, this, [rec])
			});
		}, this);
	},

	onDefaultSelect: function () {
		this.setActivePreset(null);
		Limas.Components.Grid.GridPresetState.applyDefault(this.grid);
	},
	onPresetSelect: function (rec) {
		this.setActivePreset(rec);
		Limas.Components.Grid.GridPresetState.apply(this.grid, rec.get('configuration'));
	},
	presetId: function (rec) {
		let match = rec && String(rec.get('@id') || '').match(/^\/api\/grid_presets\/([1-9]\d*)$/);
		return match ? match[1] : null;
	},
	getActivePreset: function () {
		let id = this.activePresetId;
		return id && this.presetStore.getRange().find(function (rec) {
			return this.presetId(rec) === id;
		}, this);
	},
	setActivePreset: function (rec) {
		this.activePresetId = this.presetId(rec);
		this.rebuildMenu();
		this.grid.fireEvent('presetchange');
	},
	restorePreset: function (id) {
		if (!id && this.initialPresetRestore && this.activePresetId) {
			this.initialPresetRestore = false;
			return;
		}
		this.initialPresetRestore = false;
		let rec = id && this.presetStore.getRange().find(function (entry) {
			return this.presetId(entry) === id;
		}, this);
		if (rec) this.onPresetSelect(rec);
		else this.onDefaultSelect();
	},
	onSaveCurrentPreset: function () {
		let rec = this.getActivePreset();
		if (!rec) return;
		rec.set('configuration', Ext.encode(Limas.Components.Grid.GridPresetState.capture(this.grid)));
		rec.save({
			success: Ext.bind(function () {
				Ext.toast({html: '<b>' + Ext.htmlEncode(rec.get('name')) + '</b> ' + i18n('saved.'), align: 't', autoCloseDelay: 3000});
				this.presetStore.load();
			}, this),
			failure: Ext.bind(function () {
				rec.reject();
				Ext.Msg.alert(i18n('Error'), i18n('Could not save the preset.'));
			}, this)
		});
	},

	onSavePreset: function () {
		Ext.create('Limas.Components.Grid.SaveGridPresetDialog', {
			grid: this.grid,
			presetStore: this.presetStore,
			onSaved: Ext.bind(this.setActivePreset, this)
		}).show();
	},
	onManagePresets: function () {
		Ext.create('Limas.Components.Grid.ManageGridPresetsDialog', {
			grid: this.grid,
			presetStore: this.presetStore
		}).show();
	}
});
