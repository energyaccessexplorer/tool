import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Characterisation tests for the pure pieces of tool/src/analysis.js: every
// number here pins behaviour, so a failure means behaviour changed — do not
// "fix" the expectation.
//
// analysis.js is browser code, so the shims below stand in for what the app
// provides globally:
//   - STATE / OUTLINE / EAE / GEOGRAPHY: free variables read by run() and
//     aggregate_layer_values();
//   - d3: the d3 v5 bundle the app ships (tool/lib/d3.js), installed as a
//     global (run() calls d3.scaleLinear, and area-scores.ts builds its
//     colour ramp with d3.interpolateMagma);
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
const by_area: any             = scores.aggregate_by_area;
const area_score_table: any    = scores.area_score_table;
const area_score_strategy: any = scores.area_score_strategy;
const AREA_SCORE_FLOOR: number = scores.AREA_SCORE_FLOOR;
const has_priority_score: any  = scores.has_priority_score;
const analysed_mask: any       = scores.analysed_mask;
const criteria_pass_mask: any  = scores.criteria_pass_mask;
const aggregation_band: any    = scores.aggregation_band;
const jenks_breaks: any        = scores.jenks_breaks;
const bucket_in_edges: any     = scores.bucket_in_edges;
const aggregate_layer_values: any = analysis.aggregate_layer_values;

// ---------------------------------------------------------------- helpers

const near = (actual: number, expected: number, message?: string) =>
	assert.ok(Math.abs(actual - expected) < 1e-12,
	          message ?? `expected ${expected}, got ${actual}`);

// The app's raster nodata marker.
const NO = -9999;

// Rescaling into a Float32Array can leave the minimum a hair below zero.
const TINY_NEG = -1.6e-8;

// A dataset as run()'s datasets() sees it. Values outside [0, 1] are
// clipped by run(), not clamped.
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

// Non-compound indexes are run()'s "singles"; eai is compound and must
// never appear in totals or singles.
g['EAE'] = { "indexes": {
	"solar": { "compound": [] },
	"wind":  { "compound": [] },
	"geo":   { "compound": [] },
	"eai":   { "compound": ['solar', 'wind'] },
}};
g['GEOGRAPHY'] = { "divisions": {} };

// --------------------------------------------------------------- by_area

describe('by_area', () => {
	it('sums and averages each area over its own cells, ids stringified', () => {
		const out = by_area([0.25, 0.75, 0.5, 0.25, 0.5], [7, 7, 7, 9, 9]);

		assert.deepEqual(Object.keys(out), ['7', '9']);
		assert.deepEqual(out['7'], { "sum": 1.5, "average": 0.5 });    // 0.25+0.75+0.5
		assert.deepEqual(out['9'], { "sum": 0.75, "average": 0.375 }); // 0.25+0.5
	});

	it('skips cells with no division (-1) and cells the analysis clipped (-1)', () => {
		assert.deepEqual(
			by_area([0.5, 0.75, 0.25], [1, -1, 1]),
			{ "1": { "sum": 0.75, "average": 0.375 } },
		);

		assert.deepEqual(
			by_area([0.5, -1, 0.25], [1, 1, 1]),
			{ "1": { "sum": 0.75, "average": 0.375 } },
		);

		// An area with only skipped cells is omitted entirely.
		assert.deepEqual(by_area([-1, -1], [2, 2]), {});
	});

	it('keeps tiny-negative rescale artefacts, though has_priority_score rejects them', () => {
		const lone = by_area([TINY_NEG], [4]);
		assert.equal(lone['4'].sum, TINY_NEG);
		assert.equal(lone['4'].average, TINY_NEG);

		const mixed = by_area([TINY_NEG, 0.5], [4, 4]);
		near(mixed['4'].sum, 0.499999984);      // 0.5 - 1.6e-8
		near(mixed['4'].average, 0.249999992);  // (0.5 - 1.6e-8) / 2

		assert.equal(has_priority_score(TINY_NEG), false);
	});
});

// ------------------------------------------------------------------ jenks

// Natural breaks: the edges a tier's own score distribution yields, and the
// bucket lookup into them.
describe('jenks_breaks / bucket_in_edges', () => {
	it('edges run from the minimum to the maximum, non-decreasing', () => {
		const edges = jenks_breaks([0.05, 0.1, 0.12, 0.3, 0.31, 0.6, 1], 5);

		assert.equal(edges.length, 6);
		near(edges[0], 0.05);
		near(edges[5], 1);

		for (let e = 1; e < edges.length; e++) assert.ok(edges[e] >= edges[e - 1]);
	});

	it('reaches High when the top class holds one value', () => {
		// The score stretch pins the top area at exactly 1, and a long tail
		// leaves it alone in the last class: that class's lower edge IS the
		// maximum, so nothing lower than it is High and nothing else is either.
		const values = [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.09, 0.1, 1];
		const edges = jenks_breaks(values, 5);

		near(edges[4], 1);
		assert.equal(bucket_in_edges(1, edges)?.label, 'High');
		assert.equal(bucket_in_edges(0.1, edges)?.label, 'Medium-High');
		assert.equal(bucket_in_edges(0.01, edges)?.label, 'Low');
	});

	it('a value on an interior edge joins the class above it', () => {
		const edges = jenks_breaks([0.05, 0.1, 0.12, 0.3, 0.31, 0.6, 1], 5);

		assert.equal(bucket_in_edges(0.05, edges)?.label, 'Low');
		assert.equal(bucket_in_edges(0.1, edges)?.label, 'Low-Medium');
		assert.equal(bucket_in_edges(0.3, edges)?.label, 'Medium');
		assert.equal(bucket_in_edges(0.6, edges)?.label, 'Medium-High');
		assert.equal(bucket_in_edges(1, edges)?.label, 'High');
	});

	it('reads nothing from a missing or nodata value', () => {
		const edges = [0, 0.5, 1];

		assert.equal(bucket_in_edges(null, edges), null);
		assert.equal(bucket_in_edges(undefined, edges), null);
		assert.equal(bucket_in_edges(-1, edges), null);
	});
});

// ---------------------------------------------------------- area_score_table

// ----------------------------------------------------- area_score_strategy

describe('area_score_strategy — stretched to 1..100 over the areas present', () => {
	// The strategy's input: the cell-score aggregate per area.
	const area = (sum: number, average = sum) => ({ sum, average });

	it('the top area reads 1, the lowest the floor, the rest linearly between', () => {
		const out = area_score_strategy('cell_mean', { "a": area(9, 0.4), "b": area(9, 0.3), "c": area(9, 0.2) });

		assert.equal(out['a'], 1);
		assert.equal(out['c'], AREA_SCORE_FLOOR);
		near(out['b']!, AREA_SCORE_FLOOR + ((1 - AREA_SCORE_FLOOR) / 2));
	});

	it('the lowest area keeps a priority score (1%), so the listing keeps it', () => {
		const out = area_score_strategy('cell_mean', { "a": area(1, 0.9), "b": area(1, 0) });

		assert.equal(out['b'], 0.01);
		assert.equal(has_priority_score(out['b']), true);
	});

	it('cell_mean ranks by the average, so size drops out', () => {
		const out = area_score_strategy('cell_mean', { "wide": area(1.2, 0.4), "dense": area(0.9, 0.9) });

		assert.equal(out['dense'], 1);
		assert.equal(out['wide'], AREA_SCORE_FLOOR);
	});

	it('pixel_sum ranks by the score mass, so size counts', () => {
		const out = area_score_strategy('pixel_sum', { "wide": area(1.2, 0.4), "dense": area(0.9, 0.9) });

		assert.equal(out['wide'], 1);
		assert.equal(out['dense'], AREA_SCORE_FLOOR);
	});

	it('equal raw scores all read 1 instead of dividing by zero', () => {
		assert.deepEqual(area_score_strategy('cell_mean', { "a": area(0, 0), "b": area(0, 0) }), { "a": 1, "b": 1 });
		assert.deepEqual(area_score_strategy('cell_mean', { "a": area(5, 0.3) }), { "a": 1 });
	});

	it('a Float32 bottom-band aggregate still reads the floor, never below it', () => {
		const out = area_score_strategy('cell_mean', { "a": area(TINY_NEG), "b": area(0.5) });

		assert.equal(out['a'], AREA_SCORE_FLOOR);
		assert.equal(out['b'], 1);
	});
});

describe('area_score_strategy — layer_totals (aggregate first, normalise after)', () => {
	const cells = (...ids: string[]) => Object.fromEntries(ids.map(id => [id, { "sum": 0, "average": 0 }]));
	const scalar = (value: number) => ({ "type": 'scalar', value });
	const pop = { "id": 'pop', "weight": 1, "invert": false };

	it('min-max normalises the layer totals: lowest at the floor, highest at 1', () => {
		// The PO's QGIS norm_sum: (total - lowest) / (highest - lowest).
		const totals = {
			"kampala":  { "pop": scalar(6037274) },
			"busoga":   { "pop": scalar(4660650) },
			"karamoja": { "pop": scalar(1272357) },
		};
		const out = area_score_strategy('layer_totals', cells('kampala', 'busoga', 'karamoja'), totals, [pop]);

		assert.equal(out['kampala'], 1);
		assert.equal(out['karamoja'], AREA_SCORE_FLOOR);
		assert.ok(Math.abs(out['busoga']! - (AREA_SCORE_FLOOR + ((1 - AREA_SCORE_FLOOR) * 0.711))) < 1e-3);
	});

	it('the total outranks density: a big populous area beats a small dense one', () => {
		const totals = { "big": { "pop": scalar(6) }, "dense": { "pop": scalar(2.5) } };
		const dense_cells = { "big": { "sum": 1, "average": 0.4 }, "dense": { "sum": 1, "average": 0.9 } };
		const out = area_score_strategy('layer_totals', dense_cells, totals, [pop]);

		assert.equal(out['big'], 1);
		assert.equal(out['dense'], AREA_SCORE_FLOOR);
	});

	it('weighs each layer\'s normalised share, flipping invert layers', () => {
		const totals = {
			"a": { "pop": scalar(10), "dist": scalar(5) },
			"b": { "pop": scalar(0),  "dist": scalar(1) },
			"c": { "pop": scalar(5),  "dist": scalar(3) },
		};
		const dist = { "id": 'dist', "weight": 3, "invert": true };
		const out = area_score_strategy('layer_totals', cells('a', 'b', 'c'), totals, [pop, dist]);

		// a: pop 1, dist flipped 0 -> 1/4; b: pop 0, dist flipped 1 -> 3/4;
		// c: 0.5 and 0.5 -> 1/2. Stretched: b top, a floor, c halfway.
		assert.equal(out['b'], 1);
		assert.equal(out['a'], AREA_SCORE_FLOOR);
		near(out['c']!, AREA_SCORE_FLOOR + ((1 - AREA_SCORE_FLOOR) / 2));
	});

	it('never flips a feature count, even on an invert layer', () => {
		const totals = { "a": { "hf": { "type": 'points', "value": 368 } }, "b": { "hf": { "type": 'points', "value": 3 } } };
		const out = area_score_strategy('layer_totals', cells('a', 'b'), totals, [{ "id": 'hf', "weight": 1, "invert": true }]);

		assert.equal(out['a'], 1);
		assert.equal(out['b'], AREA_SCORE_FLOOR);
	});

	it('a signed layer normalises from its observed minimum, never below the floor', () => {
		const totals = { "a": { "rwi": scalar(-0.8) }, "b": { "rwi": scalar(0.4) }, "c": { "rwi": scalar(-0.2) } };
		const out = area_score_strategy('layer_totals', cells('a', 'b', 'c'), totals, [{ "id": 'rwi', "weight": 1, "invert": false }]);

		assert.equal(out['b'], 1);
		assert.equal(out['a'], AREA_SCORE_FLOOR);
		near(out['c']!, AREA_SCORE_FLOOR + ((1 - AREA_SCORE_FLOOR) / 2));
	});

	it('skips weightless and flat layers, and non-numeric aggregates', () => {
		const totals = {
			"a": { "pop": scalar(4), "flat": scalar(7), "off": scalar(100), "na": { "value": 'Not aggregated' } },
			"b": { "pop": scalar(2), "flat": scalar(7), "off": scalar(0),   "na": { "value": 'Not aggregated' } },
		};
		const layers = [pop, { "id": 'flat', "weight": 5, "invert": false }, { "id": 'off', "weight": 0, "invert": false }, { "id": 'na', "weight": 1, "invert": false }];
		const out = area_score_strategy('layer_totals', cells('a', 'b'), totals, layers);

		assert.equal(out['a'], 1);
		assert.equal(out['b'], AREA_SCORE_FLOOR);
	});

	it('an area without analysed cells reads the floor and does not move the stretch', () => {
		const totals = { "a": { "pop": scalar(10) }, "b": { "pop": scalar(5) }, "c": { "pop": scalar(0) } };
		const out = area_score_strategy('layer_totals', cells('a', 'b', 'c', 'empty'), totals, [pop]);

		assert.equal(out['empty'], AREA_SCORE_FLOOR);
		near(out['b']!, AREA_SCORE_FLOOR + ((1 - AREA_SCORE_FLOOR) / 2));
	});

	it('one analysed area reads 1, the unanalysed ones the floor', () => {
		const out = area_score_strategy('layer_totals', cells('a', 'b'), { "a": { "pop": scalar(3) } }, [pop]);

		assert.deepEqual(out, { "a": 1, "b": AREA_SCORE_FLOOR });
	});
});

describe('area_score_table', () => {
	const area = (sum: number, average = sum) => ({ sum, average });

	it("publishes the strategy's score and its ONE-scale bucket", () => {
		const table = area_score_table({ "7": area(1, 0.2), "9": area(1, 0.9), "4": area(1, 0.55) }, {}, [], 'cell_mean');

		assert.equal(table['9']?.score, 1);
		assert.equal(table['9']?.bucket?.label, 'High');
		assert.equal(table['7']?.score, AREA_SCORE_FLOOR);
		assert.equal(table['7']?.bucket?.label, 'Low');
		near(table['4']!.score, AREA_SCORE_FLOOR + ((1 - AREA_SCORE_FLOOR) / 2));
		assert.equal(table['4']?.bucket?.label, 'Medium');
	});

	it('empty input is an empty table; layer_totals is the default', () => {
		assert.deepEqual(area_score_table({}), {});

		const pop = { "id": 'pop', "weight": 1, "invert": false };
		const table = area_score_table(
			{ "1": area(100, 0.9), "2": area(1, 0.1) },
			{ "1": { "pop": { "type": 'scalar', "value": 2 } }, "2": { "pop": { "type": 'scalar', "value": 8 } } },
			[pop],
		);
		assert.equal(table['2']?.score, 1);
		assert.equal(table['1']?.score, AREA_SCORE_FLOOR);
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

// ------------------------------------------- analysed_mask / criteria_pass_mask

// The one "analysed cells" rule every card aggregates with: the
// has_priority_score rule applied over a whole raster.
describe('analysed_mask', () => {
	it('is the ONE "analysed cells" rule: exactly the has_priority_score cells', () => {
		const out = analysed_mask([0.5, 0, -1, TINY_NEG, 1]);

		assert.deepEqual([...out], [1, 0, 0, 0, 1]);
	});

	it('drops exact zeros and the Float32 bottom band (the deck rule kept both)', () => {
		// Zeros and the bottom-band artefact are dropped deliberately, so
		// every card aggregates the same cells.
		assert.deepEqual([...analysed_mask([0, TINY_NEG])], [0, 0]);
	});

	it('counts every positive cell, including the clipped marker boundary', () => {
		assert.deepEqual([...analysed_mask([-1, -1, Number.MIN_VALUE, 0.4])], [0, 0, 1, 1]);
	});

	it('is all zeros for a filters-only (all -1) raster', () => {
		assert.deepEqual([...analysed_mask([-1, -1, -1, -1])], [0, 0, 0, 0]);
	});
});

describe('criteria_pass_mask', () => {
	// Identity score: the clip gate (sv < 0 || sv > 1) is the whole
	// criterion, so only cells in [0, 1] pass.
	const layer = (data: number[]): any => ({
		"data":   data,
		"nodata": NO,
		"score":  (x: number) => x,
	});

	it('keeps every cell that passes every layer criterion (pure loop of criteria_mask)', () => {
		const out = criteria_pass_mask(4, [layer([0.5, -0.3, 1.2, 0.5])]);

		assert.deepEqual([...out], [1, 0, 0, 1]);
	});

	it('is DELIBERATELY not analysed_mask: a zero-scoring passing cell stays visible', () => {
		// Cell 0 passes the criterion but scores 0: the display mask keeps
		// it, analysed_mask drops it — folding the two would change which
		// cells grey out.
		const cells = [0, 0.5];
		const criteria = criteria_pass_mask(2, [layer([0, 0.5])]);

		assert.deepEqual([...criteria], [1, 1]);
		assert.deepEqual([...analysed_mask(cells)], [0, 1]);
	});

	it('drops cells that are nodata for any layer', () => {
		assert.deepEqual([...criteria_pass_mask(3, [layer([0.5, NO, 0.5])])], [1, 0, 1]);
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
// aggregate(), collect_values() and area_results() are module-private:
// exercised through their only caller, aggregate_layer_values() — the path
// the Data-tab cards and popup use.

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
		// SUM reads the `sum` band, AVG the `average` band; different numbers
		// make the choice visible.
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
		set_state([layer({ "id": 'l', "agg": 'SUM', "values": [0.5, NO, 0.25, 0.75] })]);
		let out = await aggregate_layer_values(division([1, 1, 1, 2]));
		assert.deepEqual(out['l'].areas, {
			"1": { "result": { "type": 'scalar', "value": 0.75 } },     // NO skipped
			"2": { "result": { "type": 'scalar', "value": 0.75 } },
		});

		// Cells with division id -1 are not collected; id 0 is a legitimate
		// area id and is.
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
		// Categorical datasets aggregate the near band (category codes), then
		// resolve each code through the csv table — SUM still applies after
		// the lookup.
		set_state([layer({
			"id":  'csv',
			"agg": 'SUM',
			"values": [1, 2, 3, 9],          // category codes (near band)
			"sum_values": [0.001, 0.001, 0.001, 0.001],  // not read for csv
			"csv": { "key": 1, "table": { "1": 10, "2": 'not-a-number', "3": 30 } },
		})]);

		const out = await aggregate_layer_values(division([5, 5, 5, 5]));

		// Codes 2 (non-numeric table value) and 9 (missing) are filtered out;
		// 1 and 3 resolve to 10 and 30.
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

		// Totals are per-index weight sums (filters excluded): 'geo' has no
		// dataset and 'eai' is compound, so neither appears.
		assert.deepEqual(r['totals'], { "solar": 5, "wind": 1 });

		// weight = d.weight / (tots[d.index] * contributing_singles), with
		// contributing_singles = 2 (solar and wind, not geo/eai).
		assert.deepEqual(r['weights'], {
			"a": 2 / (5 * 2),   // 0.2
			"b": 3 / (5 * 2),   // 0.3
			"c": 1 / (1 * 2),   // 0.5
			"d": 0,
		});

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
		// 'geo' is non-compound with a single zero-weight dataset, so its
		// total is 0 and it is deleted before the denominator
		// Object.keys(singles).length is taken (2, not 3).
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

		// Quirk, pinned as-is: the zero-weight dataset's own weight is
		// 0 / undefined -> NaN, which the zero-total gate treats as 0.
		assert.ok(Number.isNaN(r['weights']['e']));
	});

	it('clipping gate: scaled values outside [0, 1] and nodata cells annihilate to -1', async () => {
		// x => x/4 scales cells 1, 2, 10 to 0.25, 0.5, 2.5: 2.5 is outside
		// [0, 1] and gets CLIPPED (not clamped), cell 3 is nodata, and both
		// end up -1 and drop out of min/max/avg.
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

		assert.deepEqual(Array.from(r['raster']), [0, 1, -1, -1]);
	});

	it('a clipped cell stays -1 even when the other datasets score it', async () => {
		// Dataset 'a' clips cell 2 (0.75 * 2 = 1.5 > 1); dataset 'b' would
		// score it, but once a cell is -1 the loop skips the rest.
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
		// A filter-only analysis would be a single-valued plot, so run() bails
		// out with just the raster (no weights/totals/min/max/avg).
		set_state([ds({ "id": 'd', "analysis_scale": () => 'exclusion-buffer' })]);
		let r: any = await run('solar');
		assert.deepEqual(Object.keys(r), ['raster']);
		assert.deepEqual(Array.from(r['raster']), [-1, -1, -1, -1]);

		set_state([]);
		r = await run('solar');
		assert.deepEqual(Object.keys(r), ['raster']);
		assert.deepEqual(Array.from(r['raster']), [-1, -1, -1, -1]);

		set_state([ds({ "id": 'z', "index": null, "weight": 3 })]);
		r = await run('solar');
		assert.deepEqual(Object.keys(r), ['raster']);
		assert.deepEqual(Array.from(r['raster']), [-1, -1, -1, -1]);
	});
});
