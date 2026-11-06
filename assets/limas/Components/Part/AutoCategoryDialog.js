Ext.define('Limas.Components.Part.AutoCategoryDialog', {
	extend: 'Ext.window.Window',
	title: i18n('Auto category'),
	width: 1100,
	height: 550,
	modal: true,
	layout: {type: 'vbox', align: 'stretch'},
	parts: null,
	partDetails: null,
	onSuccess: null,

	initComponent: function () {
		this.proposeNew = Ext.create('Ext.form.field.Checkbox', {
			boxLabel: i18n('Propose new categories'),
			margin: '10 12 8 12'
		});
		this.previewStore = Ext.create('Ext.data.Store', {
			fields: ['partId', 'partName', 'description', 'distributorNumber', 'distributorSource', 'distributorUrl', 'target', 'categoryId', 'newCategory'],
			data: []
		});
		this.suggestionSummary = Ext.create('Ext.Component', {
			cls: 'limas-auto-category-summary',
			html: Ext.htmlEncode(i18n('Choose options, then click Preview suggestions.'))
		});
		this.previewGrid = Ext.create('Ext.grid.Panel', {
			flex: 1,
			store: this.previewStore,
			selModel: {selType: 'checkboxmodel', mode: 'MULTI'},
			viewConfig: {
				getRowClass: function (record) {
					return record.get('newCategory') ? 'limas-auto-category-new-row' : '';
				}
			},
			columns: [
				{text: i18n('Part'), dataIndex: 'partName', flex: 1, minWidth: 140,
					renderer: function (value, metadata, record) { return Ext.htmlEncode(String(record.get('partName') || '')); }},
				{text: i18n('Description'), dataIndex: 'description', flex: 2, minWidth: 200,
					renderer: function (value, metadata, record) { return Ext.htmlEncode(String(record.get('description') || '')); }},
				{text: i18n('Distributor number'), dataIndex: 'distributorNumber', flex: 1, minWidth: 150,
					renderer: Ext.bind(this.renderDistributorNumber, this)},
				{text: i18n('Suggested category'), dataIndex: 'target', flex: 1.5, minWidth: 230,
					renderer: Ext.bind(this.renderSuggestedCategory, this)}
			]
		});
		this.applyButton = Ext.create('Ext.button.Button', {
			text: i18n('Apply selected'),
			iconCls: 'fugue-icon tick',
			disabled: true,
			handler: Ext.bind(this.applySuggestions, this)
		});
		this.items = [this.proposeNew, this.suggestionSummary, this.previewGrid];
		this.buttons = [
			{text: i18n('Preview suggestions'), handler: Ext.bind(this.previewSuggestions, this)},
			this.applyButton,
			{text: i18n('Close'), handler: Ext.bind(this.close, this)}
		];
		this.callParent();
		this.proposeNew.on('change', function () {
			this.previewStore.removeAll();
			this.applyButton.setDisabled(true);
			this.suggestionSummary.update(Ext.htmlEncode(i18n('Options changed. Click Preview suggestions.')));
		}, this);
	},

	renderDistributorNumber: function (value, metadata, record) {
		let number = record.get('distributorNumber');
		if (!number) return '';
		let source = record.get('distributorSource') || '';
		let hasSprite = Ext.Array.contains(
			['avnet', 'mouser', 'digikey', 'element14', 'farnell', 'lcsc', 'newark', 'oemsecrets', 'rs', 'tme'], source);
		let icon = hasSprite
			? '<i class="distributor-icon ' + source + '" style="margin-right:6px;"></i>'
			: '<i class="web-icon lorry" style="margin-right:6px;"></i>';
		let content = icon + Ext.htmlEncode(String(number));
		let url = record.get('distributorUrl');
		return url ? '<a href="' + Ext.htmlEncode(url) + '" target="_blank" rel="noopener noreferrer">' + content + '</a>' : content;
	},

	renderSuggestedCategory: function (value, metadata, record) {
		let target = record.get('target');
		if (!target) return '<span class="limas-text-muted">' + Ext.htmlEncode(i18n('No suggestion')) + '</span>';
		let badge = record.get('newCategory')
			? '<span class="limas-auto-category-new-badge">' + Ext.htmlEncode(i18n('NEW')) + '</span> ' : '';
		return badge + Ext.htmlEncode(String(target));
	},

	updateSuggestionSummary: function (rows) {
		let suggested = rows.filter(function (row) { return !!row.target; });
		let categoryNames = Array.from(new Set(suggested.map(function (row) { return row.target; })));
		let newNames = Array.from(new Set(suggested.filter(function (row) { return !!row.newCategory; })
			.map(function (row) { return row.target; })));
		let html = '<strong>' + Ext.htmlEncode(i18n('Suggested categories')) + ': '
			+ suggested.length + ' / ' + rows.length + '</strong>';
		if (!suggested.length) html += ' — ' + Ext.htmlEncode(i18n('No suggestions returned. Try adding part descriptions or enabling new categories.'));
		if (categoryNames.length) html += '<br>' + Ext.htmlEncode(i18n('Proposed categories')) + ': '
			+ categoryNames.map(function (name) { return '<strong>' + Ext.htmlEncode(name) + '</strong>'; }).join(' · ');
		if (newNames.length) html += '<br>' + Ext.htmlEncode(i18n('New categories')) + ': '
			+ newNames.map(function (name) { return '<strong>' + Ext.htmlEncode(name) + '</strong>'; }).join(' · ');
		this.suggestionSummary.update(html);
	},

	previewSuggestions: function () {
		if (!this.parts || !this.parts.length) return;
		let requestNumber = (this.previewRequestNumber || 0) + 1;
		this.previewRequestNumber = requestNumber;
		this.applyButton.setDisabled(true);
		this.suggestionSummary.update(Ext.htmlEncode(i18n('Asking DeepSeek…')));
		this.mask(i18n('Asking DeepSeek…'));
		Ext.Ajax.request({
			url: Limas.getBasePath() + '/api/parts/autoCategory/preview',
			method: 'POST',
			jsonData: {parts: this.parts, proposeNew: this.proposeNew.getValue()},
			success: Ext.bind(function (response) {
				if (requestNumber !== this.previewRequestNumber) return;
				this.unmask();
				let rows = (Ext.decode(response.responseText).rows || []).map(function (row) {
					let details = this.partDetails && this.partDetails['/api/parts/' + row.partId] || {};
					return Ext.apply({}, details, row);
				}, this);
				this.previewStore.loadData(rows);
				this.updateSuggestionSummary(rows);
				let applicable = this.previewStore.getRange().filter(function (record) { return !!record.get('target'); });
				this.previewGrid.getSelectionModel().select(applicable);
				this.applyButton.setDisabled(applicable.length === 0);
			}, this),
			failure: Ext.bind(function (response) {
				if (requestNumber !== this.previewRequestNumber) return;
				this.showError(response);
			}, this)
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
