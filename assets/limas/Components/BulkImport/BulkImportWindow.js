/**
 * Bulk Import dialog — paste a CSV, map columns, watch the worker
 * progress against the aggregator
 *
 * Step 1 (local, no upload):
 *   - User drops a CSV file. FileReader reads it in-browser.
 *   - A small native JS parser produces a preview of the first 5 rows.
 *   - Auto-detect heuristics suggest header-yes/no and column → field
 *     mapping; user can override.
 *
 * Step 2 (POST):
 *   - User picks default Category + Storage (required) and confirms the
 *     mapping. The ORIGINAL file is uploaded multipart with a JSON
 *     `meta` body — backend re-parses with fgetcsv() for accuracy.
 *   - Returns jobId; FE polls /api/bulk-import-jobs/{id} every 2 s and
 *     renders per-row status (success / warning / skipped / ambiguous /
 *     failed) with links to created or existing Parts.
 *
 * Worker is NOT auto-started by the POST — operator runs
 *   php bin/console limas:bulk-import:run <jobId>
 * The dialog shows the command in a banner so they can copy-paste.
 */
Ext.define('Limas.Components.BulkImport.BulkImportWindow', {
	extend: 'Ext.window.Window',
	xtype: 'bulkImportWindow',
	requires: [
		'Ext.layout.container.Card',
		'Ext.form.field.ComboBox',
		'Ext.form.field.Checkbox',
		'Limas.CategoryComboBox',
		'Limas.Widgets.StorageLocationTreeComboBox'
	],

	width: 880,
	height: 640,
	resizable: true,
	layout: 'card',
	modal: true,
	title: i18n('Bulk Import (CSV)'),
	iconCls: 'fugue-icon documents-stack',

	// FE-local state populated in step 1, sent to backend in step 2.
	parsedRows: null, // string[][]  — full parse, sent verbatim back as the uploaded file
	parsedFile: null, // File object — the original; multipart-uploaded on submit
	previewRowCount: 5,
	autoMapping: null, // {mpn, manufacturer?, category?, storage?}  — auto-detected column indexes

	jobId: null,
	pollTimer: null,

	statics: {
		iconCls: 'fugue-icon documents-stack',
		title: i18n('Bulk Import'),
		closable: true,
		// Top-level menu entry: System ➤ Bulk Import. Keeps it visible
		// next to other operator-facing actions (User Preferences, Logout, …).
		menuPath: [{text: i18n('System')}]
	},

	initComponent: function () {
		this.items = [
			this.buildStepMapping(),
			this.buildStepReview(),
			this.buildStepProgress()
		];
		this.callParent(arguments);
		this.loadProjects();
	},

	// ──────────────────────────── STEP 1 ────────────────────────────

	buildStepMapping: function () {
		let me = this;

		this.dropArea = Ext.create('Ext.Component', {
			height: 80,
			html: '<div class="limas-dropzone">' +
				'<b>' + i18n('Drop CSV file here') + '</b><br>' +
				'<span style="font-size:11px;">' + i18n('or click to pick — handled locally, nothing uploaded yet') + '</span>' +
				'</div>',
			listeners: {
				render: function (cmp) {
					let el = cmp.getEl().dom;
					let zone = el.querySelector('.limas-dropzone') || el;
					el.addEventListener('click', () => me.fileInput.click());
					el.addEventListener('dragover', (e) => {
						e.preventDefault();
						zone.classList.add('limas-dropzone-hover');
					});
					el.addEventListener('dragleave', () => {
						zone.classList.remove('limas-dropzone-hover');
					});
					el.addEventListener('drop', function (e) {
						e.preventDefault();
						zone.classList.remove('limas-dropzone-hover');
						if (e.dataTransfer.files.length > 0) me.onFilePicked(e.dataTransfer.files[0]);
					});
				}
			}
		});
		// Hidden file input — clicking the drop area triggers it.
		// Use the raw DOM node directly (Ext.fly returns a Fly singleton
		// that doesn't accept addListener; reusable wrapper is the wrong
		// abstraction for a single component-scoped input).
		this.fileInput = document.createElement('input');
		this.fileInput.type = 'file';
		this.fileInput.accept = '.csv,text/csv';
		this.fileInput.style.display = 'none';
		document.body.appendChild(this.fileInput);
		this.fileInput.addEventListener('change', () => {
			if (this.fileInput.files.length > 0) this.onFilePicked(this.fileInput.files[0]);
		});

		// Preview is just a static 5×N text matrix — render with a
		// plain HTML table inside an Ext.panel to dodge the layout
		// drama that grid+store+reconfigure triggered. No interaction
		// needed: this is purely visual confirmation for the operator
		// before they commit the mapping.
		this.previewPanel = Ext.create('Ext.panel.Panel', {
			title: i18n('Preview (first 5 rows)'),
			height: 180,
			autoScroll: true,
			bodyPadding: 8,
			html: '<i class="limas-text-muted">' + i18n('Drop a CSV above to preview it here.') + '</i>'
		});

		this.hasHeaderCheckbox = Ext.create('Ext.form.field.Checkbox', {
			boxLabel: i18n('First row is a header'),
			checked: true,
			listeners: {change: () => me.refreshPreview()}
		});

		this.mpnColumn = this.buildColumnCombo('MPN', false);
		this.lcscColumn = this.buildColumnCombo('LCSC', false);
		this.designatorColumn = this.buildColumnCombo('Designator', false);
		this.commentColumn = this.buildColumnCombo('Comment', false);
		this.footprintColumn = this.buildColumnCombo('Footprint', false);
		this.mfrColumn = this.buildColumnCombo('Manufacturer', false);
		this.catColumn = this.buildColumnCombo('Category', false);
		this.stoColumn = this.buildColumnCombo('Storage', false);
		this.qtyColumn = this.buildColumnCombo('Quantity', false);
		this.qtyColumn.setFieldLabel(i18n('Stock quantity (Update stock only)'));
		this.projectModeCombo = Ext.create('Ext.form.field.ComboBox', {
			fieldLabel: i18n('Project'), labelWidth: 140, editable: false,
			value: 'inventory', queryMode: 'local', displayField: 'label', valueField: 'value',
			store: {fields: ['value', 'label'], data: [
				{value: 'inventory', label: i18n('No project')},
				{value: 'existing', label: i18n('Existing project')},
				{value: 'new', label: i18n('New project')}
			]}, listeners: {change: () => me.refreshSubmitButton()}
		});
		this.projectCombo = Ext.create('Ext.form.field.ComboBox', {
			fieldLabel: i18n('Existing project'), labelWidth: 140, queryMode: 'local',
			displayField: 'name', valueField: 'id', forceSelection: true,
			store: {fields: ['id', 'name'], data: []},
			listeners: {change: () => me.refreshSubmitButton()}
		});
		this.projectNameField = Ext.create('Ext.form.field.Text', {
			fieldLabel: i18n('New project name'), labelWidth: 140,
			listeners: {change: () => me.refreshSubmitButton()}
		});
		this.bomQuantityCheckbox = Ext.create('Ext.form.field.Checkbox', {
			boxLabel: i18n('Use CSV quantity for project BOM'),
			checked: true,
			listeners: {change: () => me.refreshSubmitButton()}
		});
		this.stockQuantityCheckbox = Ext.create('Ext.form.field.Checkbox', {
			boxLabel: i18n('Add CSV quantity to inventory stock'),
			checked: false,
			listeners: {change: () => me.refreshSubmitButton()}
		});
		this.projectQuantityOptions = Ext.create('Ext.container.Container', {
			hidden: true,
			layout: 'vbox',
			items: [this.bomQuantityCheckbox, this.stockQuantityCheckbox,
				{xtype: 'component', html: '<small>' + i18n('If BOM quantity is off, a new project item starts at 1; existing BOM quantity stays unchanged.') + '</small>'}]
		});

		// Duplicates strategy — what to do when an inbound row's
		// (manufacturer, MPN) already exists in the local inventory.
		// Skip is the safe default. UpdateStock additionally requires
		// the Quantity column mapping above.
		this.duplicatesCombo = Ext.create('Ext.form.field.ComboBox', {
			fieldLabel: i18n('On duplicate'),
			labelWidth: 140,
			editable: false,
			value: 'skip',
			store: {
				fields: ['value', 'label'],
				data: [
					{value: 'skip', label: i18n('Skip — leave existing Part untouched (default)')},
					{value: 'create_anyway', label: i18n('Create anyway — new Part record (different supplier/batch)')},
					{value: 'update_stock', label: i18n('Update stock — add Quantity to existing, create+seed new')}
				]
			},
			displayField: 'label',
			valueField: 'value',
			queryMode: 'local'
		});

		// Both pickers are tree-style. Category uses the existing
		// CategoryComboBox (PartCategory is a real tree). Storage uses
		// the new StorageLocationTreeComboBox: StorageLocationCategory
		// nodes as folders, StorageLocation entries injected as leaves —
		// the (category + location) pair lives in a single field.
		// `select` (not `change`) because the TreePicker override at
		// ExtJS/Enhancements/Ext.ux.TreePicker-setValueWithObject.js
		// replaces setValue() without callParent — the parent's change-
		// firing chain never runs. The override does fire `select` from
		// selectItem(), which is what tree click-to-pick goes through.
		this.defaultCategoryCombo = Ext.create('Limas.CategoryComboBox', {
			fieldLabel: i18n('Default Category'),
			labelWidth: 140,
			allowBlank: false,
			displayField: 'name',
			emptyText: i18n('Pick category for unmapped rows'),
			listeners: {select: () => me.refreshSubmitButton()}
		});
		this.defaultStorageCombo = Ext.create('Limas.Widgets.StorageLocationTreeComboBox', {
			fieldLabel: i18n('Default Storage'),
			labelWidth: 140,
			allowBlank: false,
			emptyText: i18n('Pick storage for unmapped rows'),
			listeners: {select: () => me.refreshSubmitButton()}
		});

		this.submitButton = Ext.create('Ext.button.Button', {
			text: i18n('Review parts'),
			iconCls: 'fugue-icon arrow-circle-225',
			disabled: true,
			handler: () => me.onReview()
		});

		// Progressive disclosure: only the drop area is visible at
		// start. Once a valid CSV lands and parses cleanly, we reveal
		// the preview + mapping + defaults sections via
		// `postDropContainer.show()`. Keeps the empty state from
		// looking like a half-broken form.
		this.postDropContainer = Ext.create('Ext.container.Container', {
			layout: 'vbox',
			defaults: {anchor: '100%'},
			hidden: true,
			items: [
				{xtype: 'tbtext', html: '<b>' + i18n('Step 1 of 3 — map the CSV columns') + '</b>', margin: '8 0'},
				this.previewPanel,
				{
					// Side-by-side: column mapping (the long stack) on the
					// left, defaults + duplicates strategy on the right.
					// Keeps the dialog readable without scrolling on a
					// typical laptop screen.
					xtype: 'container',
					layout: 'hbox',
					items: [
						{
							xtype: 'fieldset',
							title: i18n('Column mapping'),
							layout: 'vbox',
							flex: 1,
							margin: '0 8 0 0',
							defaults: {anchor: '100%', labelWidth: 140},
							items: [
								this.hasHeaderCheckbox,
								this.mpnColumn, this.lcscColumn, this.mfrColumn, this.catColumn, this.stoColumn,
								this.qtyColumn, this.designatorColumn, this.commentColumn, this.footprintColumn
							]
						},
						{
							xtype: 'container',
							layout: 'vbox',
							flex: 1,
							defaults: {anchor: '100%'},
							items: [
								{
									xtype: 'fieldset',
									title: i18n('Defaults for unmapped / unresolvable rows'),
									layout: 'vbox',
									defaults: {anchor: '100%'},
									items: [this.defaultCategoryCombo, this.defaultStorageCombo]
								},
								{
									xtype: 'fieldset',
									title: i18n('Project (optional)'),
									layout: 'vbox',
									defaults: {anchor: '100%'},
									items: [this.projectModeCombo, this.projectCombo, this.projectNameField, this.projectQuantityOptions]
								},
								{
									// Job-level decision — not a default for
									// fallback rows but the strategy applied
									// to every existing-Part match.
									xtype: 'fieldset',
									title: i18n('Duplicates strategy'),
									layout: 'vbox',
									defaults: {anchor: '100%'},
									items: [this.duplicatesCombo]
								}
							]
						}
					]
				}
			]
		});

		return Ext.create('Ext.panel.Panel', {
			itemId: 'step-mapping',
			layout: 'vbox',
			defaults: {anchor: '100%'},
			bodyPadding: 12,
			// Window has a fixed initial height; the fieldsets stack
			// vertically and the bottom one ("Duplicates strategy" /
			// Start Import) would clip on smaller monitors without an
			// inner scroll. Bottom toolbar stays docked so the action
			// button is always reachable.
			autoScroll: true,
			items: [this.dropArea, this.postDropContainer],
			dockedItems: [{
				xtype: 'toolbar',
				dock: 'bottom',
				items: ['->', this.submitButton]
			}]
		});
	},

	buildColumnCombo: function (labelKey, required) {
		return Ext.create('Ext.form.field.ComboBox', {
			fieldLabel: i18n(labelKey),
			labelWidth: 140,
			allowBlank: !required,
			displayField: 'label',
			valueField: 'idx',
			store: {fields: ['idx', 'label'], data: []},
			queryMode: 'local',
			emptyText: required ? i18n('(required)') : i18n('(optional)'),
			listeners: {change: () => this.refreshSubmitButton()}
		});
	},

	onFilePicked: function (file) {
		// Sanity check before we read any bytes. Strict on extension —
		// many file types have empty MIME so a permissive check would
		// let .ini / .json / .yaml / etc. through and produce nonsense
		// rows that confuse the grid layout.
		let name = String(file.name || '').toLowerCase();
		if (!/\.(csv|tsv|txt)$/.test(name)) {
			Ext.toast({
				html: i18n('Not a CSV — expected .csv / .tsv / .txt, got ') + Ext.htmlEncode(file.name || '?'),
				align: 't',
				autoCloseDelay: 4000
			});
			return;
		}
		// Guard against absurdly large files — 50 MB CSV is already
		// ~500k rows, far beyond what this UI can preview or what the
		// worker should chew through in one job.
		if (file.size > 50 * 1024 * 1024) {
			Ext.toast({
				html: i18n('File too large (max 50 MB).'),
				align: 't',
				autoCloseDelay: 4000
			});
			return;
		}
		this.parsedFile = file;
		let reader = new FileReader();
		reader.onload = (ev) => {
			let text = ev.target.result;
			this.csvDelimiter = this.detectCsvDelimiter(text);
			this.parsedRows = this.parseCsv(text);
			if (this.parsedRows.length === 0) {
				Ext.toast({
					html: i18n('CSV looked empty after parsing. Wrong delimiter?'),
					align: 't',
					autoCloseDelay: 4000
				});
				return;
			}
			this.populateColumnCombos();
			this.guessMapping();
			this.refreshPreview();
			this.refreshSubmitButton();
			// Reveal the post-drop sections (preview + mapping + defaults) now that we have parseable content to populate
			this.postDropContainer.show();
		};
		reader.onerror = () => {
			Ext.toast({html: i18n('Could not read the file (not text?).'), align: 't', autoCloseDelay: 4000});
		};
		reader.readAsText(file, 'UTF-8');
	},

	// Tiny JS CSV parser — handles comma/semicolon/tab + quoted fields
	// well enough for preview. Backend re-parses with PHP fgetcsv for
	// the real import.
	parseCsv: function (text) {
		// Strip BOM
		if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
		// Detect delimiter from first line
		let firstNL = text.indexOf('\n');
		let head = firstNL >= 0 ? text.slice(0, firstNL) : text;
		let delim = ',';
		let best = head.split(',').length;
		[';', '\t', '|'].forEach(d => {
			let c = head.split(d).length;
			if (c > best) {
				best = c;
				delim = d;
			}
		});
		let rows = [], row = [], cell = '', inQuote = false;
		for (let i = 0; i < text.length; i++) {
			let c = text.charAt(i);
			if (inQuote) {
				if (c === '"') {
					if (text.charAt(i + 1) === '"') {
						cell += '"';
						i++;
					} else inQuote = false;
				} else cell += c;
			} else {
				if (c === '"') inQuote = true;
				else if (c === delim) {
					row.push(cell.trim());
					cell = '';
				} else if (c === '\n') {
					row.push(cell.trim());
					rows.push(row);
					row = [];
					cell = '';
				} else if (c === '\r') { /* skip */
				} else cell += c;
			}
		}
		if (cell !== '' || row.length > 0) {
			row.push(cell.trim());
			rows.push(row);
		}
		return rows.filter(r => r.length > 0 && !(r.length === 1 && r[0] === ''));
	},

	detectCsvDelimiter: function (text) {
		let head = text.split('\n', 1)[0];
		let delimiter = ',';
		let most = head.split(',').length;
		[';', '\t', '|'].forEach(function (candidate) {
			let count = head.split(candidate).length;
			if (count > most) { most = count; delimiter = candidate; }
		});
		return delimiter;
	},

	populateColumnCombos: function () {
		if (!this.parsedRows || this.parsedRows.length === 0) return;
		let header = this.parsedRows[0];
		let combos = [this.mpnColumn, this.lcscColumn, this.mfrColumn, this.catColumn, this.stoColumn,
			this.qtyColumn, this.designatorColumn, this.commentColumn, this.footprintColumn];
		let data = header.map((h, i) => ({idx: i, label: 'Col ' + (i + 1) + (h ? ' (' + h + ')' : '')}));
		combos.forEach(c => c.getStore().loadData(data));
	},

	guessMapping: function () {
		if (!this.parsedRows || this.parsedRows.length === 0) return;
		let header = this.parsedRows[0].map(c => String(c).toLowerCase());
		let find = (...keys) => {
			for (let i = 0; i < header.length; i++) {
				for (let k of keys) {
					if (header[i].indexOf(k) >= 0) return i;
				}
			}
			return null;
		};
		let mpn = find('mpn', 'part number', 'part_number', 'partno', 'part no', 'product code');
		let lcsc = find('lcsc');
		let designator = find('designator', 'reference');
		let comment = find('comment', 'value');
		let footprint = find('footprint');
		let mfr = find('manufacturer', 'mfr', 'brand', 'maker', 'vyrobca');
		let cat = find('category', 'kategoria', 'cat');
		let sto = find('storage', 'location', 'sklad', 'shelf');
		let qty = find('quantity', 'qty', 'mnozstvo', 'count', 'pcs', 'ks');
		if (mpn !== null) this.mpnColumn.setValue(mpn);
		if (lcsc !== null) this.lcscColumn.setValue(lcsc);
		if (designator !== null) this.designatorColumn.setValue(designator);
		if (comment !== null) this.commentColumn.setValue(comment);
		if (footprint !== null) this.footprintColumn.setValue(footprint);
		if (mfr !== null) this.mfrColumn.setValue(mfr);
		if (cat !== null) this.catColumn.setValue(cat);
		if (sto !== null) this.stoColumn.setValue(sto);
		if (qty !== null) this.qtyColumn.setValue(qty);
	},

	refreshPreview: function () {
		if (!this.parsedRows || this.parsedRows.length === 0) {
			this.previewPanel.update('<i class="limas-text-muted">' + i18n('(no rows parsed)') + '</i>');
			return;
		}
		let hasHeader = this.hasHeaderCheckbox.getValue();
		let allRows = this.parsedRows.slice();
		let headerRow = hasHeader ? allRows.shift() : null;
		let cols = Math.min(8, this.parsedRows[0].length);
		let previewRows = allRows.slice(0, this.previewRowCount);

		let html = '<table class="limas-grid-table">';
		// header
		html += '<tr><th>#</th>';
		for (let i = 0; i < cols; i++) {
			let label = headerRow ? (headerRow[i] || '(col ' + (i + 1) + ')') : ('Col ' + (i + 1));
			html += '<th>' + Ext.htmlEncode(label) + '</th>';
		}
		html += '</tr>';
		// body
		previewRows.forEach((r, idx) => {
			html += '<tr><td class="limas-text-muted">' + (idx + 1) + '</td>';
			for (let j = 0; j < cols; j++) {
				html += '<td class="limas-grid-cell-truncate" title="' + Ext.htmlEncode(r[j] || '') + '">' + Ext.htmlEncode(r[j] || '') + '</td>';
			}
			html += '</tr>';
		});
		html += '</table>';
		this.previewPanel.update(html);
	},

	refreshSubmitButton: function () {
		let mode = this.projectModeCombo.getValue();
		let projectMode = mode !== 'inventory';
		let needsProjectQuantity = projectMode && (this.bomQuantityCheckbox.getValue() || this.stockQuantityCheckbox.getValue());
		let projectReady = mode === 'inventory'
			|| (mode === 'existing' && !!this.projectCombo.getValue())
			|| (mode === 'new' && !!String(this.projectNameField.getValue() || '').trim());
		let ok = this.parsedFile !== null
			&& (this.mpnColumn.getValue() !== null || this.lcscColumn.getValue() !== null)
			&& (!projectMode || (this.lcscColumn.getValue() !== null && (!needsProjectQuantity || this.qtyColumn.getValue() !== null)))
			&& projectReady
			&& this.extractIri(this.defaultCategoryCombo.getValue()) !== null
			&& this.extractIri(this.defaultStorageCombo.getValue()) !== null;
		this.submitButton.setDisabled(!ok);
		this.qtyColumn.setFieldLabel(projectMode ? i18n('CSV quantity') : i18n('Stock quantity (Update stock only)'));
		this.projectCombo.setVisible(mode === 'existing');
		this.projectNameField.setVisible(mode === 'new');
		this.projectQuantityOptions.setVisible(projectMode);
		this.duplicatesCombo.setDisabled(mode !== 'inventory');
	},

	loadProjects: function () {
		Ext.Ajax.request({
			url: Limas.getBasePath() + '/api/projects?itemsPerPage=1000', method: 'GET',
			headers: Limas.Auth.AuthenticationProvider.getAuthenticationProvider().getHeaders(),
			success: function (response) {
				let body = Ext.decode(response.responseText);
				let rows = body['hydra:member'] || body.member || [];
				this.projectCombo.getStore().loadData(rows.map(r => ({id: this.iriId(r['@id']), name: r.name})));
			}, scope: this
		});
	},

	// CategoryComboBox / StorageLocationPicker return the Ext model
	// record on getValue(); other combos may already return the IRI
	// string. Flatten both shapes to the IRI string (or null).
	extractIri: function (v) {
		if (v === null || v === undefined || v === '') return null;
		if (typeof v === 'string') return v;
		if (v && typeof v.get === 'function') return v.get('@id') || null;
		return null;
	},

	buildStepReview: function () {
		let safe = value => Ext.htmlEncode(String(value || ''));
		this.reviewStore = Ext.create('Ext.data.Store', {
			fields: ['rawIndex', 'line', 'mpn', 'lcsc', 'manufacturer', 'quantity', 'designator', 'footprint', 'comment', 'inventoryStatus', 'projectStatus', 'matches'],
			data: []
		});
		this.reviewProjectColumn = Ext.create('Ext.grid.column.Column', {
			text: i18n('Selected project'), dataIndex: 'projectStatus', width: 155, hidden: true,
			renderer: value => this.renderReviewStatus(value, 'project')
		});
		this.reviewGrid = Ext.create('Ext.grid.Panel', {
			flex: 1,
			store: this.reviewStore,
			selModel: {selType: 'checkboxmodel', mode: 'MULTI', showHeaderCheckbox: true},
			viewConfig: {enableTextSelection: true},
			columns: [
				{text: '#', dataIndex: 'line', width: 55},
				{text: 'MPN', dataIndex: 'mpn', flex: 2, renderer: safe},
				{text: 'LCSC', dataIndex: 'lcsc', flex: 1, renderer: safe},
				{text: i18n('Inventory'), dataIndex: 'inventoryStatus', width: 175,
					renderer: (value, meta, record) => this.renderReviewStatus(value, 'inventory', record)},
				this.reviewProjectColumn,
				{text: i18n('Manufacturer'), dataIndex: 'manufacturer', flex: 1, renderer: safe},
				{text: i18n('Quantity'), dataIndex: 'quantity', width: 90, renderer: safe},
				{text: i18n('Designator'), dataIndex: 'designator', flex: 1, renderer: safe},
				{text: i18n('Footprint'), dataIndex: 'footprint', flex: 1, renderer: safe},
				{text: i18n('Comment'), dataIndex: 'comment', flex: 2, renderer: safe}
			]
		});
		this.reviewCount = Ext.create('Ext.toolbar.TextItem', {text: ''});
		this.reviewStartButton = Ext.create('Ext.button.Button', {
			text: i18n('Start Import'), iconCls: 'fugue-icon arrow-circle-225',
			handler: () => this.onSubmit()
		});
		this.reviewGrid.getSelectionModel().on('selectionchange', this.refreshReviewCount, this);
		return Ext.create('Ext.panel.Panel', {
			itemId: 'step-review', layout: 'vbox', bodyPadding: 12,
			defaults: {width: '100%'},
			items: [
				{xtype: 'component', html: '<b>' + i18n('Step 2 of 3 — select parts to import') + '</b>', margin: '0 0 8 0'},
				this.reviewGrid
			],
			dockedItems: [{xtype: 'toolbar', dock: 'bottom', items: [
				{text: i18n('Back'), handler: () => this.getLayout().setActiveItem('step-mapping')},
				'->', this.reviewCount, this.reviewStartButton
			]}]
		});
	},

	renderReviewStatus: function (status, kind, record) {
		let labels = kind === 'project' ? {
			checking: 'Checking…', in: 'Already in project', not_in: 'Not in project',
			new: 'New part', multiple: 'Multiple matches', error: 'Check failed'
		} : {
			checking: 'Checking…', existing: 'In inventory', new: 'New to inventory',
			multiple: 'Multiple matches', error: 'Check failed'
		};
		let colors = {
			in: '#d5f2df', existing: '#d5f2df', not_in: '#e4efff', new: '#e4efff',
			multiple: '#fff0c7', error: '#ffe4e4', checking: '#eeeeee'
		};
		let matches = record && record.get ? record.get('matches') || [] : [];
		let suffix = kind === 'inventory' && status === 'existing' && matches.length === 1 ? ' · #' + matches[0].id : '';
		let title = matches.map(match => '#' + match.id + ' ' + match.name).join('; ');
		return '<span title="' + Ext.htmlEncode(title) + '" style="display:inline-block;padding:2px 6px;border-radius:4px;background:' +
			(colors[status] || colors.checking) + '">' + Ext.htmlEncode(i18n(labels[status] || labels.checking) + suffix) + '</span>';
	},

	onReview: function () {
		if (!this.parsedRows || !this.parsedRows.length) return;
		let columns = {
			mpn: this.mpnColumn.getValue(), lcsc: this.lcscColumn.getValue(),
			manufacturer: this.mfrColumn.getValue(), quantity: this.qtyColumn.getValue(),
			designator: this.designatorColumn.getValue(), footprint: this.footprintColumn.getValue(),
			comment: this.commentColumn.getValue()
		};
		let start = this.hasHeaderCheckbox.getValue() ? 1 : 0;
		let rows = this.parsedRows.slice(start).map(function (row, index) {
			let item = {rawIndex: start + index, line: start + index + 1,
				inventoryStatus: 'checking', projectStatus: 'checking', matches: []};
			Object.keys(columns).forEach(function (field) {
				item[field] = columns[field] === null ? '' : (row[columns[field]] || '');
			});
			return item;
		});
		this.reviewStore.loadData(rows);
		let projectId = this.projectModeCombo.getValue() === 'existing' ? Number(this.projectCombo.getValue()) : null;
		this.reviewProjectColumn.setHidden(!projectId);
		this.reviewGrid.getSelectionModel().selectAll();
		this.refreshReviewCount();
		this.getLayout().setActiveItem('step-review');
		this.lookupReviewRows(rows, projectId);
	},

	lookupReviewRows: function (rows, projectId) {
		let generation = this.reviewLookupGeneration = (this.reviewLookupGeneration || 0) + 1;
		this.reviewLookupPending = Math.ceil(rows.length / 250);
		this.refreshReviewCount();
		for (let start = 0; start < rows.length; start += 250) {
			let chunk = rows.slice(start, start + 250);
			let finish = (results) => {
				if (generation !== this.reviewLookupGeneration) return;
				chunk.forEach((row, index) => {
					let record = this.reviewStore.getAt(start + index);
					if (!record) return;
					let result = results && results[index];
					record.set({
						inventoryStatus: result ? result.status : 'error',
						projectStatus: result ? result.projectStatus : 'error',
						matches: result ? result.matches : []
					});
				});
				this.reviewLookupPending--;
				this.refreshReviewCount();
			};
			Ext.Ajax.request({
				url: Limas.getBasePath() + '/api/bulk-import/lookup',
				method: 'POST',
				jsonData: {
					rows: chunk.map(row => ({mpn: row.mpn, manufacturer: row.manufacturer, lcsc: row.lcsc})),
					projectId: projectId || null
				},
				headers: Limas.Auth.AuthenticationProvider.getAuthenticationProvider().getHeaders(),
				success: response => {
					try { finish(Ext.decode(response.responseText).results); }
					catch (error) { finish(null); }
				},
				failure: () => finish(null)
			});
		}
	},

	refreshReviewCount: function () {
		let selected = this.reviewGrid.getSelectionModel().getSelection().length;
		this.reviewCount.setText(selected + ' / ' + this.reviewStore.getCount() + ' ' + i18n('selected'));
		this.reviewStartButton.setDisabled(selected === 0 || this.reviewLookupPending > 0);
	},

	selectedCsvFile: function () {
		let selection = this.reviewGrid.getSelectionModel().getSelection();
		let indexes = selection.map(function (record) { return record.get('rawIndex'); }).sort(function (a, b) { return a - b; });
		let rows = indexes.map(function (index) { return this.parsedRows[index]; }, this);
		if (this.hasHeaderCheckbox.getValue()) rows.unshift(this.parsedRows[0]);
		let delimiter = this.csvDelimiter || ',';
		let text = rows.map(function (row) {
			return row.map(function (value) {
				let cell = String(value === null || value === undefined ? '' : value);
				return cell.includes(delimiter) || /["\r\n]/.test(cell)
					? '"' + cell.replace(/"/g, '""') + '"' : cell;
			}).join(delimiter);
		}).join('\r\n') + '\r\n';
		return new Blob([text], {type: 'text/csv;charset=utf-8'});
	},

	// ──────────────────────────── STEP 2 ────────────────────────────

	// Step 2 deliberately uses plain Ext.panel.Panel + setHtml for the
	// status banner / worker hint / progress table. The earlier grid
	// approach (Ext.grid.Panel + store.loadData) consistently triggered
	// "Layout run failed" — same gotcha that bit the step 1 preview.
	// Static panels with HTML bodies render cleanly inside the card
	// layout and we don't need interaction (sortable columns, etc) on
	// progress rows anyway.
	buildStepProgress: function () {
		// No worker-instructions hint here any more — the Bulk Import menu
		// entry is gated on `messenger.workers.async.alive` in Limas.js, so
		// reaching this step implies a worker is consuming the queue. The
		// status banner gets the first poll's "Status: running — X / Y"
		// within ~2 s of submit.
		this.statusPanel = Ext.create('Ext.panel.Panel', {
			border: false,
			bodyStyle: 'background: transparent;',
			margin: '0 0 8 0',
			html: '<i>' + i18n('Submitting job…') + '</i>'
		});
		this.progressBodyPanel = Ext.create('Ext.panel.Panel', {
			flex: 1,
			border: true,
			autoScroll: true,
			bodyPadding: 8,
			html: '<i class="limas-text-muted">' + i18n('Waiting for status…') + '</i>'
		});
		this.resolveButton = Ext.create('Ext.button.Button', {
			text: i18n('Apply conflict decisions'), hidden: true,
			handler: () => this.submitDecisions()
		});

		return Ext.create('Ext.panel.Panel', {
			itemId: 'step-progress',
			layout: 'vbox',
			defaults: {width: '100%'},
			bodyPadding: 12,
			items: [this.statusPanel, this.progressBodyPanel],
			dockedItems: [{xtype: 'toolbar', dock: 'bottom', items: ['->', this.resolveButton]}]
		});
	},

	renderProgressRows: function (items) {
		if (!items || items.length === 0) {
			return '<i class="limas-text-muted">' + i18n('No rows yet.') + '</i>';
		}
		let labels = {
			pending: i18n('Pending'),
			success: '✅ ' + i18n('OK'),
			warning: '⚠ ' + i18n('Warn'),
			skipped: '⊘ ' + i18n('Skipped'),
			ambiguous: '? ' + i18n('Ambiguous'),
			failed: '✗ ' + i18n('Failed')
			,conflict: '? ' + i18n('Decision needed')
		};
		let html = '<table class="limas-grid-table" style="width:100%;">';
		let projectMode = this.projectModeCombo.getValue() !== 'inventory';
		html += '<tr>'
			+ '<th style="width:40px;">#</th>'
			+ '<th>' + i18n('MPN / LCSC') + '</th>'
			+ '<th>' + i18n('Manufacturer') + '</th>'
			+ (projectMode ? '<th style="width:60px;">' + i18n('BOM qty') + '</th>' : '')
			+ '<th style="width:60px;">' + i18n('Stock qty') + '</th>'
			+ '<th style="width:110px;">' + i18n('Status') + '</th>'
			+ '<th>' + i18n('Result') + '</th>'
			+ '</tr>';
		items.forEach(function (r) {
			let status = labels[r.status] ? r.status : 'pending';
			let pill = '<span class="limas-status limas-status-' + status + '">' + labels[status] + '</span>';
			// Link to created/existing Part + the worker's free-text message
			// (which carries the "+N stock" detail or warning context). Both
			// kept side-by-side so the operator gets the link AND the why.
			let lines = [];
			if (r.partId) {
				lines.push(i18n('Part') + ' #' + r.partId + ' ' + Ext.htmlEncode(r.partName || ''));
			}
			if (r.existingPartId && r.existingPartId !== r.partId) {
				lines.push(i18n('Existing') + ' #' + r.existingPartId + ' ' + Ext.htmlEncode(r.existingPartName || ''));
			}
			if (r.errorMessage) {
				lines.push('<span class="limas-text-muted">' + Ext.htmlEncode(r.errorMessage) + '</span>');
			}
			if (r.status === 'conflict') {
				lines.push('<select class="limas-project-decision" data-item-id="' + Number(r.id) + '">'
					+ '<option value="keep">' + i18n('Keep current') + '</option>'
					+ '<option value="replace">' + i18n('Replace') + '</option>'
					+ '<option value="add">' + i18n('Add quantity') + '</option></select>');
			}
			let qtyCell = '';
			if (r.quantityApplied !== null && r.quantityApplied !== undefined) {
				qtyCell = '<span class="limas-text-success">+' + r.quantityApplied + '</span>';
			}
			let bomCell = projectMode && this.bomQuantityCheckbox.getValue() && r.rawQuantity
				? Ext.htmlEncode(r.rawQuantity) : '—';
			html += '<tr>'
				+ '<td class="limas-text-muted">' + (r.line || '') + '</td>'
			+ '<td>' + Ext.htmlEncode(r.lcsc || r.mpn || '') + '</td>'
				+ '<td>' + Ext.htmlEncode(r.manufacturer || '') + '</td>'
				+ (projectMode ? '<td style="text-align:right;">' + bomCell + '</td>' : '')
				+ '<td style="text-align:right;">' + (qtyCell || '—') + '</td>'
				+ '<td>' + pill + '</td>'
				+ '<td>' + (lines.join('<br>') || '—') + '</td>'
				+ '</tr>';
		}, this);
		html += '</table>';
		return html;
	},

	onSubmit: function () {
		if (this.reviewGrid && this.reviewGrid.getSelectionModel().getSelection().length === 0) return;
		let catIri = this.extractIri(this.defaultCategoryCombo.getValue());
		let stoIri = this.extractIri(this.defaultStorageCombo.getValue());
		if (!catIri || !stoIri) {
			Ext.toast({html: i18n('Default Category and Storage are required.'), align: 't', closable: true});
			return;
		}
		let mode = this.projectModeCombo.getValue();
		let meta = {
			hasHeader: this.hasHeaderCheckbox.getValue(),
			mapping: {},
			defaultCategoryId: this.iriId(catIri),
			defaultStorageLocationId: this.iriId(stoIri),
			duplicatesBehavior: mode === 'inventory' ? (this.duplicatesCombo.getValue() || 'skip') : 'skip'
		};
		if (this.mpnColumn.getValue() !== null) meta.mapping.mpn = this.mpnColumn.getValue();
		if (this.lcscColumn.getValue() !== null) meta.mapping.lcsc = this.lcscColumn.getValue();
		if (this.designatorColumn.getValue() !== null) meta.mapping.designator = this.designatorColumn.getValue();
		if (this.commentColumn.getValue() !== null) meta.mapping.comment = this.commentColumn.getValue();
		if (this.footprintColumn.getValue() !== null) meta.mapping.footprint = this.footprintColumn.getValue();
		if (mode === 'existing') meta.projectId = this.projectCombo.getValue();
		if (mode === 'new') meta.projectName = String(this.projectNameField.getValue()).trim();
		if (mode !== 'inventory') {
			meta.projectBomQuantity = this.bomQuantityCheckbox.getValue();
			meta.projectStockQuantity = this.stockQuantityCheckbox.getValue();
		}
		if (this.mfrColumn.getValue() !== null) meta.mapping.manufacturer = this.mfrColumn.getValue();
		if (this.catColumn.getValue() !== null) meta.mapping.category = this.catColumn.getValue();
		if (this.stoColumn.getValue() !== null) meta.mapping.storage = this.stoColumn.getValue();
		if (this.qtyColumn.getValue() !== null) meta.mapping.quantity = this.qtyColumn.getValue();

		let fd = new FormData();
		fd.append('file', this.reviewGrid ? this.selectedCsvFile() : this.parsedFile, this.parsedFile.name);
		fd.append('meta', JSON.stringify(meta));

		Ext.Ajax.request({
			url: Limas.getBasePath() + '/api/bulk-import',
			method: 'POST',
			rawData: fd,
			headers: Object.assign(
				{},
				Limas.Auth.AuthenticationProvider.getAuthenticationProvider().getHeaders(),
				// Let the browser set the multipart boundary itself
				{'Content-Type': null}
			),
			success: function (response) {
				let r = Ext.decode(response.responseText);
				this.jobId = r.jobId;
				this.getLayout().setActiveItem('step-progress');
				this.startPolling();
			},
			failure: function (response) {
				let detail = '';
				try {
					let err = Ext.decode(response.responseText);
					if (err && err.error) detail = ': ' + err.error;
				} catch (e) {
				}
				Ext.toast({html: i18n('Bulk import submit failed (HTTP ') + response.status + ')' + Ext.htmlEncode(detail), align: 't', closable: true});
			},
			scope: this
		});
	},

	iriId: function (iri) {
		if (typeof iri !== 'string') return iri;
		let parts = iri.split('/');
		return parseInt(parts[parts.length - 1], 10);
	},

	// ──────────────────────────── Polling ────────────────────────────

	startPolling: function () {
		this.pollJob();
		this.pollTimer = setInterval(() => this.pollJob(), 2000);
	},

	stopPolling: function () {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	},

	pollJob: function () {
		if (!this.jobId) return;
		Ext.Ajax.request({
			url: Limas.getBasePath() + '/api/bulk-import-jobs/' + this.jobId,
			method: 'GET',
			headers: Limas.Auth.AuthenticationProvider.getAuthenticationProvider().getHeaders(),
			success: function (response) {
				let j = Ext.decode(response.responseText);
				this.statusPanel.update(
					'<b>' + i18n('Status') + ':</b> ' + Ext.htmlEncode(j.status) + ' &mdash; ' +
					i18n('processed') + ' ' + j.processedRows + ' / ' + j.totalRows
				);
				this.progressBodyPanel.update(this.renderProgressRows(j.items || []));
				this.resolveButton.setVisible(j.status === 'waiting_decision');
				if (j.status === 'completed' || j.status === 'partial' || j.status === 'failed' || j.status === 'waiting_decision') {
					this.stopPolling();
				}
			},
			scope: this
		});
	},

	submitDecisions: function () {
		let decisions = {};
		this.progressBodyPanel.getEl().dom.querySelectorAll('select.limas-project-decision').forEach(el => {
			decisions[el.dataset.itemId] = el.value;
		});
		Ext.Ajax.request({
			url: Limas.getBasePath() + '/api/bulk-import-jobs/' + this.jobId + '/decisions',
			method: 'POST', jsonData: {decisions},
			headers: Limas.Auth.AuthenticationProvider.getAuthenticationProvider().getHeaders(),
			success: function () { this.resolveButton.hide(); this.startPolling(); },
			failure: function (response) { Ext.toast({html: i18n('Conflict resolution failed: HTTP ') + response.status, align: 't'}); },
			scope: this
		});
	},

	listeners: {
		close: function () {
			this.stopPolling();
			if (this.fileInput && this.fileInput.parentNode) {
				this.fileInput.parentNode.removeChild(this.fileInput);
			}
		}
	}
});
