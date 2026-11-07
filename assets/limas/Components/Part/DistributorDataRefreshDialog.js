Ext.define('Limas.Components.Part.DistributorDataRefreshDialog', {
	extend: 'Ext.window.Window',
	title: i18n('Update distributor data'),
	width: 1180,
	height: 620,
	modal: true,
	layout: 'border',
	parts: null,
	onSuccess: null,
	previewId: null,

	initComponent: function () {
		this.previewStore = Ext.create('Ext.data.Store', {
			fields: ['key', 'fingerprint', 'partId', 'partName', 'distributor', 'sku', 'field', 'label',
				'current', 'proposed', 'defaultSelected'],
			data: []
		});
		this.unchangedStore = Ext.create('Ext.data.Store', {
			fields: ['partName', 'distributor', 'sku', 'label', 'current'], data: []
		});
		this.previewGrid = Ext.create('Ext.grid.Panel', {
			region: 'center',
			bufferedRenderer: false,
			store: this.previewStore,
			selModel: {selType: 'checkboxmodel', mode: 'MULTI', showHeaderCheckbox: true},
			viewConfig: {enableTextSelection: true, deferEmptyText: false,
				emptyText: i18n('No changes to apply.')},
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
		this.unchangedGrid = Ext.create('Ext.grid.Panel', {
			region: 'south', height: 90, hidden: true,
			bufferedRenderer: false,
			title: i18n('Already up to date'), store: this.unchangedStore,
			disableSelection: true,
			viewConfig: {enableTextSelection: true},
			columns: [
				{text: i18n('Part'), dataIndex: 'partName', width: 175, renderer: this.renderUnchangedValue},
				{text: i18n('Distributor'), dataIndex: 'distributor', width: 115, renderer: this.renderUnchangedValue},
				{text: 'SKU', dataIndex: 'sku', width: 140, renderer: this.renderUnchangedValue},
				{text: i18n('Field'), dataIndex: 'label', width: 130, renderer: this.renderUnchangedValue},
				{text: i18n('Value'), dataIndex: 'current', flex: 1, renderer: this.renderUnchangedValue}
			]
		});
		this.statusText = Ext.create('Ext.toolbar.TextItem', {text: ''});
		this.applyButton = Ext.create('Ext.button.Button', {
			text: i18n('Apply selected'), disabled: true,
			handler: Ext.bind(this.applyChanges, this)
		});
		this.items = [this.previewGrid, this.unchangedGrid];
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
	renderUnchangedValue: function (value) {
		return '<span style="color:#888">' + Ext.htmlEncode(String(value || '')).replace(/\n/g, '<br>') + '</span>';
	},

	loadPreview: function () {
		this.previewId = null;
		this.setLoading(i18n('Loading distributor data…'));
		Ext.Ajax.request({
			url: Limas.getBasePath() + '/api/parts/distributor-data/preview',
			method: 'POST', timeout: 180000, jsonData: {parts: this.parts}, scope: this,
			success: function (response) {
				this.setLoading(false);
				let result = Ext.decode(response.responseText);
				this.previewId = result.previewId || null;
				this.previewStore.loadData(result.rows || []);
				let unchanged = result.unchanged || [];
				this.unchangedStore.loadData(unchanged);
				this.unchangedGrid.setTitle(i18n('Already up to date') + ' (' + unchanged.length + ')');
				this.unchangedGrid.setHeight(Math.min(220, 64 + unchanged.length * 28));
				this.unchangedGrid.setHidden(unchanged.length === 0);
				let defaults = this.previewStore.getRange().filter(function (row) { return !!row.get('defaultSelected'); });
				this.previewGrid.getSelectionModel().select(defaults);
				this.statusText.setText((result.rows || []).length + ' ' + i18n('change(s)')
					+ ', ' + unchanged.length + ' ' + i18n('already up to date')
					+ ((result.skipped || []).length ? ', ' + result.skipped.length + ' ' + i18n('skipped') : ''));
				if (!(result.rows || []).length && (result.skipped || []).length) {
					Ext.Msg.alert(i18n('Update distributor data'), result.skipped.slice(0, 10).map(function (item) {
						return '#' + Number(item.partId) + ': ' + Ext.htmlEncode(item.reason);
					}).join('<br>'));
				}
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
			method: 'POST', timeout: 180000,
			jsonData: {parts: this.parts, selected: selected, previewId: this.previewId}, scope: this,
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
