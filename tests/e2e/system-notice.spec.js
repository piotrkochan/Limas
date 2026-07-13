const {test, expect} = require('@playwright/test');
const {setupPage} = require('./helpers');

// global-setup.js seeds unacknowledged notices: one read-only 'E2E Notice
// Read' (list/edit) plus an 'E2E Notice Ack 1..3' pool the acknowledge test
// consumes one at a time (retry-safe, since acknowledging is one-way)
const READ_NOTICE = 'E2E Notice Read';

/**
 * Open the System Notices panel and wait for its grid store to load
 */
async function openSystemNoticesPanel(page) {
	await page.evaluate(() => {
		Limas.getApplication().openAppItem('Limas.SystemNoticeEditorComponent');
	});
	await page.waitForFunction(() => {
		const panel = Ext.ComponentQuery.query('SystemNoticeEditorComponent')[0];
		const grid = Ext.ComponentQuery.query('SystemNoticeGrid')[0];
		return panel && panel.isVisible() && grid && grid.getStore().isLoaded();
	}, {timeout: 5000});
}

test.describe('Limas System Notices UI', () => {
	test('should open System Notices panel from application', async ({page}) => {
		await setupPage(page);
		await openSystemNoticesPanel(page);

		const panelInfo = await page.evaluate(() => {
			const panel = Ext.ComponentQuery.query('SystemNoticeEditorComponent')[0];
			const grid = Ext.ComponentQuery.query('SystemNoticeGrid')[0];
			return {
				panelVisible: panel?.isVisible(),
				gridVisible: grid?.isVisible()
			};
		});

		expect(panelInfo.panelVisible).toBe(true);
		expect(panelInfo.gridVisible).toBe(true);
	});

	test('should render the seeded notice as a row in the grid DOM', async ({page}) => {
		await setupPage(page);
		await openSystemNoticesPanel(page);

		// Assert against the rendered grid cell/row, not the store — the store having a record proves nothing about what the user actually sees
		await expect(page.locator('.x-grid-cell', {hasText: READ_NOTICE})).toBeVisible();
		await expect(page.locator('.x-grid-row', {hasText: READ_NOTICE})).toBeVisible();
	});

	test('should open the editor when a notice row is activated', async ({page}) => {
		await setupPage(page);
		await openSystemNoticesPanel(page);

		await page.evaluate((t) => {
			const grid = Ext.ComponentQuery.query('SystemNoticeGrid')[0];
			const rec = grid.getStore().findRecord('title', t);
			grid.fireEvent('itemEdit', rec.getId());
		}, READ_NOTICE);

		await page.waitForFunction(() => {
			const editors = Ext.ComponentQuery.query('SystemNoticeEditor');
			return editors.length > 0 && editors[0].isVisible();
		}, {timeout: 5000});

		const editor = await page.evaluate(() => {
			const e = Ext.ComponentQuery.query('SystemNoticeEditor')[0];
			return {
				title: e.record?.get('title'),
				hasAck: !!e.acknowledgeButton
			};
		});
		expect(editor.title).toBe(READ_NOTICE);
		expect(editor.hasAck).toBe(true);
	});

	test('should drop a notice from the grid after acknowledging it', async ({page}) => {
		await setupPage(page);
		await openSystemNoticesPanel(page);

		// Pick the first still-unacknowledged ack-pool notice. Acknowledging is
		// one-way, so on a Playwright retry the previous target is already gone —
		// the pool (E2E Notice Ack 1..3) gives the retry a fresh one.
		const target = await page.evaluate(() => {
			const grid = Ext.ComponentQuery.query('SystemNoticeGrid')[0];
			const rec = grid.getStore().findBy((r) => (r.get('title') || '').indexOf('E2E Notice Ack') === 0);
			return rec !== -1 ? grid.getStore().getAt(rec).get('title') : null;
		});
		expect(target, 'an unacknowledged ack-pool notice should exist').not.toBeNull();

		// Present in the DOM before acknowledging
		await expect(page.locator('.x-grid-row', {hasText: target})).toBeVisible();

		await page.evaluate((t) => {
			const grid = Ext.ComponentQuery.query('SystemNoticeGrid')[0];
			grid.fireEvent('itemEdit', grid.getStore().findRecord('title', t).getId());
		}, target);
		await page.waitForFunction(() => {
			const editors = Ext.ComponentQuery.query('SystemNoticeEditor');
			return editors.length > 0 && editors[0].isVisible();
		}, {timeout: 5000});

		await page.evaluate(() => {
			Ext.ComponentQuery.query('SystemNoticeEditor')[0].acknowledgeButton.fireHandler();
		});

		// The grid filters acknowledged=false, so that row must leave the DOM
		await expect(page.locator('.x-grid-row', {hasText: target})).toBeHidden({timeout: 10000});
	});

	test('should expose the system notice button component', async ({page}) => {
		await setupPage(page);
		const buttonInfo = await page.evaluate(() => {
			const b = Ext.ComponentQuery.query('SystemNoticeButton')[0];
			return {
				found: !!b,
				visible: b?.isVisible()
			};
		});
		expect(buttonInfo).toBeDefined();
	});
});
