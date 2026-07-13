const {test, expect} = require('@playwright/test');
const {setupPage} = require('./helpers');

/**
 * Per-parameter override — conflict detection / noise reduction
 *
 * Exercises the REAL frontend logic (SearchPanel.candidateToRow +
 * ApplyReviewDialog.groupParamOptions) inside the live ExtJS runtime via
 * page.evaluate, with a synthetic candidate modelled on a real LM358 spread
 * across DigiKey / Farnell / Newark / LCSC / TME (the case in the screenshot
 * that motivated this). No HTTP mocking or click-through — this pins the
 * substance: which parameters are a genuine conflict vs merge-away noise.
 *
 * Both functions are pure w.r.t. `this`, so we invoke them off the prototype
 */
test.describe('Aggregator per-parameter override', () => {

	test('collapses format/missing-unit noise, keeps real conflicts', async ({page}) => {
		await setupPage(page);

		const out = await page.evaluate(() => {
			// Each Parameter is shaped as the backend emits it AFTER Stage-2
			// parsing (ParameterValueParser): ranges already split to min/max,
			// units/prefixes extracted. rawValue keeps the vendor spelling.
			const P = (o) => Object.assign({
				rawName: o.canonicalName, rawValue: '', rawUnit: null,
				canonicalName: o.canonicalName,
				numericValue: null, numericMin: null, numericMax: null,
				unit: null, siPrefix: null, qualifier: null, valueText: null
			}, o);

			const c = {
				parameters: {
					// Operating Temperature — three vendor spellings that ALL parse
					// to min0/max70 (incl. the "+"-glued form the BE fix handles).
					// Should collapse to a single value → NOT a conflict.
					digikey: [
						P({canonicalName: 'Operating Temperature', rawValue: '0°C ~ 70°C', numericMin: 0, numericMax: 70, unit: '°C'}),
						// Gain Bandwidth Product WITH unit
						P({canonicalName: 'Gain Bandwidth Product', rawValue: '1 MHz', numericValue: 1, unit: 'Hz', siPrefix: 'M'}),
						P({canonicalName: 'Amplifier Type', rawValue: 'General Purpose'}),
						// Resistance-style genuine unit disagreement
						P({canonicalName: 'Output Impedance', rawValue: '100 Ω', numericValue: 100, unit: 'Ω'})
					],
					lcsc: [
						P({canonicalName: 'Operating Temperature', rawValue: '0°C~+70°C', numericMin: 0, numericMax: 70, unit: '°C'})
					],
					tme: [
						P({canonicalName: 'Operating Temperature', rawValue: '0...70°C', numericMin: 0, numericMax: 70, unit: '°C'}),
						P({canonicalName: 'Output Impedance', rawValue: '100 kΩ', numericValue: 100, unit: 'Ω', siPrefix: 'k'})
					],
					farnell: [
						// Same GBP value but the unit was dropped by this vendor →
						// must fold into DigiKey's "1 MHz", NOT show as a conflict.
						P({canonicalName: 'Gain Bandwidth Product', rawValue: '1', numericValue: 1}),
						P({canonicalName: 'Amplifier Type', rawValue: 'Low Bias Current'}),
						// A bare "70" (just the upper bound, no range) — genuinely
						// LESS info than "0..70", so it must stay a separate option,
						// not silently fold into the range group.
						P({canonicalName: 'Operating Temperature', rawValue: '70', numericValue: 70, unit: '°C'})
					]
				}
			};

			const row = Limas.Components.InfoProviderAggregator.SearchPanel.prototype.candidateToRow.call(null, c, '');
			const groupFn = Limas.InfoProviderAggregator.ApplyReviewDialog.prototype.groupParamOptions;

			const summary = {};
			Object.keys(row.paramsBySource).forEach((k) => {
				const bs = row.paramsBySource[k];
				const opts = groupFn.call(null, bs);
				summary[bs.name] = {
					count: opts.length,
					displays: opts.map((o) => o.disp),
					sources: opts.map((o) => o.sources.slice().sort()),
					// the parsed entry backing each option (to check unit survives)
					units: opts.map((o) => (o.entry.siPrefix || '') + (o.entry.unit || ''))
				};
			});

			// pull the merged flat entry for GBP to confirm the unit was merged in
			const gbpFlat = (row.paramsFlat || []).filter((e) => e.name === 'Gain Bandwidth Product')[0] || null;

			return {summary: summary, gbpFlat: gbpFlat};
		});

		// Operating Temperature: the three range spellings (incl. LCSC's
		// fullwidth/"+"-glued form) collapse into ONE option, while Farnell's
		// bare "70" — genuinely less information — stays separate → exactly 2.
		// (Live, when every source agrees on the range, this drops to 1 option
		// and the section is hidden entirely — the "consensus, nothing to pick"
		// case, which is why it can vanish on some searches.)
		expect(out.summary['Operating Temperature'].count).toBe(2);
		expect(out.summary['Operating Temperature'].sources).toContainEqual(['digikey', 'lcsc', 'tme']);
		expect(out.summary['Operating Temperature'].sources).toContainEqual(['farnell']);

		// Gain Bandwidth Product: "1" folds into "1 MHz" (missing-unit) → no conflict,
		// and the surviving option keeps the unit
		expect(out.summary['Gain Bandwidth Product'].count).toBe(1);
		expect(out.summary['Gain Bandwidth Product'].units[0]).toBe('MHz');
		// the merged flat entry (what actually gets applied) carries the unit too
		expect(out.gbpFlat).not.toBeNull();
		expect(out.gbpFlat.unit).toBe('Hz');
		expect(out.gbpFlat.siPrefix).toBe('M');

		// Amplifier Type: two different strings → genuine conflict
		expect(out.summary['Amplifier Type'].count).toBe(2);

		// Output Impedance: 100 Ω vs 100 kΩ → same number, DIFFERENT real units →
		// genuine conflict, must stay separate
		expect(out.summary['Output Impedance'].count).toBe(2);
	});
});
