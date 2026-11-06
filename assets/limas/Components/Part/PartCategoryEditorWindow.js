// Use the browser's color input directly. Ext.form.field.Text's value
// bookkeeping can reset the native picker to its previous color.
Ext.define('Limas.ColorInput', {
	extend: 'Ext.Component',
	autoEl: {tag: 'input', type: 'color'},
	width: 65,
	height: 30,
	value: '#d4ad4a',
	afterRender: function () {
		this.callParent(arguments);
		this.el.dom.value = this.value;
		this.el.dom.disabled = !!this.disabled;
		this.mon(this.el, 'input', this.onNativeColorChange, this);
		this.mon(this.el, 'change', this.onNativeColorChange, this);
	},
	onNativeColorChange: function () {
		this.value = this.el.dom.value;
	},
	getValue: function () {
		return this.rendered ? this.el.dom.value : this.value;
	},
	setValue: function (value) {
		this.value = value;
		if (this.rendered) this.el.dom.value = value;
	},
	setDisabled: function (disabled) {
		this.callParent(arguments);
		if (this.rendered) this.el.dom.disabled = disabled;
	}
});

/**
 * PartCategory-specific editor window. Extends the generic CategoryEditorWindow
 * with a second tab carrying the per-category default parameter templates.
 * Templates pre-populate new Parts created in this (or any child) category.
 *
 * PartKeepr issues #777 / #366 / #54
 */
Ext.define('Limas.PartCategoryEditorWindow', {
	extend: 'Ext.window.Window',
	alias: 'widget.PartCategoryEditorWindow',

	border: false,
	width: 700,
	height: 520,
	categoryModel: null,
	layout: 'fit',

	initComponent: function () {
		this.formPanel = Ext.create('Limas.CategoryEditorForm', {
			title: i18n('General')
		});
		this.colorEnabled = Ext.create('Ext.form.field.Checkbox', {
			boxLabel: i18n('Use folder color'),
			margin: '0 12 0 0',
			listeners: {
				change: Ext.bind(function (field, enabled) { this.colorField.setDisabled(!enabled); }, this)
			}
		});
		this.colorField = Ext.create('Limas.ColorInput');
		this.formPanel.add({
			xtype: 'fieldcontainer',
			fieldLabel: i18n('Folder color'),
			layout: 'hbox',
			items: [this.colorEnabled, this.colorField]
		});

		this.inheritedGrid = Ext.create('Limas.Components.Part.PartCategoryInheritedDefaultsGrid');
		this.defaultsGrid = Ext.create('Limas.Components.Part.PartCategoryDefaultsGrid', {
			flex: 1,
			title: i18n('Own templates')
		});

		this.defaultsTab = Ext.create('Ext.panel.Panel', {
			title: i18n('Default Parameters'),
			layout: {type: 'vbox', align: 'stretch'},
			disabled: true,
			items: [this.inheritedGrid, this.defaultsGrid]
		});

		this.tabPanel = Ext.create('Ext.tab.Panel', {
			items: [this.formPanel, this.defaultsTab]
		});

		this.items = [this.tabPanel];

		this.buttons = [
			{text: i18n('Save'), handler: Ext.bind(this.onSave, this)},
			{text: i18n('Cancel'), handler: Ext.bind(this.onCancel, this)}
		];

		this.callParent();

		if (!this.record.phantom) {
			this.setTitle(i18n('Edit Category'));
			this.defaultsTab.setDisabled(false);
		} else {
			this.record.set('parent', this.parentRecord.getId());
			this.setTitle(i18n('Add Category'));
			// Defaults can be added after first save (need category id)
		}

		this.formPanel.loadRecord(this.record);
		let color = this.record.get('color');
		this.colorEnabled.setValue(!!color);
		this.colorField.setValue(color || '#d4ad4a');
		this.colorField.setDisabled(!color);

		if (!this.record.phantom) {
			this.defaultsGrid.bindCategoryRecord(this.record);
			this.inheritedGrid.bindCategoryRecord(this.record);
		}

		this.formPanel.down('textfield[name=name]').on('keypress', this.onEnter, this);
		this.formPanel.down('htmleditor[name=description]').on('keypress', this.onEnter, this);

		this.on('show', Ext.bind(this._onShow, this));
	},

	onEnter: function (field, e) {
		if (e.getKey() === e.ENTER && this.tabPanel.getActiveTab() === this.formPanel) {
			this.onSave();
		}
	},

	_onShow: function () {
		this.formPanel.items.first().focus();
	},

	onSave: function () {
		this.formPanel.updateRecord(this.record);
		this.record.set('color', this.colorEnabled.getValue() ? this.colorField.getValue() : null);

		let wasPhantom = this.record.phantom;
		this.record.save({
			success: Ext.bind(function (response) {
				if (wasPhantom) {
					// First save of a new category: switch the window into
					// edit-mode (defaults tab becomes editable, title flips)
					// and keep it open so the user can add parameters right
					// away — closing via the X button is the cancel path
					this.setTitle(i18n('Edit Category'));
					this.defaultsTab.setDisabled(false);
					this.defaultsGrid.bindCategoryRecord(this.record);
					this.inheritedGrid.bindCategoryRecord(this.record);
					this.tabPanel.setActiveTab(this.defaultsTab);
					this.fireEvent('save', response);
					return;
				}
				this.defaultsGrid.persistChanges(Ext.bind(function () {
					this.fireEvent('save', response);
					this.destroy();
				}, this));
			}, this)
		});
	},

	onCancel: function () {
		this.destroy();
	}
});
