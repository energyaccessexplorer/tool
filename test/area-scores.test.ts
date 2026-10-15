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
const division_averages: any   = scores.aggregate_by_area;
const score_bucket: any        = scores.score_bucket;
const score_bands: any         = scores.score_bands;
const area_score_table: any    = scores.area_score_table;
const area_score_strategy: any = scores.area_score_strategy;
const has_priority_score: any  = scores.has_priority_score;
const analysed_mask: any       = scores.analysed_mask;
const criteria_pass_mask: any  = scores.criteria_pass_mask;
const aggregation_band: any    = scores.aggregation_band;
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

// ------------------------------------------------------- division_averages

describe('division_averages', () => {
	it('averages each area over its own cells (sum / count), ids stringified', () => {
		const out = division_averages([0.25, 0.75, 0.5, 0.25, 0.5], [7, 7, 7, 9, 9]);

		assert.deepEqual(Object.keys(out), ['7', '9']);
		assert.deepEqual(out['7'], { "average": 0.5 });    // (0.25+0.75+0.5)/3
		assert.deepEqual(out['9'], { "average": 0.375 });  // (0.25+0.5)/2
	});

	it('skips cells with no division (-1) and cells the analysis clipped (-1)', () => {
		assert.deepEqual(
			division_averages([0.5, 0.75, 0.25], [1, -1, 1]),
			{ "1": { "average": 0.375 } },  // (0.5+0.25)/2
		);

		assert.deepEqual(
			division_averages([0.5, -1, 0.25], [1, 1, 1]),
			{ "1": { "average": 0.375 } },
		);

		// An area with only skipped cells is omitted entirely.
		assert.deepEqual(division_averages([-1, -1], [2, 2]), {});
	});

	it('keeps tiny-negative rescale artefacts in the average, though has_priority_score rejects them', () => {
		const lone = division_averages([TINY_NEG], [4]);
		assert.equal(lone['4'].average, TINY_NEG);

		const mixed = division_averages([TINY_NEG, 0.5], [4, 4]);
		near(mixed['4'].average, 0.249999992);  // (0.5 - 1.6e-8) / 2

		assert.equal(has_priority_score(TINY_NEG), false);
		assert.equal(has_priority_score(lone['4'].average), false);
	});
});

// ------------------------------------------------------------- score_bucket

// The one score -> {bucket, label, colour} mapping: fixed 20% bands over
// [0, 1], so a label depends on the score alone and never on the other
// areas in view.
describe('score_bucket', () => {
	it('is fixed 20% bands over [0, 1], exact boundary to the upper band', () => {
		assert.equal(score_bucket(0)?.label, 'Low');
		assert.equal(score_bucket(0.19)?.label, 'Low');
		assert.equal(score_bucket(0.2)?.label, 'Low-Medium');
		assert.equal(score_bucket(0.39)?.label, 'Low-Medium');
		assert.equal(score_bucket(0.4)?.label, 'Medium');
		assert.equal(score_bucket(0.5)?.label, 'Medium');
		assert.equal(score_bucket(0.59)?.label, 'Medium');
		assert.equal(score_bucket(0.6)?.label, 'Medium-High');
		assert.equal(score_bucket(0.79)?.label, 'Medium-High');
		assert.equal(score_bucket(0.8)?.label, 'High');
		assert.equal(score_bucket(0.999)?.label, 'High');
		assert.equal(score_bucket(1)?.label, 'High');
	});

	it('carries {index, label, colour}: the band slot and the ramp stop', () => {
		const b = score_bucket(0.65);

		assert.equal(b?.index, 3);
		assert.equal(b?.label, 'Medium-High');
		assert.equal(score_bands[b?.index], b?.label);
		assert.equal(b?.colour, scores.analysis_colorscale.stops[3]);

		for (const [i, v] of [0.1, 0.3, 0.5, 0.7, 0.9].entries()) {
			const band = score_bucket(v);
			assert.equal(band?.index, i);
			assert.equal(band?.label, score_bands[i]);
			assert.equal(band?.colour, scores.analysis_colorscale.stops[i]);
		}
	});

	it('clamps out-of-range scores into the outer bands (like the retired scales)', () => {
		assert.equal(score_bucket(-5)?.label, 'Low');
		assert.equal(score_bucket(2)?.label, 'High');
	});

	it('bands the Float32 bottom band as Low, unlike has_priority_score', () => {
		assert.equal(score_bucket(TINY_NEG)?.label, 'Low');
		assert.equal(has_priority_score(TINY_NEG), false);
	});

	it('null rule: missing values, the -1 nodata marker and non-finite scores', () => {
		assert.equal(score_bucket(null), null);
		assert.equal(score_bucket(undefined), null);
		assert.equal(score_bucket(-1), null);
		assert.equal(score_bucket(NaN), null);
		assert.equal(score_bucket(Infinity), null);
		assert.equal(score_bucket(-Infinity), null);
	});

	it('no relative stretch between the areas in view', () => {
		assert.equal(score_bucket(0.461)?.label, 'Medium');     // maize report NAMISINDWA 46.1%
		assert.equal(score_bucket(0.27)?.label, 'Low-Medium');  // KAMULI 27.0%
		assert.equal(score_bucket(0.5)?.label, 'Medium');
	});
});

// ---------------------------------------------------------- area_score_table

// ----------------------------------------------------- area_score_strategy

describe('area_score_strategy — total vs intensity', () => {
	const ds = (id: string, weight = 1, invert = false) => ({ id, weight, invert });

	it("intensity mode returns the per-area cell averages unchanged (the flip back)", () => {
		const out = area_score_strategy('intensity', { "7": 0.2, "9": 0.9 }, {}, [ds('maize')]);
		assert.deepEqual(out, { "7": 0.2, "9": 0.9 });
	});

	it("total: one SUM layer scores share-of-max — the report's own figures", () => {
		// Real district maize totals (t): the top district reads 100%,
		// Kamuli 41.8%, Namisindwa 20.9%.
		const values = {
			"nakaseke":   { "maize": { "type": 'scalar', "value": 123192 } },
			"kamuli":     { "maize": { "type": 'scalar', "value": 51552 } },
			"namisindwa": { "maize": { "type": 'scalar', "value": 25734 } },
		};
		const out = area_score_strategy('total', {}, values, [ds('maize')]);

		assert.equal(out['nakaseke'], 1);
		assert.ok(Math.abs(out['kamuli']! - 51552 / 123192) < 1e-12);
		assert.ok(Math.abs(out['namisindwa']! - 25734 / 123192) < 1e-12);
		assert.ok(out['kamuli']! > out['namisindwa']!);
	});

	it("total: mixes SUM and AVG layers through the shared weights", () => {
		// Two datasets, one peaking in area a, the other in b: each
		// normalised, weighted 3:1, then share-of-max.
		const values = {
			"a": { "prod": { "type": 'scalar', "value": 90 }, "ghi": { "type": 'scalar', "value": 4 } },
			"b": { "prod": { "type": 'scalar', "value": 30 }, "ghi": { "type": 'scalar', "value": 8 } },
		};
		const out = area_score_strategy('total', {}, values, [ds('prod', 3), ds('ghi', 1)]);

		// a: 3*(90/90) + 1*(4/8) = 3.5; b: 3*(30/90) + 1*(8/8) = 2; best 3.5.
		assert.ok(Math.abs(out['a']! - 1) < 1e-12);
		assert.ok(Math.abs(out['b']! - 2 / 3.5) < 1e-12);
	});

	it("total: honouring invert flips the dataset's ranking", () => {
		const values = {
			"a": { "cost": { "type": 'scalar', "value": 10 } },
			"b": { "cost": { "type": 'scalar', "value": 30 } },
		};
		const out = area_score_strategy('total', {}, values, [ds('cost', 1, true)]);

		// shares: a = 1 - 10/30, b = 0; rescale by best.
		assert.equal(out['b'], 0);
		assert.equal(out['a'], 1);
	});

	it("total: a signed layer never scores below 0 and keeps its ranking (the RWI -22%)", () => {
		const values = {
			"richest":  { "rwi": { "type": 'scalar', "value": 1.31 } },
			"nakaseke": { "rwi": { "type": 'scalar', "value": -0.29 } },
			"poorest":  { "rwi": { "type": 'scalar', "value": -1 } },
		};
		const out = area_score_strategy('total', {}, values, [ds('rwi')]);

		assert.equal(out['richest'], 1);
		assert.ok(out['poorest']! >= 0);
		assert.ok(out['nakaseke']! > out['poorest']!);
	});

	it("total: a point layer counts up — the proximity raster's invert never flips it", () => {
		const values = {
			"kampala":   { "health": { "type": 'points', "value": 381 } },
			"karenga":   { "health": { "type": 'points', "value": 9 } },
			"nabilatuk": { "health": { "type": 'points', "value": 6 } },
		};
		const out = area_score_strategy('total', {}, values, [ds('health', 1, true)]);

		assert.equal(out['kampala'], 1);
		assert.ok(out['karenga']! > out['nabilatuk']!);
		assert.ok(out['nabilatuk']! > 0);
	});

	it("total: a dataset with no positive total is dropped and the rest renormalise", () => {
		const values = {
			"a": { "prod": { "type": 'scalar', "value": 2 }, "flat": { "type": 'scalar', "value": 0 } },
			"b": { "prod": { "type": 'scalar', "value": 1 }, "flat": { "type": 'scalar', "value": 0 } },
		};
		const out = area_score_strategy('total', {}, values, [ds('prod', 1), ds('flat', 3)]);

		// 'flat' carries no signal: 'prod' alone decides, share-of-max.
		assert.equal(out['a'], 1);
		assert.equal(out['b'], 0.5);
	});

	it("total: missing values count as 0; absent datasets and weights are safe", () => {
		const values = { "a": { "prod": { "type": 'scalar', "value": 4 } }, "b": {} };
		const out = area_score_strategy('total', {}, values, [
			ds('prod', 1), ds('ghost', 1), { "id": 'nan', "weight": NaN },
		]);

		assert.equal(out['a'], 1);
		assert.equal(out['b'], 0);
	});

	it("total: an area known only from intensities still scores (0 when it has no values)", () => {
		const out = area_score_strategy('total', { "7": 0.5, "9": 0.5 }, {
			"7": { "maize": { "type": 'scalar', "value": 5 } },
		}, [ds('maize')]);

		assert.equal(out['7'], 1);
		assert.equal(out['9'], 0);
	});

	it("total: ties share the top score; a flat field of real values does not collapse bands", () => {
		const out = area_score_strategy('total', {}, {
			"a": { "maize": { "type": 'scalar', "value": 8 } },
			"b": { "maize": { "type": 'scalar', "value": 8 } },
		}, [ds('maize')]);

		assert.equal(out['a'], 1);
		assert.equal(out['b'], 1);
	});
});

describe('area_score_table', () => {
	it("publishes the strategy's score and its ONE-scale bucket (total by default)", () => {
		const table = area_score_table(
			{ "7": 0.2, "9": 0.9 },
			{
				"7": { "maize": { "type": 'scalar', "value": 5 } },
				"9": { "maize": { "type": 'scalar', "value": 10 } },
			},
			[{ "id": 'maize', "weight": 1 }],
		);

		// 10/10 -> High; 0.5 lands exactly on the Medium boundary and must
		// stay Medium, not Low-Medium.
		assert.equal(table['9']?.score, 1);
		assert.equal(table['9']?.bucket?.label, 'High');
		assert.equal(table['7']?.score, 0.5);
		assert.equal(table['7']?.bucket?.label, 'Medium');
	});

	it("keeps the legacy empty-table case and the score_bucket null rule", () => {
		assert.deepEqual(area_score_table({}, {}, []), {});
		assert.deepEqual(area_score_table({ "1": 0.5 }, {}, [], 'intensity' as never), {
			"1": { "score": 0.5, "bucket": score_bucket(0.5) },
		});
	});

	it("intensity mode buckets the per-area averages (including the Float32 bottom band)", () => {
		const table = area_score_table({ "7": 0.2, "9": 0.9, "4": TINY_NEG }, {}, [], 'intensity');

		assert.equal(table['7']?.bucket?.label, 'Low-Medium');
		assert.equal(table['9']?.bucket?.label, 'High');
		assert.equal(table['4']?.bucket?.label, 'Low');
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
