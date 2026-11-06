Ext.define('Limas.Importer.GridImporterButton', {
	extend: 'Ext.button.Button',

	initComponent: function () {
		this.handler = this.onImport;
		this.callParent(arguments);
	},
	onImport: function () {
		let grid = this.grid || this.up('gridpanel');
		if (!grid) {
			Ext.Msg.alert(i18n('Import'), i18n('Could not find the table to import into.'));
			return;
		}
		Ext.create('Ext.window.Window', {
			items: Ext.create('Limas.Importer.Importer', {
				model: grid.getStore().getModel()
			}),
			title: i18n('Import'),
			width: '80%',
			height: '80%',
			layout: 'fit',
			maximizable: true,
			closeAction: 'destroy'

		})
			.show();
	}
});
