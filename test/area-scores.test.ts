import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Characterisation tests for the pure pieces of tool/src/analysis.js, written
// BEFORE the area-score refactor (notes/area-score-refactor.md). They pin
// current behaviour — every number asserted here is a guarantee that step 2
// (extraction into tool/src/area-scores.ts) must not change. Do not "fix"
// these expectations; if they fail after a refactor, the refactor changed
// behaviour.
//
// analysis.js is browser code, so the shims below stand in for what the app
// provides globally:
//   - STATE / OUTLINE / EAE / GEOGRAPHY: free variables read by run() and
//     aggregate_layer_values();
//   - d3: the very d3 v5 bundle the app ships (tool/lib/d3.js), loaded as
//     UMD/CommonJS and installed as a global (priority_scale and run() call
//     d3.scaleQuantile / d3.scaleLinear);
//   - HTMLElement / customElements: needed at import time by utils.js ->
//     toast.js;
//   - d3.create(): colorscale_svg() builds the legend SVG at module scope;
//     the legend DOM is not under test, so it is stubbed out.

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

const analysis: any = await import('../src/analysis.ts');
const scores: any   = await import('../src/area-scores.ts');

const run: any                 = analysis.default;
const division_averages: any   = scores.aggregate_by_area;
const priority_scale: any      = scores.area_scale;
const has_priority_score: any  = scores.has_priority_score;
const aggregation_band: any    = scores.aggregation_band;
const aggregate_layer_values: any = analysis.aggregate_layer_values;

// ---------------------------------------------------------------- helpers

const near = (actual: number, expected: number, message?: string) =>
	assert.ok(Math.abs(actual - expected) < 1e-12,
	          message ?? `expected ${expected}, got ${actual}`);

// Raster nodata marker used by the synthetic datasets below.
const NO = -9999;

// The bottom-band artefact of rescaling the analysis into a Float32Array:
// the minimum can land a hair below zero (see has_priority_score's comment
// in analysis.js).
const TINY_NEG = -1.6e-8;

// A dataset as run()'s datasets() sees it. `analysis_fn(type)` returns the
// per-cell scaling function (the "clamp" case: values outside [0, 1] are
// clipped by run(), not clamped here).
const ds = (over: any = {}): any => ({
	"id":             'x',
	"index":          'solar',
	"weight":         1,
	"analysis":       true,
	"type":           'raster',
	"domain":         { "min": 0, "max": 10 },
	"_domain":        { "min": 0, "max": 10 },
	"analysis_scale": () => 'norm',
	"analysis_fn":    () => (x: number) => x,
	"raster":         { "data": new Float32Array([0.5, 0.5, 0.25, 0.25]), "nodata": NO },
	...over,
});

// Install STATE/OUTLINE for a run() call on a `cell_count`-cell grid.
const set_state = (datasets: any[], cell_count = 4) => {
	g['STATE']  = { datasets, "divtier": 0 };
	g['OUTLINE'] = { "raster": { "data": new Float32Array(cell_count) } };
};

// Non-compound indexes become "singles" in run()'s weight split. eai is
// compound (>= 2 components) and must never appear in totals or singles.
g['EAE'] = { "indexes": {
	"solar": { "compound": [] },
	"wind":  { "compound": [] },
	"geo":   { "compound": [] },
	"eai":   { "compound": ['solar', 'wind'] },
}};
g['GEOGRAPHY'] = { "divisions": {} };

// ------------------------------------------------------- division_averages

describe('division_averages', () => {
	it('averages each area over its own cells (sum / count), ids stringified', () => {
		const out = division_averages([0.25, 0.75, 0.5, 0.25, 0.5], [7, 7, 7, 9, 9]);

		// Object keys stringify the numeric division ids.
		assert.deepEqual(Object.keys(out), ['7', '9']);
		assert.deepEqual(out['7'], { "average": 0.5 });    // (0.25+0.75+0.5)/3
		assert.deepEqual(out['9'], { "average": 0.375 });  // (0.25+0.5)/2
	});

	it('skips cells with no division (-1) and cells the analysis clipped (-1)', () => {
		// -1 division cell: its analysis value must not leak anywhere.
		assert.deepEqual(
			division_averages([0.5, 0.75, 0.25], [1, -1, 1]),
			{ "1": { "average": 0.375 } },  // (0.5+0.25)/2
		);

		// -1 analysis cell inside an area: skipped for that area's average.
		assert.deepEqual(
			division_averages([0.5, -1, 0.25], [1, 1, 1]),
			{ "1": { "average": 0.375 } },
		);

		// An area whose cells are all skipped does not appear at all (its id
		// is never even inserted into the accumulator).
		assert.deepEqual(division_averages([-1, -1], [2, 2]), {});
	});

	it('keeps tiny-negative rescale artefacts in the average, though has_priority_score rejects them', () => {
		// A lone bottom-band cell averages to itself: it IS a scored cell for
		// division_averages / priority_scale purposes.
		const lone = division_averages([TINY_NEG], [4]);
		assert.equal(lone['4'].average, TINY_NEG);

		// It drags the area average along with it...
		const mixed = division_averages([TINY_NEG, 0.5], [4, 4]);
		near(mixed['4'].average, 0.249999992);  // (0.5 - 1.6e-8) / 2

		// ...but it is NOT a "priority score" cell for the masks/cards/export.
		assert.equal(has_priority_score(TINY_NEG), false);
		assert.equal(has_priority_score(lone['4'].average), false);
	});
});

// ------------------------------------------------------------ priority_scale

describe('priority_scale', () => {
	const bands = ['r0', 'r1', 'r2', 'r3', 'r4'];

	it('returns null when no area carries a usable average', () => {
		assert.equal(priority_scale({}, bands), null);

		// -1 (nodata) and non-finite averages are all filtered out first.
		assert.equal(priority_scale({
			"1": { "average": -1 },
			"2": { "average": NaN },
			"3": { "average": Infinity },
			"4": { "average": -Infinity },
		}, bands), null);
	});

	it('drops -1/NaN/Infinity averages from the quantile domain', () => {
		const scale = priority_scale({
			"1": { "average": -1 },
			"2": { "average": 0.25 },
			"3": { "average": NaN },
			"4": { "average": 0.75 },
		}, bands);

		// Domain is [min, max] of the surviving averages = [0.25, 0.75];
		// equal-width bands on that span (see next test).
		assert.equal(scale(0.25), 'r0');
		assert.equal(scale(0.4), 'r1');
		assert.equal(scale(0.5), 'r2');
		assert.equal(scale(0.6), 'r3');
		assert.equal(scale(0.75), 'r4');
	});

	it('a 2-element [min, max] domain degenerates into equal-width bands', () => {
		// priority_scale feeds d3.scaleQuantile just the two numbers
		// [min, max] instead of the full sample, so its "quantiles" are
		// linearly interpolated between them: the bands come out EQUAL-WIDTH
		// (k/5 of the span each), not quantile-sized. Band k covers
		// [min + k/5*(max-min), min + (k+1)/5*(max-min)) with the exact
		// boundary going to the upper band (d3.bisectRight), and the outer
		// bands unbounded.
		const scale = priority_scale({
			"1": { "average": 0 },
			"2": { "average": 1 },
		}, bands);

		assert.equal(scale(-5), 'r0');     // unbounded below
		assert.equal(scale(0), 'r0');
		assert.equal(scale(0.19), 'r0');
		assert.equal(scale(0.2), 'r1');    // exact boundary -> upper band
		assert.equal(scale(0.39), 'r1');
		assert.equal(scale(0.4), 'r2');
		assert.equal(scale(0.59), 'r2');
		assert.equal(scale(0.6), 'r3');
		assert.equal(scale(0.79), 'r3');
		assert.equal(scale(0.8), 'r4');
		assert.equal(scale(1), 'r4');
		assert.equal(scale(2), 'r4');      // unbounded above

		// d3 quantile scales coerce null to 0 and map NaN outside the range.
		assert.equal(scale(null), 'r0');
		assert.equal(scale(NaN), undefined);

		// Same degeneration on a non-[0, 1] span: thresholds at 12/14/16/18.
		const span = priority_scale({
			"1": { "average": 10 },
			"2": { "average": 20 },
		}, bands);
		assert.equal(span(11.9), 'r0');
		assert.equal(span(12), 'r1');
		assert.equal(span(13.9), 'r1');
		assert.equal(span(14), 'r2');
		assert.equal(span(18), 'r4');
		assert.equal(span(20), 'r4');
	});

	it('a min === max domain collapses: the value itself maps to the LAST band', () => {
		// Single-area (or all-equal) case: every quantile threshold equals
		// the value, and d3.bisectRight pushes the exact value past all of
		// them — so the area reads as the top band.
		const scale = priority_scale({ "1": { "average": 5 } }, ['r0', 'r1', 'r2']);

		assert.equal(scale(5), 'r2');
		assert.equal(scale(4.9), 'r0');
		assert.equal(scale(5.1), 'r2');
	});

	it('bands tiny-negative averages like any other value (unlike has_priority_score)', () => {
		const scale = priority_scale({
			"1": { "average": TINY_NEG },
			"2": { "average": 0.5 },
		}, bands);

		assert.equal(scale(TINY_NEG), 'r0');
		assert.equal(scale(0.5), 'r4');
		assert.equal(has_priority_score(TINY_NEG), false);
	});
});

// --------------------------------------------------------- has_priority_score

describe('has_priority_score', () => {
	it('is a strict > 0 test', () => {
		assert.equal(has_priority_score(0.5), true);
		assert.equal(has_priority_score(1), true);
		assert.equal(has_priority_score(Number.MIN_VALUE), true);
		assert.equal(has_priority_score(0), false);
		assert.equal(has_priority_score(-0), false);
		assert.equal(has_priority_score(-1), false);
		assert.equal(has_priority_score(TINY_NEG), false);
	});

	it('rejects NaN and ±Infinity', () => {
		assert.equal(has_priority_score(NaN), false);
		assert.equal(has_priority_score(Infinity), false);
		assert.equal(has_priority_score(-Infinity), false);
	});
});

// ---------------------------------------------------------- aggregation_band

describe('aggregation_band', () => {
	const bands = {
		"data":    'DATA_BAND',
		"sum":     'SUM_BAND',
		"average": 'AVG_BAND',
		"nodata":  NO,
	};
	const layer = (category: any, csv?: any) => ({ "category": category, "raster": bands, "csv": csv });

	it('SUM reads the area-weighted sum band, AVG the average band', () => {
		assert.equal(aggregation_band(layer({ "name": 'c', "analysis": { "aggregation": 'SUM' } })), 'SUM_BAND');
		assert.equal(aggregation_band(layer({ "name": 'c', "analysis": { "aggregation": 'AVG' } })), 'AVG_BAND');
	});

	it('defaults to the average band when no aggregation is configured', () => {
		assert.equal(aggregation_band(layer({ "name": 'c' })), 'AVG_BAND');
		assert.equal(aggregation_band(layer({ "name": 'c', "analysis": {} })), 'AVG_BAND');
		// Unknown aggregation functions also fall back to AVG.
		assert.equal(aggregation_band(layer({ "name": 'c', "analysis": { "aggregation": 'MEDIAN' } })), 'AVG_BAND');
	});

	it('csv-keyed (categorical) datasets keep the near band regardless of aggregation', () => {
		const csv = { "key": 1, "table": {} };

		assert.equal(
			aggregation_band(layer({ "name": 'c', "analysis": { "aggregation": 'SUM' } }, csv)),
			'DATA_BAND',
		);
		assert.equal(
			aggregation_band(layer({ "name": 'c', "analysis": { "aggregation": 'AVG' } }, csv)),
			'DATA_BAND',
		);
	});
});

// ---------------------------------------------------- aggregate / collect_values
// aggregate(), collect_values() and area_results() are module-private; they
// are exercised here through their only caller, aggregate_layer_values(),
// which is the exact path the Data-tab cards and popup use.

describe('aggregate_layer_values (aggregate, collect_values)', () => {
	// A raster layer with per-band values per cell.
	const layer = (over: any = {}): any => {
		const values = over.values ?? [0.5, 0.25, 0.75, 0.5];
		const agg = over.agg ?? 'AVG';

		const out: any = {
			"id":   over.id ?? 'L',
			"name": over.name ?? 'Layer',
			"category": {
				"name":     over.category_name ?? 'crop',
				"unit":     't',
				"analysis": { "aggregation": agg },
			},
			"raster": {
				"data":    values,
				"sum":     over.sum_values ?? values,
				"average": values,
				"nodata":  NO,
			},
		};

		if (over.csv) out.csv = over.csv;
		if (over.no_analysis) out.category = { "name": out.category.name, "unit": 't' };

		return out;
	};

	const division = (data: number[]) => ({ "raster": { "data": data } });

	it('SUM adds up the collected cells of each area, AVG averages them (band selection end to end)', async () => {
		// SUM datasets read the `sum` band, AVG datasets the `average` band:
		// give the two bands different numbers so the choice is visible.
		set_state([
			layer({ "id": 'sum', "agg": 'SUM', "sum_values": [1, 2, 3, 4] }),
			layer({ "id": 'avg', "agg": 'AVG', "values": [0.5, 0.25, 0.75, 0.5] }),
		]);

		const out = await aggregate_layer_values(division([1, 1, 2, 2]));

		assert.deepEqual(out['sum'], {
			"name":           'Layer',
			"unit":           't',
			"is_point_layer": false,
			"aggregation":    'SUM',
			"areas": {
				"1": { "result": { "type": 'scalar', "value": 3 } },     // 1+2
				"2": { "result": { "type": 'scalar', "value": 7 } },     // 3+4
			},
		});
		assert.deepEqual(out['avg'].areas, {
			"1": { "result": { "type": 'scalar', "value": 0.375 } },    // (0.5+0.25)/2
			"2": { "result": { "type": 'scalar', "value": 0.625 } },    // (0.75+0.5)/2
		});
	});

	it('collect_values skips nodata cells and cells outside every area', async () => {
		// Nodata cells never reach the aggregate.
		set_state([layer({ "id": 'l', "agg": 'SUM', "values": [0.5, NO, 0.25, 0.75] })]);
		let out = await aggregate_layer_values(division([1, 1, 1, 2]));
		assert.deepEqual(out['l'].areas, {
			"1": { "result": { "type": 'scalar', "value": 0.75 } },     // NO skipped
			"2": { "result": { "type": 'scalar', "value": 0.75 } },
		});

		// Cells with division id -1 are not collected either (note id 0 is a
		// legitimate area id and must be collected).
		set_state([layer({ "id": 'l', "agg": 'AVG', "values": [0.5, 0.9, 0.25, 0.9, 0.75] })]);
		out = await aggregate_layer_values(division([1, -1, 1, -1, 0]));
		assert.deepEqual(out['l'].areas, {
			"1": { "result": { "type": 'scalar', "value": 0.375 } },    // (0.5+0.25)/2
			"0": { "result": { "type": 'scalar', "value": 0.75 } },
		});
	});

	it('empty areas: AVG yields a null result, SUM yields 0', async () => {
		set_state([
			layer({ "id": 'avg', "agg": 'AVG', "values": [NO, NO] }),
			layer({ "id": 'sum', "agg": 'SUM', "values": [NO, NO] }),
		]);

		const out = await aggregate_layer_values(division([1, 2]));

		assert.deepEqual(out['avg'].areas, {
			"1": { "result": null },
			"2": { "result": null },
		});
		assert.deepEqual(out['sum'].areas, {
			"1": { "result": { "type": 'scalar', "value": 0 } },
			"2": { "result": { "type": 'scalar', "value": 0 } },
		});
	});

	it('unknown or missing aggregation config falls back to averaging', async () => {
		set_state([
			layer({ "id": 'med', "agg": 'MEDIAN', "values": [0.5, 0.25, 0.75] }),
			layer({ "id": 'none', "no_analysis": true, "values": [0.5, 0.25, 0.75] }),
		]);

		const out = await aggregate_layer_values(division([1, 1, 1]));

		assert.equal(out['med'].aggregation, 'MEDIAN');
		assert.deepEqual(out['med'].areas, { "1": { "result": { "type": 'scalar', "value": 0.5 } } });
		assert.equal(out['none'].aggregation, 'AVG');
		assert.deepEqual(out['none'].areas, { "1": { "result": { "type": 'scalar', "value": 0.5 } } });
	});

	it('csv lookup resolves category codes and drops non-numeric results before aggregating', async () => {
		// Categorical datasets aggregate the near band (their values are
		// category codes), then resolve each code through the csv table.
		// Declared SUM proves the aggregation still applies after lookup.
		set_state([layer({
			"id":  'csv',
			"agg": 'SUM',
			"values": [1, 2, 3, 9],          // category codes (near band)
			"sum_values": [0.001, 0.001, 0.001, 0.001],  // not read for csv
			"csv": { "key": 1, "table": { "1": 10, "2": 'not-a-number', "3": 30 } },
		})]);

		const out = await aggregate_layer_values(division([5, 5, 5, 5]));

		// Codes 2 (non-numeric table value) and 9 (missing from the table)
		// are filtered out; 1 and 3 resolve to 10 and 30.
		assert.equal(out['csv'].aggregation, 'SUM');
		assert.deepEqual(out['csv'].areas, {
			"5": { "result": { "type": 'scalar', "value": 40 } },
		});
	});
});

// --------------------------------------------- run(): weights and clipping gate

describe('run(): weight computation and clipping gate', () => {
	it('named index: splits each index total over the single indexes that contributed', async () => {
		set_state([
			ds({ "id": 'a', "index": 'solar', "weight": 2 }),
			ds({ "id": 'b', "index": 'solar', "weight": 3 }),
			ds({ "id": 'c', "index": 'wind', "weight": 1 }),
			ds({ "id": 'd', "index": 'solar', "weight": 5, "analysis_scale": () => 'exclusion-buffer' }),
		]);

		const r = await run('solar');

		// tots: per-index weight sums (filters excluded). 'geo' has no
		// dataset and 'eai' is compound: neither shows up in totals.
		assert.deepEqual(r['totals'], { "solar": 5, "wind": 1 });

		// weight = d.weight / (tots[d.index] * contributing_singles) with
		// contributing_singles = 2 (solar, wind — not geo/eai).
		assert.deepEqual(r['weights'], {
			"a": 2 / (5 * 2),   // 0.2
			"b": 3 / (5 * 2),   // 0.3
			"c": 1 / (1 * 2),   // 0.5
			"d": 0,
		});

		// Sanity: weights sum to 1 here, cells rescaled over [min, max].
		assert.deepEqual(Array.from(r['raster']), [1, 1, 0, 0]);
		assert.equal(r['min'], 0.25);
		assert.equal(r['max'], 0.5);
		assert.equal(r['avg'], 0.375);
	});

	it('ani: splits every weight over the grand total of all indexes', async () => {
		set_state([
			ds({ "id": 'a', "index": 'solar', "weight": 2 }),
			ds({ "id": 'b', "index": 'solar', "weight": 3 }),
			ds({ "id": 'c', "index": 'wind', "weight": 1 }),
			ds({ "id": 'd', "index": 'solar', "weight": 5, "analysis_scale": () => 'exclusion-buffer' }),
		]);

		const r = await run('ani');

		// weight = d.weight / sum(tots) = d.weight / 6 — no per-index split.
		assert.deepEqual(r['totals'], { "solar": 5, "wind": 1 });
		assert.equal(r['weights']['a'], 2 / 6);
		assert.equal(r['weights']['b'], 3 / 6);
		assert.equal(r['weights']['c'], 1 / 6);
		assert.equal(r['weights']['d'], 0);
	});

	it('filter datasets are zeroed and never counted in totals (all three filter scales)', async () => {
		set_state([
			ds({ "id": 'x', "index": 'solar', "weight": 1 }),
			ds({ "id": 'k', "index": 'solar', "weight": 3, "analysis_scale": () => 'key-delta',
			     "_domain": { "min": 0, "max": 5 } }),
			ds({ "id": 'e', "index": 'solar', "weight": 4, "analysis_scale": () => 'exclusion-buffer' }),
			ds({ "id": 'i', "index": 'solar', "weight": 5, "analysis_scale": () => 'inclusion-buffer',
			     "_domain": { "min": 0, "max": 5 } }),
		]);

		const r = await run('solar');

		assert.deepEqual(r['totals'], { "solar": 1 });
		assert.deepEqual(r['weights'], { "x": 1, "k": 0, "e": 0, "i": 0 });
	});

	it('tots/singles splitting: zero-total single indexes drop out of the denominator', async () => {
		// 'geo' is a non-compound index whose only dataset has weight 0:
		// its total is 0, so it is deleted from singles/tots before the
		// denominator Object.keys(singles).length is taken (2, not 3).
		set_state([
			ds({ "id": 'a', "index": 'solar', "weight": 2 }),
			ds({ "id": 'b', "index": 'solar', "weight": 3 }),
			ds({ "id": 'c', "index": 'wind', "weight": 1 }),
			ds({ "id": 'e', "index": 'geo', "weight": 0 }),
		]);

		const r = await run('solar');

		assert.deepEqual(r['totals'], { "solar": 5, "wind": 1 });
		assert.equal(r['weights']['a'], 2 / (5 * 2));   // 0.2, NOT 2/(5*3)
		assert.equal(r['weights']['b'], 3 / (5 * 2));
		assert.equal(r['weights']['c'], 1 / (1 * 2));

		// Characterisation of a quirk: the zero-weight dataset's own weight
		// resolves against its deleted totals entry (0 / undefined) -> NaN,
		// which the zero-total gate treats as 0. Pinned as-is.
		assert.ok(Number.isNaN(r['weights']['e']));
	});

	it('clipping gate: scaled values outside [0, 1] and nodata cells annihilate to -1', async () => {
		// analysis_fn x => x/4 scales cells 1, 2, 10 to 0.25, 0.5, 2.5:
		// 2.5 is outside the analysis domain and gets CLIPPED (not clamped).
		// Cell 3 is nodata. Both end up -1 and drop out of min/max/avg.
		set_state([ds({
			"id":          'a',
			"index":       'solar',
			"weight":      1,
			"analysis_fn": () => (x: number) => x / 4,
			"raster":      { "data": new Float32Array([1, 2, 10, NO]), "nodata": NO },
		})]);

		const r = await run('solar');

		assert.deepEqual(r['weights'], { "a": 1 });
		assert.equal(r['min'], 0.25);
		assert.equal(r['max'], 0.5);
		assert.equal(r['avg'], 0.375);

		// Surviving cells are rescaled over [min, max] into [0, 1].
		assert.deepEqual(Array.from(r['raster']), [0, 1, -1, -1]);
	});

	it('a clipped cell stays -1 even when the other datasets score it', async () => {
		// Dataset 'a' clips cell 2 (0.75 * 2 = 1.5 > 1); dataset 'b' would
		// happily score it — once a cell is -1 the loop skips the rest.
		set_state([
			ds({
				"id":          'a',
				"index":       'solar',
				"weight":      1,
				"analysis_fn": () => (x: number) => x * 2,
				"raster":      { "data": new Float32Array([0.25, 0.5, 0.75]), "nodata": NO },
			}),
			ds({
				"id":          'b',
				"index":       'solar',
				"weight":      1,
				"analysis_fn": () => (x: number) => x,
				"raster":      { "data": new Float32Array([0.25, 0.5, 0.75]), "nodata": NO },
			}),
		], 3);

		const r = await run('solar');

		assert.deepEqual(r['weights'], { "a": 0.5, "b": 0.5 });
		assert.equal(r['min'], 0.375);   // 0.5*0.5 + 0.25*0.5
		assert.equal(r['max'], 0.75);    // 1*0.5 + 0.5*0.5
		assert.equal(r['avg'], 0.5625);
		assert.deepEqual(Array.from(r['raster']), [0, 1, -1]);
	});

	it('gates: only filters / empty list / zero total weight return a bare -1 raster', async () => {
		// Nothing but filters: a filter-only "analysis" would be a silly
		// single-valued plot, so run() bails out with just the transparent
		// raster (no weights/totals/min/max/avg keys at all).
		set_state([ds({ "id": 'd', "analysis_scale": () => 'exclusion-buffer' })]);
		let r: any = await run('solar');
		assert.deepEqual(Object.keys(r), ['raster']);
		assert.deepEqual(Array.from(r['raster']), [-1, -1, -1, -1]);

		// No eligible datasets at all takes the same path.
		set_state([]);
		r = await run('solar');
		assert.deepEqual(Object.keys(r), ['raster']);
		assert.deepEqual(Array.from(r['raster']), [-1, -1, -1, -1]);

		// Total weight 0 (a dataset that feeds no index): "ciao".
		set_state([ds({ "id": 'z', "index": null, "weight": 3 })]);
		r = await run('solar');
		assert.deepEqual(Object.keys(r), ['raster']);
		assert.deepEqual(Array.from(r['raster']), [-1, -1, -1, -1]);
	});
});
