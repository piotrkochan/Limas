Ext.define('Limas.ProjectEditor', {
	extend: 'Limas.Editor',
	alias: 'widget.ProjectEditor',

	saveText: i18n('Save Project'),
	bodyPadding: 0,
	autoScroll: false,
	layout: 'fit',

	initComponent: function () {
		/**
		 * Due to an ExtJS issue, we need to delay the event for a bit
		 *
		 * @todo Fix this in a cleaner way
		 */
		this.on('startEdit', this.onEditStart, this, {
			delay: 200
		});
		this.on('itemSaved', this._onItemSaved, this);

		let config = {};

		// Build the initial (empty) store for the project parts
		Ext.Object.merge(config, {
			autoLoad: false,
			model: 'Limas.Entity.ProjectPart',
			autoSync: false, // Do not change. If true, new (empty) records would be immediately committed to the database.
			remoteFilter: false,
			remoteSort: false
		});

		this.store = Ext.create('Ext.data.Store', config);

		this.partGrid = Ext.create('Limas.ProjectPartGrid', {
			title: i18n('Project Parts'),
			iconCls: 'web-icon brick',
			store: this.store,
			listeners: {
				edit: this.onProjectGridEdit
			}
		});

		this.attachmentGrid = Ext.create('Limas.ProjectAttachmentGrid', {
			title: i18n('Attachments'),
			iconCls: 'web-icon attach'
		});

		this.detailsPanel = Ext.create('Ext.panel.Panel', {
			title: i18n('Project Details'),
			iconCls: 'fugue-icon drill',
			layout: 'anchor',
			bodyPadding: 15,
			defaults: {
				anchor: '100%',
				labelWidth: 150
			},
			items: [{
				xtype: 'textfield',
				name: 'name',
				fieldLabel: i18n('Project Name'),
				allowBlank: false
			}, {
				xtype: 'textarea',
				name: 'description',
				fieldLabel: i18n('Project Description'),
				height: 140
			}]
		});

		this.tabPanel = Ext.create('Ext.tab.Panel', {
			border: false,
			items: [this.partGrid, this.detailsPanel, this.attachmentGrid]
		});
		this.items = this.tabPanel;
		this.callParent();
		this.partsSaveButton = Ext.create('Ext.button.Button', {
			text: i18n('Save part changes'),
			iconCls: 'fugue-icon disk',
			hidden: true,
			handler: Ext.bind(this._onItemSave, this)
		});
		this.partGrid.getDockedItems('toolbar')[0].add(['->', this.partsSaveButton]);
		this.tabPanel.on('tabchange', this.updateSaveToolbar, this);
		this.updateSaveToolbar();
	},
	updateSaveToolbar: function () {
		if (this.bottomToolbar) this.bottomToolbar.setHidden(this.tabPanel.getActiveTab() === this.partGrid);
	},
	markPartsDirty: function () {
		this.partsSaveButton.show();
	},
	bindPartsStore: function (store) {
		if (this.boundPartsStore) {
			this.boundPartsStore.un('update', this.markPartsDirty, this);
			this.boundPartsStore.un('add', this.markPartsDirty, this);
			this.boundPartsStore.un('remove', this.markPartsDirty, this);
		}
		this.boundPartsStore = store;
		this.partGrid.bindStore(store);
		store.on('update', this.markPartsDirty, this);
		store.on('add', this.markPartsDirty, this);
		store.on('remove', this.markPartsDirty, this);
	},
	/**
	 * Handle transparent setting of the part name after a value was selected from the combobox
	 */
	onProjectGridEdit: function (editor, e) {
		if (e.field === 'part_id') {
			/**
			 * If the user cancelled the editing, set the field to the original value
			 */
			if (e.value === null) {
				e.record.set('part_id', e.originalValue);
			}

			/**
			 * Inject the name into the record
			 */
			let rec = e.column.getEditor().store.getById(e.value);
			if (rec) {
				e.record.set('part_name', rec.get('name'));
			}
		}
	},
	/**
	 * Re-bind the store after an item was saved
	 */
	_onItemSaved: function (record) {
		this.bindPartsStore(record.parts());
		this.partsSaveButton.hide();
		this.attachmentGrid.bindStore(record.attachments());
	},
	/**
	 * Bind the store as soon as the view was rendered
	 *
	 * @todo This is a hack, because invocation of this method is delayed
	 */
	onEditStart: function () {
		this.bindPartsStore(this.record.parts());
		this.attachmentGrid.bindStore(this.record.attachments());
		this.tabPanel.setActiveTab(this.record.phantom ? this.detailsPanel : this.partGrid);
		this.updateSaveToolbar();
	}
});
