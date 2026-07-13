/**
 * Admin panel for duplicate-part detection. Backed by three SystemPreference
 * keys read by PartService on Part creation:
 *   limas.part.duplicateDetection.mode        — off | warn | block
 *   limas.part.duplicateDetection.checkName   — match on Part name
 *   limas.part.duplicateDetection.checkMpn    — match on manufacturer part number
 *
 * 'warn' shows a confirm dialog the user can override; 'block' refuses the
 * save (enforced backend-side on POST too). Detection runs on create only.
 */
Ext.define('Limas.Components.SystemPreferences.Preferences.DuplicatePartDetection', {
	extend: 'Limas.Components.Preferences.PreferenceEditor',

	initComponent: function () {
		this.items = [
			{
				fieldLabel: i18n('Mode'),
				xtype: 'combobox',
				itemId: 'dupMode',
				editable: false,
				forceSelection: true,
				queryMode: 'local',
				valueField: 'value',
				displayField: 'label',
				store: {
					fields: ['value', 'label'],
					data: [
						{value: 'off', label: i18n('Off — allow duplicates silently')},
						{value: 'warn', label: i18n('Warn — confirm dialog, user can proceed')},
						{value: 'block', label: i18n('Block — refuse to create a duplicate')}
					]
				}
			}, {
				xtype: 'checkbox',
				itemId: 'dupCheckName',
				fieldLabel: i18n('Match on'),
				boxLabel: i18n('Part name'),
				hideEmptyLabel: false
			}, {
				xtype: 'checkbox',
				itemId: 'dupCheckMpn',
				hideLabel: true,
				boxLabel: i18n('Manufacturer part number')
			}, {
				xtype: 'displayfield',
				hideLabel: true,
				value: '<i class="limas-text-muted">' + i18n('Detection runs when creating a new part. Matching is case-insensitive. If both are checked, either a name or an MPN match counts as a duplicate.') + '</i>'
			}
		];

		this.callParent(arguments);

		let app = Limas.getApplication();
		this.down('#dupMode').setValue(app.getSystemPreference('limas.part.duplicateDetection.mode', 'off'));
		this.down('#dupCheckName').setValue(app.getSystemPreference('limas.part.duplicateDetection.checkName', true));
		this.down('#dupCheckMpn').setValue(app.getSystemPreference('limas.part.duplicateDetection.checkMpn', true));
	},
	onSave: function () {
		let app = Limas.getApplication();
		app.setSystemPreference('limas.part.duplicateDetection.mode', this.down('#dupMode').getValue());
		app.setSystemPreference('limas.part.duplicateDetection.checkName', this.down('#dupCheckName').getValue());
		app.setSystemPreference('limas.part.duplicateDetection.checkMpn', this.down('#dupCheckMpn').getValue());
	},
	statics: {
		iconCls: 'fugue-icon documents-stack',
		title: i18n('Duplicate Part Detection'),
		menuPath: []
	}
});
