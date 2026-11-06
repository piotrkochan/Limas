Ext.define('Limas.Components.Part.DistributorDataRefreshDialog', {
	extend: 'Ext.window.Window',
	title: i18n('Update distributor data'),
	width: 1180,
	height: 620,
	modal: true,
	layout: 'fit',
	parts: null,
	onSuccess: null,

	initComponent: function () {
		this.previewStore = Ext.create('Ext.data.Store', {
			fields: ['key', 'fingerprint', 'partId', 'partName', 'distributor', 'sku', 'field', 'label',
				'current', 'proposed', 'defaultSelected'],
			data: []
		});
		this.previewGrid = Ext.create('Ext.grid.Panel', {
			store: this.previewStore,
			selModel: {selType: 'checkboxmodel', mode: 'MULTI', showHeaderCheckbox: true},
			viewConfig: {enableTextSelection: true},
			columns: [
				{text: i18n('Part'), dataIndex: 'partName', width: 175},
				{text: i18n('Distributor'), dataIndex: 'distributor', width: 115},
				{text: 'SKU', dataIndex: 'sku', width: 140},
				{text: i18n('Field'), dataIndex: 'label', width: 130,
					renderer: function (value) { return Ext.htmlEncode(i18n(value)); }},
				{text: i18n('Current'), dataIndex: 'current', flex: 1, minWidth: 180,
					renderer: this.renderValue},
				{text: i18n('From distributor'), dataIndex: 'proposed', flex: 1, minWidth: 180,
					renderer: this.renderValue}
			]
		});
		this.statusText = Ext.create('Ext.toolbar.TextItem', {text: ''});
		this.applyButton = Ext.create('Ext.button.Button', {
			text: i18n('Apply selected'), disabled: true,
			handler: Ext.bind(this.applyChanges, this)
		});
		this.items = [this.previewGrid];
		this.bbar = [
			{text: i18n('Select all'), handler: function () { this.previewGrid.getSelectionModel().selectAll(); }, scope: this},
			{text: i18n('Select none'), handler: function () { this.previewGrid.getSelectionModel().deselectAll(); }, scope: this},
			this.statusText, '->', this.applyButton,
			{text: i18n('Close'), handler: Ext.bind(this.close, this)}
		];
		this.callParent();
		this.previewGrid.getSelectionModel().on('selectionchange', function (selectionModel, selected) {
			this.applyButton.setDisabled(!selected.length);
		}, this);
		this.on('show', this.loadPreview, this);
	},

	renderValue: function (value) {
		return Ext.htmlEncode(String(value || '')).replace(/\n/g, '<br>');
	},

	loadPreview: function () {
		this.setLoading(i18n('Loading distributor data…'));
		Ext.Ajax.request({
			url: Limas.getBasePath() + '/api/parts/distributor-data/preview',
			method: 'POST', timeout: 180000, jsonData: {parts: this.parts}, scope: this,
			success: function (response) {
				this.setLoading(false);
				let result = Ext.decode(response.responseText);
				this.previewStore.loadData(result.rows || []);
				let defaults = this.previewStore.getRange().filter(function (row) { return !!row.get('defaultSelected'); });
				this.previewGrid.getSelectionModel().select(defaults);
				this.statusText.setText((result.rows || []).length + ' ' + i18n('change(s)')
					+ ((result.skipped || []).length ? ', ' + result.skipped.length + ' ' + i18n('skipped') : ''));
			},
			failure: function (response) { this.showError(response, i18n('Could not load distributor data.')); }
		});
	},

	applyChanges: function () {
		let selected = {};
		this.previewGrid.getSelectionModel().getSelection().forEach(function (row) {
			selected[row.get('key')] = row.get('fingerprint');
		});
		if (!Object.keys(selected).length) return;
		this.setLoading(i18n('Updating distributor data…'));
		Ext.Ajax.request({
			url: Limas.getBasePath() + '/api/parts/distributor-data/apply',
			method: 'POST', timeout: 180000, jsonData: {parts: this.parts, selected: selected}, scope: this,
			success: function (response) {
				this.setLoading(false);
				let result = Ext.decode(response.responseText);
				if (this.onSuccess) this.onSuccess(result);
				let summary = Ext.String.format(i18n('Updated {0} field(s).'), result.updated || 0);
				if ((result.skipped || []).length) {
					summary += '<br><br>' + Ext.String.format(i18n('Skipped {0} field(s):'), result.skipped.length)
						+ '<br>' + result.skipped.slice(0, 10).map(function (item) {
							return '#' + Number(item.partId) + ' ' + Ext.htmlEncode(item.distributor || '')
								+ ': ' + Ext.htmlEncode(item.reason);
						}).join('<br>');
				}
				Ext.Msg.alert(i18n('Update distributor data'), summary);
				this.close();
			},
			failure: function (response) { this.showError(response, i18n('Update failed.')); }
		});
	},

	showError: function (response, fallback) {
		this.setLoading(false);
		let body = {};
		try { body = Ext.decode(response.responseText); } catch (error) {}
		Ext.Msg.alert(i18n('Update distributor data'), Ext.htmlEncode(body.error || fallback));
	}
});
