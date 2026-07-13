/**
 * Common helper functions for E2E tests
 */

/**
 * Helper to wait for ExtJS and get authenticated session
 */
async function setupPage(page) {
	await page.goto('/');
	await page.waitForFunction(() => typeof Ext !== 'undefined' && Ext.isReady, {timeout: 15000});
	await page.waitForSelector('#loader-wrapper', {state: 'hidden', timeout: 15000});
	// Wait for status bar to show "Ready."
	await page.waitForSelector('.x-status-text:has-text("Ready.")', {timeout: 15000});
}

/**
 * Helper to wait for PartManager to be fully loaded
 */
async function waitForPartManager(page) {
	await page.waitForFunction(() => {
		const partManager = Ext.getCmp('limas-partmanager');
		if (!partManager || !partManager.isVisible()) return false;
		const grid = partManager.grid;
		const tree = partManager.tree;
		return grid && tree && tree.getStore().isLoaded();
	}, {timeout: 15000});
}

/**
 * Helper to wait for Part Category tree to be fully loaded
 */
async function waitForPartCategoryTree(page) {
	await page.waitForFunction(() => {
		const tree = Ext.ComponentQuery.query('PartCategoryTree')[0];
		if (!tree || !tree.isVisible()) return false;
		const store = tree.getStore();
		// Wait for store to be loaded AND have at least the root node
		return store && store.isLoaded() && tree.getRootNode() && tree.getRootNode().childNodes.length > 0;
	}, {timeout: 15000});
}

/**
 * Helper to wait for a category to appear in the tree
 */
async function waitForCategoryInTree(page, categoryName) {
	// Wait for category to appear in DOM (tree should auto-update after save)
	await page.waitForSelector(`.x-tree-node-text:has-text("${categoryName}")`, {timeout: 20000});
}

/**
 * Select a category by name in whichever category tree is currently visible.
 * Uses the Ext selection model rather than a DOM click on the node text: a
 * DOM click hangs ("performing click action") whenever a floating window/mask
 * or an in-flight tree re-render covers the node, which flakes intermittently.
 * Selecting via the model fires the same selectionchange the app reacts to
 * (e.g. enabling the tree's delete button).
 */
async function selectCategoryByName(page, categoryName) {
	await page.evaluate((name) => {
		const trees = Ext.ComponentQuery.query('treepanel').filter((t) => t.isVisible());
		for (const tree of trees) {
			const node = tree.getRootNode().findChildBy(
				(n) => (n.get('name') || n.data.text) === name, null, true
			);
			if (node) {
				tree.getSelectionModel().select(node);
				return;
			}
		}
		throw new Error('Category node not found in any visible tree: ' + name);
	}, categoryName);
	await page.waitForTimeout(300);
}

module.exports = {
	setupPage,
	waitForPartManager,
	waitForPartCategoryTree,
	waitForCategoryInTree,
	selectCategoryByName
};
