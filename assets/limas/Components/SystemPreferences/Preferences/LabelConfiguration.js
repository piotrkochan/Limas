/**
 * Admin panel for the label printer defaults. Backed by SystemPreference
 * keys that LabelGenerator reads on every render, with sensible fallbacks.
 *
 * Global:
 *   limas.label.qrBaseUrl                — deep-link prefix (blank = request)
 * Part (also the shared base Storage inherits by default):
 *   limas.label.widthMm / heightMm       — dimensions
 *   limas.label.symbology                — qrcode / datamatrix
 *   limas.label.qr.eccLevel              — L / M / Q / H (QR only)
 *   limas.label.part.subtitleFields      — ordered array of field keys (0-3)
 * Storage:
 *   limas.label.storage.overrideBase     — bool; false = inherit Part dims
 *   limas.label.storage.widthMm / heightMm / symbology / qr.eccLevel — used when override
 *   limas.label.storage.subtitleFields   — ordered array of field keys (0-3)
 *
 * Part and Storage each get their own tab (dimensions + subtitle lines +
 * live preview). Storage can share the Part dimensions via a checkbox, since
 * most setups print everything on one roll; the subtitle fields are always
 * per-entity because the two have different field vocabularies.
 */
Ext.define('Limas.Components.SystemPreferences.Preferences.LabelConfiguration', {
	extend: 'Limas.Components.Preferences.PreferenceEditor',

	subtitleLineCount: 3,

	initComponent: function () {
		// Dimensions are off-the-shelf label stock. Printer rolls (Brother /
		// Dymo / Zebra) use the vendor die-cut sizes; the A4 section lists
		// the common Avery template layouts by labels-per-sheet with their
		// published cell dimensions (see avery.eu / averyproducts.com
		// template catalogue — the L7xxx codes are the industry reference).
		// Section rows (disabled:true) are just visual separators.
		this.sizePresets = [
			{value: 'custom', label: i18n('Custom (enter dimensions)'), w: null, h: null},
			{value: 'sep-brother', label: '— Brother QL (die-cut) —', w: null, h: null, disabled: true},
			{value: 'dk11204', label: 'Brother DK-11204, 54x17mm', w: 54, h: 17},
			{value: 'dk11209', label: 'Brother DK-11209, 62x29mm', w: 62, h: 29},
			{value: 'dk11201', label: 'Brother DK-11201, 90x29mm', w: 90, h: 29},
			{value: 'dk11208', label: 'Brother DK-11208, 90x38mm', w: 90, h: 38},
			{value: 'dk11241', label: 'Brother DK-11241, 102x152mm', w: 102, h: 152},
			{value: 'sep-dymo', label: '— Dymo LabelWriter —', w: null, h: null, disabled: true},
			{value: 'dymo11353', label: 'Dymo 11353, 25x13mm', w: 25, h: 13},
			{value: 'dymo11352', label: 'Dymo 11352, 54x25mm', w: 54, h: 25},
			{value: 'dymo30252', label: 'Dymo 30252, 89x28mm', w: 89, h: 28},
			{value: 'dymo30334', label: 'Dymo 30334, 57x32mm', w: 57, h: 32},
			{value: 'sep-zebra', label: '— Zebra / generic thermal —', w: null, h: null, disabled: true},
			{value: 'z2551', label: 'Zebra 25x51mm', w: 51, h: 25},
			{value: 'z5732', label: 'Zebra 57x32mm', w: 57, h: 32},
			{value: 'z102152', label: 'Zebra 102x152mm (shipping)', w: 102, h: 152},
			{value: 'sep-a4-big', label: '— A4 sheet: few large labels —', w: null, h: null, disabled: true},
			{value: 'l7167', label: 'A4 1-up, 199x289mm (Avery L7167)', w: 199, h: 289},
			{value: 'l7168', label: 'A4 2-up, 199x143.5mm (Avery L7168)', w: 199, h: 143.5},
			{value: 'l7169', label: 'A4 4-up ~A6, 99.1x139mm (Avery L7169)', w: 99.1, h: 139},
			{value: 'l7166', label: 'A4 6-up, 99.1x93.1mm (Avery L7166)', w: 99.1, h: 93.1},
			{value: 'l7165', label: 'A4 8-up, 99.1x67.7mm (Avery L7165)', w: 99.1, h: 67.7},
			{value: 'sep-a4-mid', label: '— A4 sheet: medium labels —', w: null, h: null, disabled: true},
			{value: 'l7173', label: 'A4 10-up, 99.1x57mm (Avery L7173)', w: 99.1, h: 57},
			{value: 'l7164', label: 'A4 12-up, 63.5x72mm (Avery L7164)', w: 63.5, h: 72},
			{value: 'l7163', label: 'A4 14-up, 99.1x38.1mm (Avery L7163)', w: 99.1, h: 38.1},
			{value: 'l7162', label: 'A4 16-up, 99.1x33.9mm (Avery L7162)', w: 99.1, h: 33.9},
			{value: 'l7161', label: 'A4 18-up, 63.5x46.6mm (Avery L7161)', w: 63.5, h: 46.6},
			{value: 'sep-a4-small', label: '— A4 sheet: many small labels —', w: null, h: null, disabled: true},
			{value: 'l7160', label: 'A4 21-up, 63.5x38.1mm (Avery L7160)', w: 63.5, h: 38.1},
			{value: 'l7159', label: 'A4 24-up, 63.5x33.9mm (Avery L7159)', w: 63.5, h: 33.9},
			{value: 'l7654', label: 'A4 40-up, 45.7x25.4mm (Avery L7654)', w: 45.7, h: 25.4},
			{value: 'l7651', label: 'A4 65-up, 38.1x21.2mm (Avery L7651)', w: 38.1, h: 21.2},
			{value: 'l7656', label: 'A4 84-up, 46x11.1mm (Avery L7656)', w: 46, h: 11.1}
		];
		this.eccOptions = [
			{value: 'L', label: 'L (~7%)  — densest QR, least resilient'},
			{value: 'M', label: 'M (~15%) — balanced'},
			{value: 'Q', label: 'Q (~25%) — workshop-grade (recommended)'},
			{value: 'H', label: 'H (~30%) — max resilience, densest QR'}
		];
		this.symbologyOptions = [
			{value: 'qrcode', label: i18n('QR Code — ubiquitous, holds the deep-link URL')},
			{value: 'datamatrix', label: i18n('Data Matrix — tiny footprint (fixed ECC200)')},
			{value: 'aztec', label: i18n('Aztec — compact, no quiet zone (fixed ECC)')}
		];
		this.partFieldOptions = [
			{value: 'none', label: i18n('— (none) —')},
			{value: 'internalPartNumber', label: i18n('Internal Part Number')},
			{value: 'mpn', label: i18n('Manufacturer part number')},
			{value: 'manufacturer', label: i18n('Manufacturer name')},
			{value: 'category', label: i18n('Category name')},
			{value: 'categoryPath', label: i18n('Full category path')},
			{value: 'footprint', label: i18n('Footprint')},
			{value: 'description', label: i18n('Description')}
		];
		this.storageFieldOptions = [
			{value: 'none', label: i18n('— (none) —')},
			{value: 'category', label: i18n('Category name')},
			{value: 'categoryPath', label: i18n('Full category path')}
		];

		this.items = [
			{
				fieldLabel: i18n('QR base URL'),
				xtype: 'textfield',
				itemId: 'labelQrBaseUrl',
				emptyText: i18n('Auto-detect from request'),
				vtype: 'url'
			}, {
				xtype: 'tabpanel',
				itemId: 'labelTabs',
				height: 400,
				anchor: '100%',
				activeTab: 0,
				defaults: {
					bodyPadding: 10,
					layout: 'anchor',
					scrollable: true,
					defaults: {anchor: '100%', labelWidth: 130}
				},
				items: [
					{
						title: i18n('Part labels'),
						entityKind: 'part',
						items: this.buildTabItems('part')
					}, {
						title: i18n('Storage labels'),
						entityKind: 'storage',
						items: this.buildTabItems('storage')
					}
				],
				listeners: {
					tabchange: Ext.bind(function (tabpanel, newTab) {
						this.refreshPreview(newTab.entityKind);
					}, this)
				}
			}, {
				xtype: 'displayfield',
				hideLabel: true,
				value: '<i class="limas-text-muted">' + i18n('Tip: some browsers (esp. Firefox) force minimum print margins even with @page rules. If the printed label has extra whitespace, uncheck "Print headers and footers" and set margins to "None" in the browser print dialog.') + '</i>'
			}
		];

		this.previewTask = new Ext.util.DelayedTask(this.refreshPendingPreview, this);

		this.callParent(arguments);

		this.wireEvents();
		this.loadValues();

		this.on('afterrender', function () {
			this.refreshPreview('part');
		}, this, {single: true, delay: 100});
	},

	/**
	 * Full tab content for one entity: (optional same-as-Part toggle for
	 * storage) + dimension fields + subtitle line pickers + preview box
	 */
	buildTabItems: function (kind) {
		let items = [];

		if (kind === 'storage') {
			items.push({
				xtype: 'checkbox',
				itemId: 'storageSameAsPart',
				fieldLabel: i18n('Dimensions & QR'),
				boxLabel: i18n('Same as Part labels'),
				hideEmptyLabel: false
			});
		}

		// Dimension block (size preset + width + height + ecc)
		items.push({
			fieldLabel: i18n('Label size'),
			xtype: 'combobox',
			itemId: 'label_' + kind + '_size',
			editable: false,
			forceSelection: true,
			queryMode: 'local',
			valueField: 'value',
			displayField: 'label',
			store: {fields: ['value', 'label', 'w', 'h', 'disabled'], data: this.sizePresets},
			listeners: {
				select: Ext.bind(function (combo, record) {
					if (record.get('disabled')) {
						combo.setValue(this['_lastSize_' + kind] || 'custom');
						return;
					}
					this['_lastSize_' + kind] = record.get('value');
					let w = record.get('w'),
						h = record.get('h');
					if (w !== null) {
						this.down('#label_' + kind + '_width').setValue(w);
					}
					if (h !== null) {
						this.down('#label_' + kind + '_height').setValue(h);
					}
					this.applySizeLock(kind);
				}, this)
			}
		}, {
			fieldLabel: i18n('Label width (mm)'),
			xtype: 'numberfield',
			itemId: 'label_' + kind + '_width',
			minValue: 10,
			maxValue: 300,
			decimalPrecision: 1
		}, {
			fieldLabel: i18n('Label height (mm)'),
			xtype: 'numberfield',
			itemId: 'label_' + kind + '_height',
			minValue: 5,
			maxValue: 200,
			decimalPrecision: 1
		}, {
			fieldLabel: i18n('Barcode'),
			xtype: 'combobox',
			itemId: 'label_' + kind + '_symbology',
			editable: false,
			forceSelection: true,
			queryMode: 'local',
			valueField: 'value',
			displayField: 'label',
			store: {fields: ['value', 'label'], data: this.symbologyOptions}
		}, {
			fieldLabel: i18n('QR error correction'),
			xtype: 'combobox',
			itemId: 'label_' + kind + '_ecc',
			editable: false,
			forceSelection: true,
			queryMode: 'local',
			valueField: 'value',
			displayField: 'label',
			store: {fields: ['value', 'label'], data: this.eccOptions}
		});

		// Subtitle line pickers
		for (let i = 0; i < this.subtitleLineCount; i++) {
			items.push({
				fieldLabel: i18n('Subtitle line') + ' ' + (i + 1),
				xtype: 'combobox',
				itemId: 'label_' + kind + '_line' + i,
				editable: false,
				forceSelection: true,
				queryMode: 'local',
				valueField: 'value',
				displayField: 'label',
				value: 'none',
				store: {
					fields: ['value', 'label'],
					data: kind === 'part' ? this.partFieldOptions : this.storageFieldOptions
				}
			});
		}

		items.push({
			xtype: 'fieldcontainer',
			fieldLabel: i18n('Preview'),
			items: [{
				xtype: 'container',
				itemId: 'preview_' + kind,
				style: {
					background: 'repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 50% / 16px 16px',
					border: '1px solid #ccc',
					padding: '6px',
					display: 'inline-block',
					minHeight: '40px'
				},
				html: ''
			}]
		});

		return items;
	},

	wireEvents: function () {
		['part', 'storage'].forEach(function (kind) {
			let ids = ['_width', '_height', '_symbology', '_ecc'];
			for (let i = 0; i < this.subtitleLineCount; i++) {
				ids.push('_line' + i);
			}
			ids.forEach(function (suffix) {
				let field = this.down('#label_' + kind + suffix);
				if (field) {
					field.on('change', function () {
						this.schedulePreview(kind);
					}, this);
				}
			}, this);

			// ECC is a QR-only knob; Data Matrix uses a fixed ECC200, so grey it out when Data Matrix is picked
			this.down('#label_' + kind + '_symbology').on('change', function () {
				this.applyEccLock(kind);
			}, this);
		}, this);

		let sameAsPart = this.down('#storageSameAsPart');
		if (sameAsPart) {
			sameAsPart.on('change', function (cb, checked) {
				this.setStorageDimsVisible(!checked);
				if (checked) {
					this.copyPartDimsToStorage();
				}
				this.schedulePreview('storage');
			}, this);
		}
	},

	setStorageDimsVisible: function (visible) {
		['_size', '_width', '_height', '_symbology', '_ecc'].forEach(function (suffix) {
			let f = this.down('#label_storage' + suffix);
			if (f) {
				f.setVisible(visible);
			}
		}, this);
	},

	copyPartDimsToStorage: function () {
		this.down('#label_storage_size').setValue(this.down('#label_part_size').getValue());
		this.down('#label_storage_width').setValue(this.down('#label_part_width').getValue());
		this.down('#label_storage_height').setValue(this.down('#label_part_height').getValue());
		this.down('#label_storage_symbology').setValue(this.down('#label_part_symbology').getValue());
		this.down('#label_storage_ecc').setValue(this.down('#label_part_ecc').getValue());
	},

	/**
	 * ECC only applies to QR — Data Matrix (ECC200) and Aztec carry their own
	 * fixed correction, so disable the ECC combo (greyed, but its value is
	 * preserved for when the user switches back) for anything but QR
	 */
	applyEccLock: function (kind) {
		let isQr = this.down('#label_' + kind + '_symbology').getValue() === 'qrcode';
		this.down('#label_' + kind + '_ecc').setDisabled(!isQr);
	},

	loadValues: function () {
		let app = Limas.getApplication();
		this.down('#labelQrBaseUrl').setValue(app.getSystemPreference('limas.label.qrBaseUrl', ''));

		this.loadDims('part',
			app.getSystemPreference('limas.label.widthMm', 54),
			app.getSystemPreference('limas.label.heightMm', 17),
			app.getSystemPreference('limas.label.qr.eccLevel', 'Q'),
			app.getSystemPreference('limas.label.symbology', 'qrcode'));

		let override = app.getSystemPreference('limas.label.storage.overrideBase', false) === true;
		this.loadDims('storage',
			app.getSystemPreference('limas.label.storage.widthMm', this.down('#label_part_width').getValue()),
			app.getSystemPreference('limas.label.storage.heightMm', this.down('#label_part_height').getValue()),
			app.getSystemPreference('limas.label.storage.qr.eccLevel', this.down('#label_part_ecc').getValue()),
			app.getSystemPreference('limas.label.storage.symbology', this.down('#label_part_symbology').getValue()));
		this.down('#storageSameAsPart').setValue(!override);
		this.setStorageDimsVisible(override);

		this.applySubtitleFields('part',
			app.getSystemPreference('limas.label.part.subtitleFields', ['internalPartNumber']));
		this.applySubtitleFields('storage',
			app.getSystemPreference('limas.label.storage.subtitleFields', ['category']));
	},

	loadDims: function (kind, w, h, ecc, symbology) {
		this.down('#label_' + kind + '_width').setValue(w);
		this.down('#label_' + kind + '_height').setValue(h);
		this.down('#label_' + kind + '_symbology').setValue(symbology || 'qrcode');
		this.down('#label_' + kind + '_ecc').setValue(ecc);
		let match = this.sizePresets.find(function (p) {
			return p.w === w && p.h === h;
		});
		this['_lastSize_' + kind] = match ? match.value : 'custom';
		this.down('#label_' + kind + '_size').setValue(this['_lastSize_' + kind]);
		this.applySizeLock(kind);
		this.applyEccLock(kind);
	},

	/**
	 * Width / height are locked unless the size is 'Custom' — a named preset
	 * has fixed dimensions, so free-typing into the mm fields would desync
	 * them from the selected stock. setDisabled greys them out for a clear
	 * visual cue; getValue()/setValue() still work so the preset fills them
	 * and onSave reads them.
	 */
	applySizeLock: function (kind) {
		let isCustom = this.down('#label_' + kind + '_size').getValue() === 'custom';
		this.down('#label_' + kind + '_width').setDisabled(!isCustom);
		this.down('#label_' + kind + '_height').setDisabled(!isCustom);
	},

	applySubtitleFields: function (kind, fields) {
		if (!Ext.isArray(fields)) {
			fields = [];
		}
		for (let i = 0; i < this.subtitleLineCount; i++) {
			this.down('#label_' + kind + '_line' + i).setValue(fields[i] || 'none');
		}
	},

	collectSubtitleFields: function (kind) {
		let out = [];
		for (let i = 0; i < this.subtitleLineCount; i++) {
			let v = this.down('#label_' + kind + '_line' + i).getValue();
			if (v && v !== 'none') {
				out.push(v);
			}
		}
		return out;
	},

	activeEntityKind: function () {
		let tab = this.down('#labelTabs').getActiveTab();
		return tab ? tab.entityKind : 'part';
	},

	schedulePreview: function (kind) {
		this._pendingKind = kind || this.activeEntityKind();
		this.previewTask.delay(300);
	},
	refreshPendingPreview: function () {
		this.refreshPreview(this._pendingKind || this.activeEntityKind());
	},

	/**
	 * Effective dimensions for an entity: Storage inherits Part's when the "same as Part" box is ticked
	 */
	dimsFor: function (kind) {
		if (kind === 'storage' && this.down('#storageSameAsPart').getValue()) {
			kind = 'part';
		}
		return {
			w: this.down('#label_' + kind + '_width').getValue(),
			h: this.down('#label_' + kind + '_height').getValue(),
			ecc: this.down('#label_' + kind + '_ecc').getValue(),
			symbology: this.down('#label_' + kind + '_symbology').getValue()
		};
	},

	refreshPreview: function (kind) {
		kind = kind || 'part';
		let container = this.down('#preview_' + kind);
		if (!container || !container.rendered) {
			return;
		}
		let dims = this.dimsFor(kind);
		if (!dims.w || !dims.h) {
			return;
		}

		let subtitles = this.collectSubtitleFields(kind).map(this.sampleSubtitleFor, this);
		let params = {
			width: dims.w,
			height: dims.h,
			ecc: dims.ecc,
			symbology: dims.symbology,
			title: kind === 'part' ? 'Sample Part' : 'Drawer A3',
			subtitles: Ext.encode(subtitles)
		};

		let maxW = 280,
			maxH = 140,
			scale = Math.min(maxW / dims.w, maxH / dims.h),
			displayW = Math.round(dims.w * scale),
			displayH = Math.round(dims.h * scale);

		Ext.Ajax.request({
			url: Limas.getBasePath() + '/api/labels/preview',
			method: 'GET',
			params: params,
			headers: Limas.Auth.AuthenticationProvider.getAuthenticationProvider().getHeaders(),
			success: function (response) {
				let svg = response.responseText
					.replace(/width="[\d.]+mm"/, 'width="' + displayW + '"')
					.replace(/height="[\d.]+mm"/, 'height="' + displayH + '"');
				container.setHtml(svg);
			},
			failure: function () {
				container.setHtml('<i class="limas-text-error">' + i18n('Preview unavailable') + '</i>');
			}
		});
	},

	sampleSubtitleFor: function (field) {
		switch (field) {
			case 'internalPartNumber':
				return 'R-0805-10K';
			case 'mpn':
				return 'RC0805FR-0710KL';
			case 'manufacturer':
				return 'Yageo';
			case 'category':
				return 'Resistors';
			case 'categoryPath':
				return 'Passives ▸ Resistors ▸ Thick Film';
			case 'footprint':
				return '0805';
			case 'description':
				return '10kΩ 1% 0805 thick film';
			default:
				return '';
		}
	},

	onSave: function () {
		let app = Limas.getApplication();
		app.setSystemPreference('limas.label.qrBaseUrl', this.down('#labelQrBaseUrl').getValue());

		app.setSystemPreference('limas.label.widthMm', this.down('#label_part_width').getValue());
		app.setSystemPreference('limas.label.heightMm', this.down('#label_part_height').getValue());
		app.setSystemPreference('limas.label.symbology', this.down('#label_part_symbology').getValue());
		app.setSystemPreference('limas.label.qr.eccLevel', this.down('#label_part_ecc').getValue());

		let override = !this.down('#storageSameAsPart').getValue();
		app.setSystemPreference('limas.label.storage.overrideBase', override);
		app.setSystemPreference('limas.label.storage.widthMm', this.down('#label_storage_width').getValue());
		app.setSystemPreference('limas.label.storage.heightMm', this.down('#label_storage_height').getValue());
		app.setSystemPreference('limas.label.storage.symbology', this.down('#label_storage_symbology').getValue());
		app.setSystemPreference('limas.label.storage.qr.eccLevel', this.down('#label_storage_ecc').getValue());

		app.setSystemPreference('limas.label.part.subtitleFields', this.collectSubtitleFields('part'));
		app.setSystemPreference('limas.label.storage.subtitleFields', this.collectSubtitleFields('storage'));
	},
	statics: {
		iconCls: 'fugue-icon printer',
		title: i18n('Label Configuration'),
		menuPath: []
	}
});
