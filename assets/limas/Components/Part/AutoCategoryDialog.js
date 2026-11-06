Ext.define('Limas.Components.Part.AutoCategoryDialog', {
	extend: 'Ext.window.Window',
	title: i18n('Auto category'),
	width: 850,
	height: 550,
	modal: true,
	layout: {type: 'vbox', align: 'stretch'},
	parts: null,
	onSuccess: null,

	initComponent: function () {
		this.proposeNew = Ext.create('Ext.form.field.Checkbox', {
			boxLabel: i18n('Propose new categories'),
			margin: '10 12 8 12'
		});
		this.previewStore = Ext.create('Ext.data.Store', {
			fields: ['partId', 'partName', 'current', 'target', 'categoryId', 'newCategory'],
			data: []
		});
		this.previewGrid = Ext.create('Ext.grid.Panel', {
			flex: 1,
			store: this.previewStore,
			selModel: {selType: 'checkboxmodel', mode: 'MULTI'},
			columns: [
				{text: i18n('Part'), dataIndex: 'partName', flex: 1,
					renderer: function (value) { return Ext.htmlEncode(String(value || '')); }},
				{text: i18n('Current category'), dataIndex: 'current', flex: 1,
					renderer: function (value) { return Ext.htmlEncode(String(value || '')); }},
				{text: i18n('Suggested category'), dataIndex: 'target', flex: 1.4,
					renderer: function (value, metadata, record) {
						if (!value) return '<span class="limas-text-muted">' + Ext.htmlEncode(i18n('No suggestion')) + '</span>';
						let label = record.get('newCategory') ? i18n('New: ') : '';
						return Ext.htmlEncode(label + value);
					}}
			]
		});
		this.applyButton = Ext.create('Ext.button.Button', {
			text: i18n('Apply selected'),
			iconCls: 'fugue-icon tick',
			disabled: true,
			handler: Ext.bind(this.applySuggestions, this)
		});
		this.items = [this.proposeNew, this.previewGrid];
		this.buttons = [
			{text: i18n('Preview suggestions'), handler: Ext.bind(this.previewSuggestions, this)},
			this.applyButton,
			{text: i18n('Close'), handler: Ext.bind(this.close, this)}
		];
		this.callParent();
		this.proposeNew.on('change', function () {
			this.previewStore.removeAll();
			this.applyButton.setDisabled(true);
		}, this);
	},

	previewSuggestions: function () {
		if (!this.parts || !this.parts.length) return;
		this.mask(i18n('Asking DeepSeek…'));
		Ext.Ajax.request({
			url: Limas.getBasePath() + '/api/parts/autoCategory/preview',
			method: 'POST',
			jsonData: {parts: this.parts, proposeNew: this.proposeNew.getValue()},
			success: Ext.bind(function (response) {
				this.unmask();
				let rows = Ext.decode(response.responseText).rows || [];
				this.previewStore.loadData(rows);
				let applicable = this.previewStore.getRange().filter(function (record) { return !!record.get('target'); });
				this.previewGrid.getSelectionModel().select(applicable);
				this.applyButton.setDisabled(applicable.length === 0);
			}, this),
			failure: Ext.bind(this.showError, this)
		});
	},

	applySuggestions: function () {
		let rows = this.previewGrid.getSelectionModel().getSelection()
			.filter(function (record) { return !!record.get('target'); })
			.map(function (record) {
				return {
					partId: record.get('partId'),
					categoryId: record.get('categoryId'),
					newCategory: record.get('newCategory')
				};
			});
		if (!rows.length) return;
		this.mask(i18n('Applying categories…'));
		Ext.Ajax.request({
			url: Limas.getBasePath() + '/api/parts/autoCategory/apply',
			method: 'POST',
			jsonData: {rows: rows},
			success: Ext.bind(function (response) {
				this.unmask();
				let result = Ext.decode(response.responseText);
				Ext.toast({html: Ext.String.format(i18n('Updated {0} part(s).'), result.updated), align: 't'});
				if (typeof this.onSuccess === 'function') this.onSuccess(result);
				this.close();
			}, this),
			failure: Ext.bind(this.showError, this)
		});
	},

	showError: function (response) {
		this.unmask();
		let body = {};
		try { body = Ext.decode(response.responseText); } catch (e) {}
		Ext.Msg.alert(i18n('Error'), Ext.htmlEncode(body.error || i18n('Auto category failed.')));
	}
});
