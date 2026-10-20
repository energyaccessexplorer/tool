import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// The atom the producer publishes through — same module instance
// analysis.js imports (path-resolved once by node), so the regression tests
// can assert that what resolved is exactly what the atom holds.
import { cell as analysis_state_cell, resultKey } from '../src/analysis-state.ts';

// Integration tests for the EAE-521 producer wiring in tool/src/analysis.js:
// analysis_scores/analysis_result/analysis_state_sync and priority() as
// "paint fills from the result". The browser globals are stubbed exactly as
// area-scores.test.ts does (see its header); MAPBOX stands in for the
// priority-source the fills are painted onto.
//
// The parity pins that matter here (zero number changes):
//   - priority()'s fills equal the legacy fill scale
//     (area_scale over analysis_colorscale.stops) applied to the same
//     averages — the bucket-index mapping is the same quantile slot;
//   - the phase-1 per-area scores are byte-identical to
//     aggregate_by_area's {id: {average}} record (averages_of reshapes
//     them to that legacy record shape for the comparison);
//   - phase 1 (scores only) lands BEFORE the layer aggregates — the
//     synchronous window mapbox popup handlers read in (§6.7) — with the
//     per-area values arriving with the completed result.

const g = globalThis as unknown as Record<string, unknown>;

g['HTMLElement'] = class {};
g['customElements'] = { "define": () => {} };

const d3: any = createRequire(import.meta.url)('../lib/d3.js');

const fake_svg: any = {
	"append": () => fake_svg,
	"attr":   () => fake_svg,
	"on":     () => fake_svg,
	"node":   () => fake_svg,
};
d3.create = () => fake_svg;

g['d3'] = d3;

g['EAE'] = { "indexes": {
	"solar": { "compound": [] },
	"wind":  { "compound": [] },
	"geo":   { "compound": [] },
	"eai":   { "compound": ['solar', 'wind'] },
}};

const analysis: any = await import('../src/analysis.ts');
const scores: any   = await import('../src/area-scores.ts');

const NO = -9999;

// One analysis dataset over a 4-cell grid; raster.sum/average stand in for
// the area-weighted bands parse.js folds single-band files into.
const make_ds = () => ({
	"id":       'maize',
	"name":     'Maize All Production',
	"index":    'solar',
	"weight":   1,
	"analysis": true,
	"type":     'raster',
	"domain":   { "min": 0, "max": 10 },
	"_domain":  { "min": 0, "max": 10 },
	"category": { "name": 'production', "unit": 't', "analysis": { "aggregation": 'SUM' } },
	"analysis_scale": () => 'norm',
	// Per-index scaling: 'solar' is the identity (every pinned expectation
	// below); 'wind' inverts, so a wind publish produces DIFFERENT numbers
	// (the index-blind bridge regression needs that).
	"analysis_fn":    (type: string) => (x: number) => (type === 'wind' ? 1 - x : x),
	"raster": {
		"data":    new Float32Array([0.5, 0.5, 0.25, 0.25]),
		"sum":     new Float32Array([5, 5, 2, 2]),
		"average": new Float32Array([1, 1, 1, 1]),
		"nodata":  NO,
	},
});

// The mapbox priority source the fills are painted onto.
const features: Array<{ id: number; properties: Record<string, unknown> }> = [
	{ "id": 7, "properties": {} },
	{ "id": 9, "properties": {} },
	{ "id": 11, "properties": {} },
];
const source: any = {
	"_data":   { "features": features },
	"setData": (d: unknown) => { source.data = d; },
};

g['MAPBOX'] = { "getSource": (id: string) => (id === 'priority-source-2' ? source : null) };

const div_data = [7, 7, 9, 9];

// The phase-1 per-area scores reshaped to the {id: {average}} record the
// pre-EAE-521 per-division shim published — the pinned numbers below live
// on the analysis cell now (values/national fold in at phase 2) and are
// compared in that legacy record shape, unchanged.
const averages_of = (areas: Record<string, { readonly score: number }>) =>
	Object.fromEntries(Object.entries(areas).map(([id, a]) => [id, { "average": a.score }]));

// Install STATE/OUTLINE/GEOGRAPHY and run the COMMIT hook: every set_state()
// hands the producer fresh dataset identities (the inputs fingerprint keys
// on them), so the hook drops the previous tests' entries exactly the way a
// data change invalidates in the app — tests stay isolated without
// restarting the module-level service.
function set_state(ds: unknown[]): void {
	// STATE.index is set like the app always has it: publishes and reads
	// follow the CURRENT index only.
	g['STATE'] = { "datasets": ds, "divtier": 0, "subdiv": undefined, "timeline": undefined, "index": 'solar' };
	g['OUTLINE'] = { "raster": { "data": new Float32Array([1, 1, 1, 1]), "nodata": NO } };
	g['GEOGRAPHY'] = {
		"id":   'geo-1',
		"name": 'Uganda',
		"divisions": {
			"2": { "name": 'District', "raster": { "data": div_data, "nodata": -1 } },
		},
	};

	analysis.analysis_state_sync();
}

describe('analysis.js producer: priority() paints fills from the result', () => {
	it('matches the legacy fill scale on the same averages, byte for byte', async () => {
		set_state([make_ds()]);
		features.forEach(f => { f.properties = {}; });

		const result = await analysis.analysis_scores('solar', 2);
		analysis.priority(result, 2);

		// Legacy computation exactly as the old priority() did it.
		const legacy = scores.aggregate_by_area(result.cells, div_data);
		const legacyScale = scores.area_scale(legacy, analysis.analysis_colorscale.stops);

		for (const f of features) {
			const expected = legacy[f.id]
				? (legacy[f.id].average === -1 ? 'transparent' : legacyScale(legacy[f.id].average))
				: 'transparent';

			assert.equal(f.properties['__fill'], expected, `fill of area ${f.id}`);
		}

		// The synthetic grid scores both areas, so the parity above is not
		// vacuous: both fills are real colours.
		assert.ok(features[0]?.properties['__fill'] !== 'transparent');
		assert.ok(features[1]?.properties['__fill'] !== 'transparent');
	});

	it('leaves areas without a scored cell transparent', () => {
		set_state([make_ds()]);
		features.forEach(f => { f.properties = {}; });

		// A result whose areas record has no entry for areas 9 and 11.
		analysis.priority({ "areas": { "7": { "score": 0.5, "bucket": 'High' } } }, 2);

		assert.ok(features[0]?.properties['__fill'] !== 'transparent');
		assert.equal(features[1]?.properties['__fill'], 'transparent');
		assert.equal(features[2]?.properties['__fill'], 'transparent');
	});
});

describe('analysis.js producer: two-phase publish (scores before aggregates)', () => {
	it('scores land before the layer aggregates (popup window)', async () => {
		set_state([make_ds()]);

		const scoresResult = await analysis.analysis_scores('solar', 2);

		// Phase 1: scores readable (the old sync assignment window), their
		// averages byte-identical to the legacy record — and the aggregates
		// NOT yet (the old await window).
		assert.equal(scoresResult.areas['7'].values, null);
		assert.equal(scoresResult.national.values, null);
		assert.deepEqual(averages_of(scoresResult.areas), scores.aggregate_by_area(scoresResult.cells, div_data));
		assert.deepEqual(averages_of(scoresResult.areas), { "7": { "average": 1 }, "9": { "average": 0 } });

		const complete = await analysis.analysis_result('solar', 2);

		// Phase 2: per-area values + the first-class national entry (§6.3),
		// and only now the layer aggregates. Area 9 rescales to score 0 (not
		// a priority score), so it is masked out of the values — today's
		// has_priority_score rule, unchanged.
		assert.deepEqual(complete.areas['7'].values, { "maize": { "type": 'scalar', "value": 10 } });
		assert.equal(complete.areas['9'].values, null);
		assert.deepEqual(complete.national.values, { "maize": { "type": 'scalar', "value": 14 } });
		assert.ok(complete.national.values['maize']);
	});
});

describe('analysis.js producer: analysis_state_sync (the COMMIT hook)', () => {
	it('serves unchanged inputs from the cache across unrelated COMMITs', async () => {
		set_state([make_ds()]);
		const first = await analysis.analysis_result('solar', 2);

		analysis.analysis_state_sync(); // e.g. COMMIT('tab') / COMMIT('center')
		analysis.analysis_state_sync();

		const again = await analysis.analysis_result('solar', 2);
		assert.equal(again, first);
	});

	it('invalidates on _domain/_afn (range slider) changes, via COMMIT', async () => {
		set_state([make_ds()]);
		const first = await analysis.analysis_result('solar', 2);
		assert.equal(first.areas['7'].score, 1);

		// cards.js range slider: _domain rewritten, _afn derived from it.
		const ds: any = (g['STATE'] as any).datasets[0];
		ds._domain = { "min": 0, "max": 1 };
		ds.analysis_fn = () => (x: number) => 1 - x;

		analysis.analysis_state_sync();

		const fresh = await analysis.analysis_result('solar', 2);
		assert.ok(fresh !== first);
		// The numbers really changed too (the rewritten _afn inverts scores).
		assert.ok(fresh.areas['7'].score !== first.areas['7'].score);
	});

	it('invalidates on data arrival (fresh raster identities)', async () => {
		set_state([make_ds()]);
		const first = await analysis.analysis_result('solar', 2);

		// parse.js re-parse: same lengths, new arrays.
		const ds: any = (g['STATE'] as any).datasets[0];
		ds.raster = {
			...ds.raster,
			"data": new Float32Array([0.9, 0.9, 0.9, 0.9]),
			"sum":  new Float32Array([9, 9, 9, 9]),
		};

		analysis.analysis_state_sync();

		const fresh = await analysis.analysis_result('solar', 2);
		assert.ok(fresh !== first);
		assert.deepEqual(fresh.areas['7'].values, { "maize": { "type": 'scalar', "value": 18 } });
		assert.deepEqual(fresh.national.values, { "maize": { "type": 'scalar', "value": 36 } });
	});
});

describe('analysis.js producer: stabilisation regressions (stale cache, stale resolve, bridges)', () => {
	// Task #20's reproduced flake maps onto area 7 of the fixture grid: the
	// pre-change analysis reads score 0.75 / 10 t (the reported "NAMISINDWA
	// 516 t / 74.5%"), the post-change one 1.0 / 18 t ("522 t / 100.0%").
	const prechange_ds = () => {
		const ds = make_ds();
		ds.raster = { ...ds.raster, "data": new Float32Array([0.5, 0.375, 0.25, 0.25]) };
		return ds;
	};

	// The change that lands INSIDE the 300ms COMMIT debounce window: fresh
	// raster identities (a data re-parse), and no analysis_state_sync()
	// follows — the cache keys (revision, ...) stay put.
	const land_change = () => {
		const ds: any = (g['STATE'] as any).datasets[0];
		ds.raster = {
			...ds.raster,
			"data": new Float32Array([0.5, 0.5, 0.25, 0.25]),
			"sum":  new Float32Array([9, 9, 2, 2]),
		};
	};

	it('the debounce window serves post-change results, not the cached entry (NAMISINDWA repro)', async () => {
		// The reproduced path: a request inside the debounce window hit the
		// pre-change memo entry — start()/stage() served it without
		// re-verifying its fingerprint against the moved inputs.
		set_state([prechange_ds()]);

		const first = await analysis.analysis_result('solar', 2);
		assert.equal(first.areas['7'].score, 0.75);
		assert.deepEqual(first.areas['7'].values, { "maize": { "type": 'scalar', "value": 10 } });

		land_change();

		const fresh = await analysis.analysis_result('solar', 2);
		assert.ok(fresh !== first, 'the pre-change entry was served inside the debounce window');
		assert.equal(fresh.areas['7'].score, 1);
		assert.deepEqual(fresh.areas['7'].values, { "maize": { "type": 'scalar', "value": 18 } });
	});

	it('a debounce-window request recomputes instead of folding in pre-change stage cells', async () => {
		// The stale-publish half of the repro: the run() stage holds
		// pre-change cells (the map painted before the change) while the
		// request's fresh entry captures the POST-change fingerprint —
		// publish()'s guard saw matching (post-change) captures and used to
		// publish the stale intermediate analysis anyway.
		set_state([prechange_ds()]);
		await analysis.analysis_cells('solar');

		land_change();

		const result = await analysis.analysis_scores('solar', 2);
		assert.equal(result.areas['7'].score, 1); // stale cells would read 0.75

		// The phase-1 publish carries the post-change scores in its usual
		// synchronous window.
		assert.deepEqual(averages_of(result.areas), { "7": { "average": 1 }, "9": { "average": 0 } });
	});

	it('analysis_result() never resolves a result whose publish was discarded as stale', async () => {
		// Migration #10's report: publish() re-checks the inputs fingerprint
		// and discards on mismatch, but the deferred done still resolved
		// with the now un-published stale result — a consumer could observe
		// a result the atom never held. The caller asked for the result for
		// the CURRENT inputs: the computation is retried against them.
		set_state([prechange_ds()]);

		const pending_result = analysis.analysis_result('solar', 2);
		land_change(); // lands mid-computation, debounce pending

		const result = await pending_result;

		// The recomputed post-change result resolves (1.0 / 18 t), not the
		// discarded pre-change one (0.75 / 10 t).
		assert.equal(result.areas['7'].score, 1);
		assert.deepEqual(result.areas['7'].values, { "maize": { "type": 'scalar', "value": 18 } });

		// ...and what resolved is exactly what the atom holds.
		assert.equal(analysis_state_cell().state.results[resultKey('solar', 2, null)]?.result, result);

		assert.deepEqual(averages_of(result.areas), { "7": { "average": 1 }, "9": { "average": 0 } });
	});

	it('other-index publishes leave the current index entry untouched (index-blind bridge)', async () => {
		// Task #20: the pre-EAE-521 per-division shim published results for
		// ANY index into fields shared across indexes, so when the
		// Prioritization tab published other-index results the remaining
		// readers (right-panel-high-priority-areas.js get_division_results)
		// could render another index's values. The analysis cell keys every
		// result (index, tier, subdiv): other-index publishes must leave the
		// current index's entry — and its numbers — untouched.
		set_state([make_ds()]);

		await analysis.analysis_scores('solar', 2);
		const solarResult = await analysis.analysis_result('solar', 2);
		assert.deepEqual(averages_of(solarResult.areas), { "7": { "average": 1 }, "9": { "average": 0 } });

		// The Prioritization tab's per-index rows publish 'wind' results —
		// its per-index _afn inverts the cells, so its numbers differ (areas
		// 7/9 read 0/1 instead of 1/0) — and must not reach the 'solar' key.
		await analysis.analysis_scores('wind', 2);
		await analysis.analysis_result('wind', 2);

		assert.equal(analysis_state_cell().state.results[resultKey('solar', 2, null)]?.result, solarResult);
		assert.deepEqual(averages_of(solarResult.areas), { "7": { "average": 1 }, "9": { "average": 0 } });
	});
});
