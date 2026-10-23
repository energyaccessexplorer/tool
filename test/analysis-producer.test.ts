import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// The atom the producer publishes through — the same module instance
// analysis.js imports, so the tests can assert what resolved is what the
// atom holds.
import { cell as analysis_state_cell, resultKey } from '../src/analysis-state.ts';

// Integration tests for the producer wiring in tool/src/analysis.js:
// analysis_scores/analysis_result/analysis_state_sync and priority() as
// "paint fills from the result". Browser globals are stubbed as in
// area-scores.test.ts (see its header); MAPBOX stands in for the
// priority-source the fills are painted onto.
//
// Pins: priority()'s fills are score_bucket's colours, checked against an
// independent floor-arithmetic oracle below; the phase-1 per-area scores are
// byte-identical to aggregate_by_area's {id: {average}} record; phase 1
// (scores only) lands before the layer aggregates, the synchronous window
// popup handlers read.

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
const AREA_SCORE_FLOOR: number = scores.AREA_SCORE_FLOOR;

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
	// 'solar' is the identity (every pinned expectation below); 'wind'
	// inverts, so a wind publish produces different numbers, which the
	// index-blind bridge regression needs.
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

// Phase-1 scores as {id: score}, the record the pinned numbers are compared in.
const scores_of = (areas: Record<string, { readonly score: number }>) =>
	Object.fromEntries(Object.entries(areas).map(([id, a]) => [id, a.score]));

// Installs STATE/OUTLINE/GEOGRAPHY and runs the COMMIT hook: each dataset's
// fresh identity drops the previous test's entries, the way a data change
// invalidates in the app — no need to restart the module-level service.
function set_state(ds: unknown[]): void {
	// Publishes and reads follow the current index only.
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
	it('paints the one scale\'s bucket colours on the fills', async () => {
		set_state([make_ds()]);
		features.forEach(f => { f.properties = {}; });

		const result = await analysis.analysis_scores('solar', 2);
		analysis.priority(result, 2);

		// Independent oracle for score_bucket's fixed 20% bands:
		// band = floor(clamp(v, 0, 1) * 5), the fill being that band's stop on
		// the analysis ramp. Plain arithmetic on purpose, so the fill path and
		// the scale cannot drift together unnoticed. On this [0, 1] grid area
		// 7 holds 2 cells of 1 -> the top band, area 9 holds 0 -> Low.
		const band_of = (v: number) => Math.min(4, Math.max(0, Math.floor(Math.min(1, Math.max(0, v)) * 5)));
		const legacy = scores.aggregate_by_area(result.cells, div_data);
		const best = Math.max(...Object.values(legacy as Record<string, { sum: number }>).map(a => a.sum));

		for (const f of features) {
			const expected = legacy[f.id]
				? analysis.analysis_colorscale.stops[band_of(legacy[f.id].sum / best)]
				: 'transparent';

			assert.equal(f.properties['__fill'], expected, `fill of area ${f.id}`);
			assert.equal(legacy[f.id] ? result.areas[f.id]?.bucket?.colour : null,
			             legacy[f.id] ? expected : null,
			             `published bucket colour of area ${f.id}`);
		}

		// Both areas score, so the parity above is not vacuous.
		assert.ok(features[0]?.properties['__fill'] !== 'transparent');
		assert.ok(features[1]?.properties['__fill'] !== 'transparent');
	});

	it('leaves areas without a scored cell transparent', () => {
		set_state([make_ds()]);
		features.forEach(f => { f.properties = {}; });

		analysis.priority({ "areas": { "7": {
			"score":  0.5,
			"bucket": { "index": 2, "label": 'Medium', "colour": analysis.analysis_colorscale.stops[2] },
		} } }, 2);

		assert.ok(features[0]?.properties['__fill'] !== 'transparent');
		assert.equal(features[1]?.properties['__fill'], 'transparent');
		assert.equal(features[2]?.properties['__fill'], 'transparent');
	});
});

describe('analysis.js producer: two-phase publish (scores before aggregates)', () => {
	it('scores land before the layer aggregates (popup window)', async () => {
		set_state([make_ds()]);

		const scoresResult = await analysis.analysis_scores('solar', 2);

		// Phase 1: scores readable, stretched over the two areas; aggregates
		// not yet.
		assert.equal(scoresResult.areas['7'].values, null);
		assert.equal(scoresResult.national.values, null);
		assert.deepEqual(scores_of(scoresResult.areas), { "7": 1, "9": AREA_SCORE_FLOOR });
		assert.deepEqual(scores.aggregate_by_area(scoresResult.cells, div_data),
		                 { "7": { "sum": 2, "average": 1 }, "9": { "sum": 0, "average": 0 } });

		const complete = await analysis.analysis_result('solar', 2);

		// Phase 2: per-area values and the national entry land. Area 9's cells
		// score 0, so analysed_mask keeps it out of the values.
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
	const prechange_ds = () => {
		const ds = make_ds();
		// Cells whose mass sits with area 9 pre-change (its 1.0 rescales to the
		// top of the grid, so area 7 is not the best area) and with area 7 after
		// land_change(): the stale-vs-fresh discriminator these regressions
		// need, in the score as well as the totals. Both of area 7's cells stay
		// above the observed minimum, so both keep their totals under the
		// analysed mask; area 9's 0.3 falls to the floor and drops out.
		ds.raster = {
			...ds.raster,
			"data": new Float32Array([0.5, 0.375, 0.3, 1]),
			"sum":  new Float32Array([1.5, 1.5, 2, 4]),
		};
		return ds;
	};

	// A change landing INSIDE the 300ms COMMIT debounce window: fresh raster
	// identities with no analysis_state_sync(), so the cache keys stay put.
	const land_change = () => {
		const ds: any = (g['STATE'] as any).datasets[0];
		ds.raster = {
			...ds.raster,
			"data": new Float32Array([0.5, 0.5, 0.25, 0.25]),
			"sum":  new Float32Array([9, 9, 2, 2]),
		};
	};

	it('the debounce window serves post-change results, not the cached entry (NAMISINDWA repro)', async () => {
		// Inside the debounce window a cache hit must re-verify its
		// fingerprint, not serve the pre-change entry.
		set_state([prechange_ds()]);

		const first = await analysis.analysis_result('solar', 2);
		assert.ok(first.areas['7'].score > 0 && first.areas['7'].score < 1,
		          'the pre-change mass sits with area 9, so the score tells stale from fresh');
		assert.deepEqual(first.areas['7'].values, { "maize": { "type": 'scalar', "value": 3 } });
		assert.deepEqual(first.areas['9'].values, { "maize": { "type": 'scalar', "value": 4 } });

		land_change();

		const fresh = await analysis.analysis_result('solar', 2);
		assert.ok(fresh !== first, 'the pre-change entry was served inside the debounce window');
		assert.equal(fresh.areas['7'].score, 1);
		assert.deepEqual(fresh.areas['7'].values, { "maize": { "type": 'scalar', "value": 18 } });
	});

	it('a debounce-window request recomputes instead of folding in pre-change stage cells', async () => {
		// The run() stage still holds pre-change cells while the request's
		// fresh entry captures the post-change fingerprint.
		set_state([prechange_ds()]);
		await analysis.analysis_cells('solar');

		land_change();

		const result = await analysis.analysis_scores('solar', 2);
		// Stale cells would keep area 9's 1.0 cell analysed; only the fresh
		// cells leave both of area 9's cells out.
		assert.deepEqual(Array.from(result.mask), [1, 1, 0, 0]);
		assert.equal(result.areas['7'].score, 1);

		assert.deepEqual(scores_of(result.areas), { "7": 1, "9": AREA_SCORE_FLOOR });
	});

	it('analysis_result() never resolves a result whose publish was discarded as stale', async () => {
		// publish() discards a fingerprint mismatch, but the caller must still
		// get a result the atom actually holds: the computation is retried
		// against the current inputs.
		set_state([prechange_ds()]);

		const pending_result = analysis.analysis_result('solar', 2);
		land_change(); // lands mid-computation, debounce pending

		const result = await pending_result;

		assert.equal(result.areas['7'].score, 1);
		assert.deepEqual(result.areas['7'].values, { "maize": { "type": 'scalar', "value": 18 } });

		// What resolved is exactly what the atom holds.
		assert.equal(analysis_state_cell().state.results[resultKey('solar', 2, null)]?.result, result);

		assert.deepEqual(scores_of(result.areas), { "7": 1, "9": AREA_SCORE_FLOOR });
	});

	it('other-index publishes leave the current index entry untouched (index-blind bridge)', async () => {
		// Results are keyed by (index, tier, subdiv): an other-index publish
		// must leave the current index's entry — and its numbers — untouched.
		set_state([make_ds()]);

		await analysis.analysis_scores('solar', 2);
		const solarResult = await analysis.analysis_result('solar', 2);
		assert.deepEqual(scores_of(solarResult.areas), { "7": 1, "9": AREA_SCORE_FLOOR });

		// The Prioritization tab publishes 'wind' results, whose per-index _afn
		// inverts the cells (areas 7/9 read 0/1): they must not reach the
		// 'solar' key.
		await analysis.analysis_scores('wind', 2);
		await analysis.analysis_result('wind', 2);

		assert.equal(analysis_state_cell().state.results[resultKey('solar', 2, null)]?.result, solarResult);
		assert.deepEqual(scores_of(solarResult.areas), { "7": 1, "9": AREA_SCORE_FLOOR });
	});
});
