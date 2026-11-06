Ext.define('Limas.Components.UserPreferences.Preferences.FormattingConfiguration', {
	extend: 'Limas.Components.Preferences.PreferenceEditor',

	initComponent: function () {
		this.createWidgets();
		this.loadDefaults();

		this.items = [
			this.priceNumDecimalsField,
			this.useThousandSeparatorCheckbox,
			this.currencyCodeField,
			this.currencyAtEndCheckbox,
			this.rateInfo,
			this.refreshRatesButton
		];

		this.callParent();
	},
	loadDefaults: function () {
		this.priceNumDecimalsField.setValue(Limas.getApplication().getUserPreference('limas.formatting.currency.numdecimals', 2));
		this.useThousandSeparatorCheckbox.setValue(Limas.getApplication().getUserPreference('limas.formatting.currency.thousandsSeparator', true));
		this.currencyAtEndCheckbox.setValue(Limas.getApplication().getUserPreference('limas.formatting.currency.currencySymbolAtEnd', true));
		this.currencyCodeField.setValue(Limas.getApplication().getDisplayCurrency());
		this.updateRateInfo();
	},

	createWidgets: function () {
		this.priceNumDecimalsField = Ext.create('Ext.form.field.Number', {
			name: 'priceNumDecimalsField',
			fieldLabel: i18n('Decimal precision'),
			labelWidth: 120,
			columnWidth: 0.5,
			minValue: 0,
			maxValue: 4,
			allowDecimals: false
		});

		this.useThousandSeparatorCheckbox = Ext.create('Ext.form.field.Checkbox', {
			boxLabel: i18n('Separate thousands'),
			labelWidth: 120,
			hideEmptyLabel: false
		});

		this.currencyCodeField = Ext.create('Ext.form.field.ComboBox', {
			fieldLabel: i18n('Display currency'), labelWidth: 120,
			queryMode: 'local', displayField: 'code', valueField: 'code',
			editable: false, forceSelection: true,
			store: Ext.create('Ext.data.Store', {fields: ['code'], data: Limas.getApplication().getSupportedCurrencies()}),
			listeners: {expand: function (combo) {
				combo.getStore().loadData(Limas.getApplication().getSupportedCurrencies());
			}}
		});
		this.rateInfo = Ext.create('Ext.Component', {html: ''});
		this.refreshRatesButton = Ext.create('Ext.button.Button', {
			text: i18n('Update exchange rates'),
			handler: this.refreshRates, scope: this
		});

		this.currencyAtEndCheckbox = Ext.create('Ext.form.field.Checkbox', {
			boxLabel: i18n('Currency Symbol after value'),
			labelWidth: 120,
			hideEmptyLabel: false
		});
	},

	onSave: function () {
		let app = Limas.getApplication();
		app.setUserPreference('limas.formatting.currency.numdecimals', this.priceNumDecimalsField.getValue());
		app.setUserPreference('limas.formatting.currency.thousandsSeparator', this.useThousandSeparatorCheckbox.getValue());
		app.setUserPreference('limas.formatting.currency.code', this.currencyCodeField.getValue());
		app.setUserPreference('limas.formatting.currency.currencySymbolAtEnd', this.currencyAtEndCheckbox.getValue());
		app.refreshCurrencyViews();
	},
	updateRateInfo: function () {
		let rates = Limas.getApplication().exchangeRates;
		if (this.rateInfo) this.rateInfo.setHtml(rates
			? Ext.htmlEncode(i18n('ECB rates from') + ' ' + rates.date)
			: Ext.htmlEncode(i18n('Exchange rates unavailable')));
	},
	refreshRates: function () {
		this.refreshRatesButton.setDisabled(true);
		Ext.Ajax.request({
			url: Limas.getBasePath() + '/api/exchange-rates/refresh', method: 'POST', scope: this,
			success: function (response) {
				Limas.getApplication().setExchangeRates(Ext.decode(response.responseText));
				this.currencyCodeField.getStore().loadData(Limas.getApplication().getSupportedCurrencies());
				this.updateRateInfo();
				this.refreshRatesButton.setDisabled(false);
			},
			failure: function () {
				this.refreshRatesButton.setDisabled(false);
				Ext.Msg.alert(i18n('Exchange rates'), i18n('Could not fetch ECB exchange rates.'));
			}
		});
	},
	statics: {
		iconCls: 'fugue-icon ui-text-field-format',
		title: i18n('Formatting'),
		menuPath: [{iconCls: 'fugue-icon ui-scroll-pane-image', text: i18n('User Interface')}]
	}
});
