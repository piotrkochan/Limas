Ext.define('Limas.RemotePartComboBox', {
	extend: 'Ext.form.field.Picker',
	alias: 'widget.RemotePartComboBox',
	requires: ['Ext.grid.Panel'],
	selectedValue: null,
	editable: false,

	initComponent: function () {
		this.createStore({
			model: 'Limas.Entity.Part',
			groupField: 'categoryPath',
			sorters: [
				{
					property: 'name',
					direction: 'ASC'
				}
			]
		});

		this.callParent();
		this.createPicker();

		// Automatically expand field when focused
		this.on('focus', function () {
			this.onTriggerClick();
		}, this);
	},
	// Creates a store. To be called from child's initComponent
	createStore: function (config) {
		Ext.Object.merge(config, {
			autoLoad: true,
			autoSync: false, // Do not change. If true, new (empty) records would be immediately commited to the database.
			remoteFilter: true,
			remoteSort: true,
			pageSize: 15
		});

		this.store = Ext.create('Ext.data.Store', config);

		// Workaround for bug http://www.sencha.com/forum/showthread.php?133767-Store.sync()-does-not-update-dirty-flag&p=607093#post607093
		this.store.on('write', function (store, operation) {
			if (operation.wasSuccessful()) {
				Ext.each(operation.records, function (record) {
					if (record.dirty) {
						record.commit();
					}
				});
			}
		});
	},
	createPicker: function () {
		this.partsGrid = Ext.create('Limas.PartsGrid', {
			enableTopToolbar: true,
			enableEditing: false,
			store: this.store,
			region: 'center'
		});
		this.expandPickerButton = Ext.create('Ext.button.Button', {
			text: i18n('Expand'),
			iconCls: 'fugue-icon arrow-out',
			handler: Ext.bind(this.togglePickerSize, this)
		});
		this.partsGrid.topToolbar.add(this.expandPickerButton);

		this.filter = Ext.create('Limas.PartFilterPanel', {
			region: 'south',
			floatable: false,
			titleCollapse: true,
			height: 225,
			autoScroll: true,
			store: this.store,
			title: i18n('Part Filter'),
			split: true,
			collapsed: true,
			collapsible: true,
			listeners: {
				beforeCollapse: function () {
					this.partsGrid.focus();
				},
				scope: this
			}
		});

		this.picker = Ext.create('Ext.panel.Panel', {
			shrinkWrapDock: 2,
			layout: 'border',
			floating: true,
			focusOnToFront: false,
			manageHeight: false,
			height: 400,
			width: 600,
			minWidth: 350,
			shadow: false,
			ownerCmp: this,
			items: [this.partsGrid, this.filter]
		});

		this.picker.on({
			show: function () {
				this.partsGrid.searchField.setValue(this.getDisplayValue());
				this.partsGrid.searchField.startSearch();
			},
			scope: this
		});

		this.partsGrid.on('select', function (selModel, record) {
			this.setSelectedValue(record);
			this.setDisplayValue(record.get('name'));
			this.collapse();
		}, this);

		return this.picker;
	},
	togglePickerSize: function () {
		this.pickerExpanded = !this.pickerExpanded;
		if (this.pickerExpanded) {
			this.picker.setSize(Math.min(1100, Ext.Element.getViewportWidth() - 40),
				Math.min(700, Ext.Element.getViewportHeight() - 40));
			this.picker.alignTo(Ext.getBody(), 'c-c');
			this.expandPickerButton.setText(i18n('Compact'));
			this.filter.setHeight(300);
		} else {
			this.picker.setSize(600, 400);
			this.alignPicker();
			this.expandPickerButton.setText(i18n('Expand'));
			this.filter.setHeight(225);
		}
	},
	alignPicker: function () {
		if (this.pickerExpanded) this.picker.alignTo(Ext.getBody(), 'c-c');
		else this.callParent(arguments);
	},
	getDisplayValue: function () {
		return this.displayValue;
	},
	setSelectedValue: function (data) {
		this.selectedValue = data;
	},
	getValue: function () {
		return this.selectedValue;
	},
	setDisplayValue: function (value) {
		this.setRawValue(value);
		this.displayValue = value;
	},
	setValue: function (data) {
		this.selectedValue = data;
		this.setDisplayValue(data instanceof Ext.data.Model ? data.get('name') : '');
	},
	_selectRecords: function (r) {
		this.picker.getView().select(r);
		this.picker.getView().ensureVisible(r);
		this.picker.getView().scrollIntoView(r);
	},
	getErrors: function (value) {
		if (this.getValue() === null) {
			return [i18n('You need to select a part')];
		}
		return [];
	}
});
