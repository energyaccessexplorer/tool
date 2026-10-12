import {
	uniform_split,
	colorscale,
	colorscale_svg,
	coordinates_to_raster_pixel,
	raster_pixel_to_coordinates,
} from './utils.js';

import {
	area_results,
	area_score_table,
	analysed_mask,
	collect_values,
	count_points,
	filter_types,
	has_priority_score,
	type AggregationDataset,
	weights_for,
} from './area-scores.ts';

import {
	createAnalysisService,
	foldNational,
	foldValues,
	type ResultKey,
	type ScoresPayload,
} from './analysis-state.ts';

import {
	outputcanvas as plot_outputcanvas,
} from './plot.js';

import {
	and,
	json_clone,
	maybe,
	until,
} from '../lib/helpers.js';

const inclusion_filters = ["key-delta", "inclusion-buffer"];

// The dataset rows run() and the aggregation code read: the DS registry's
// legacy shape (ds.js), narrowed to what this module touches. The boundary
// cast lives in datasets()/valid_layer_datasets(); everything below works
// against this interface.
interface AnalysisDataset {
	readonly id: string;
	readonly name?: string;
	readonly index?: string | null;
	readonly type?: string;
	readonly weight: number;
	readonly on?: boolean;
	readonly analysis?: {
		readonly indexes?: readonly { readonly index: string; readonly invert?: boolean }[];
	};
	readonly domain?: { readonly min: number; readonly max: number };
	readonly _domain?: { readonly min: number; readonly max: number };
	readonly _domain_select?: readonly number[];
	readonly category?: {
		readonly name?: string;
		readonly unit?: string | null;
		readonly analysis?: { readonly aggregation?: string };
	};
	readonly raster?: {
		readonly data?: RasterData | null;
		readonly nodata?: number;
		readonly sum?: RasterData;
		readonly average?: RasterData;
	};
	readonly csv?: {
		readonly key?: string | number | null;
		readonly table?: Record<string, unknown>;
	};
	readonly vectors?: {
		readonly shape_type?: string;
		readonly data?: unknown;
	};
	analysis_scale(type: string): string;
	analysis_fn(type: string): ((x: number) => number) | null;
	_afn?: (type: string) => (x: number) => number;
}

const analysis_low = 0.167;

export const analysis_colorscale = colorscale({
	"stops":  uniform_split(5).map(x => d3.interpolateMagma(analysis_low + (x * (1 - analysis_low)))),
	"domain": { "min": 0, "max": 1 },
});

export const analysis_colorscale_svg = colorscale_svg(analysis_colorscale.stops);

export const lowmedhigh_scale = d3.scaleQuantize()
	.domain([0,1])
	.range(["Low", "Low-Medium", "Medium", "Medium-High", "High"]);

/*
 * run
 *
 * @param "type" string. That can be one of:
 *   - ID of a dataset
 *   - index name
 *
 * returns an object {min, max, raster (FloatArray)}
 */

export default async function run(type: string) {
	const t0 = performance.now();

	const list = datasets(type);

	const it = new Float32Array(OUTLINE!.raster!.data.length).fill(-1);

	const dt = STATE.divtier;
	let divraster;
	if (dt > 0)
		divraster = maybe(GEOGRAPHY.divisions, dt, 'raster');

	// There's nothing interesting about an analysis with only filters. Also,
	// filters return 1 so a silly (single-valued) analysis would be plotted.
	//
	if (list.every(d => filter_types.includes(d.analysis_scale(type)))) return { "raster": it };

	// Per-dataset weights and per-index totals. The computation lives in
	// weights_for() (area-scores.ts) so run() and the future
	// area_score_strategy share one weights source.
	//
	const { weights, "totals": tots } = weights_for(type, list);

	// If the total weight is 0, ciao.
	//
	if (Object.keys(weights).reduce((a,c) => (weights[c] || 0) + a, 0) === 0)
		return { "raster": it };

	// Each dataset has a different scaling function. We cache these to optimise
	// the huge loop we are about to do.
	//
	const afns = list.map(d => d._afn!(type));

	// The values will be normalised. Initialise the values:
	//
	let min = 1;
	let max = 0;

	let avg_sum = 0;
	let avg_count = 0;

	// NOTICE: if there is only one dataset which has no weight in calculations
	// (boundaries with key-delta scale function, for example), we do NOT want an
	// fully black raster to show as the result. We return the transparent raster.
	// instead.
	//
	const full_weight = list
		.reduce((a,c) => ((c.analysis_scale(type) === "key-delta") ? a : c.weight + a), 0);

	if (list.find(l => !maybe(l, 'raster', 'data')))
		await until((_: unknown) => list.filter(d => d.on && d.raster && d.analysis && !d.raster.data).length === 0, Infinity);

	if (list.length === 1 && full_weight === 0) return { "raster": it };

	const sd = STATE.subdiv;
	const subdiv = and(typeof sd === 'number', divraster);

	for (let i = 0; i < it.length; i += 1) {
		let a = 0;

		if (subdiv && divraster.data[i] !== sd) a = -1;

		for (let j = 0; j < list.length; j += 1) {
			const c = list[j]!;

			// For the rest of the datasets, we 'annihilate' points that are already
			// as -1 (or nodata) since we wouldn't know what value to assign for the
			// analysis. In other words, if a dataset has a point has nodata, that
			// point is useless for the analysis as it is incomparable with other
			// datasets.
			//
			// We assume they have been clipped out.
			//
			if (a === -1) continue;

			const v = c.raster!.data![i] as number;
			if (v === c.raster!.nodata) {
				a = -1; continue;
			}

			const sv = afns[j]!(v);

			// Three options: within domain/range, clipping or clamping. This is where
			// the clipping happens. The clamping was done by the scaling function
			// above.
			//
			// If the scaling function clamped, the following will not happen. But if
			// the value falls outside our analysis domain, we clip it (-1 nodata).
			//
			if (sv < 0 || sv > 1) {
				a = -1; continue;
			}

			const w = weights[c.id];
			a = w ? (sv * w) + a : a;
		}

		// Record the new min/max values:
		//
		if (a !== -1) {
			if (a > max) max = a;
			if (a < min) min = a;

			avg_sum += a;
			avg_count++;
		}

		it[i] = a;
	}

	const f = d3.scaleLinear().domain([min,max]).range([0,1]);

	for (let i = 0; i < it.length; i += 1) {
		const r = it[i] as number;
		it[i] = (r === -1) ? -1 : f(r);
	}

	console.info("Finished analysis.run in:", performance.now() - t0, weights, tots);

	return {
		min,
		max,
		"avg":      avg_sum / avg_count,
		"raster":   it,
		"datasets": list,
		"totals":   tots,
		weights,
	};
};

/*
 * active_area_mask
 *
 * The area a card is scoped to — the sub-geography picked in "Change geography"
 * (STATE.divtier/STATE.subdiv), or the whole geography outline when none is
 * picked. Single definition of "the selected area" for every consumer:
 *   - the categorical distribution the raster-valued Data cards show
 *     (computeDistribution() in right-panel-data-tab.ts);
 *   - the universe the share cards total over (analyse() in summary.js).
 * Same rule run() clips the analysis raster with, so the cards stay in step with
 * the map. Returns the mask countPixels() reads: a raster whose cells name an
 * area, the id to match (undefined = every non-nodata cell), and its nodata.
 */
export function active_area_mask(): { data: RasterData; nodata: number; id: number | undefined } {
	const outline = OUTLINE!.raster.data;
	const nodata = OUTLINE!.raster.nodata;

	const dt = STATE.divtier;
	if (!(dt > 0 && typeof STATE.subdiv === 'number'))
		return { "data": outline, "nodata": nodata, "id": undefined };

	const div = maybe(GEOGRAPHY.divisions, dt, 'raster') as { data: RasterData; nodata: number } | undefined;
	if (!div?.data) return { "data": outline, "nodata": nodata, "id": undefined };

	return { "data": div.data, "nodata": div.nodata, "id": STATE.subdiv };
}

/*
 * datasets
 *
 * Select from DS collection datasets that are elegible for being part of an
 * analysis. Then, sort them to minimise calculation time.
 *
 * @param "type" string. That can be:
 *   - ID of a dataset, or
 *   - an index name
 *
 * returns DS to be plotted onto a canvas
 */

function datasets(type: string): AnalysisDataset[] {
	return (STATE.datasets as AnalysisDataset[])
		.filter(d => and(d.raster, d.analysis))
		.filter(d => {
			if (d.type === 'polygons-boundaries') return false;

			if (!and(d.domain, d._domain)) {
				console.debug(`Discarding '${d.id}'. Domain is not set yet.`);
				return false;
			}

			if (d._domain_select?.length)
				d._afn = (_: string) => (x: number) => (d._domain_select!.indexOf(x) > -1) ? 1 : -1;
			else if (typeof d.analysis_fn(type) !== 'function')
				d._afn = (_: string) => (x: number) => (x < d._domain!.min || x > d._domain!.max) ? -1 : 1;
			else
				d._afn = d.analysis_fn as (type: string) => (x: number) => number;

			// Discard datasets which are inclusive filters and use the entire domain
			// (i.e., do nothing)
			//
			if (and(inclusion_filters.includes(d.analysis_scale(type)),
			        and(d._domain!.min === d.domain!.min,
			            d._domain!.max === d.domain!.max)))
				return false;

			return true;
		})
		.sort((x,_) => {
			// Place the filters first. They will return -1's sooner and make our
			// loops faster.
			//
			return (filter_types.includes(x.analysis_scale(type))) ? 1 : -1;
		});
};

/*
 * plot_active
 *
 * Utility.
 *
 * @param "type" string. That can be:
 *   - ID of a dataset, or
 *   - an index name
 */

export async function plot_active(type: string) {
	// The run() is shared with the analysis_result pipeline through the
	// service's stage cache (EAE-521): one reload() computes the cells once.
	const a = await analysis_cells(type);
	plot_outputcanvas(a.raster);

	const index = EAE['indexes'][type];

	if (!type || !index) {
		console.warn("plot_active: Too early...",
		             "This is an initialisation bug.",
		             "Index type:", type);

		return a;
	}

	// 'animate' is set to false on mapbox's configuration, since we don't want
	// mapbox eating the CPU at 60FPS for nothing.
	//
	const canvas_source = MAPBOX.getSource('output-source');
	if (canvas_source) {
		canvas_source.raster = a.raster;

		canvas_source.play();
		canvas_source.pause();
	}

	return a;
};

// Which pixels satisfy every active dataset's own criteria.
export function criteria_mask(type: string) {
	const list = datasets(type);

	return analysed_mask(OUTLINE!.raster.data.length, list.map(d => ({
		"data":   d.raster!.data!,
		"nodata": d.raster!.nodata!,
		"score":  d._afn!(type),
	})));
};

export async function analysis(type: string) {
	const b = OUTLINE!;
	const env = GEOGRAPHY.envelope;

	const a = await run(type);
	const r = a.raster;

	if (!r.length) return;

	const arr = new Uint8Array(r.length).fill(-1);
	for (let i = 0; i < r.length; i += 1) {
		const ri = r[i] as number;
		arr[i] = (ri === -1) ? 255 : Math.round(ri * 254);
	}

	const metadata = {
		"ImageWidth":      b.raster.width,
		"ImageLength":     b.raster.height,
		"ResolutionUnit":  "1",
		"XPosition":       env[0],
		"YPosition":       env[1],
		"ModelTiepoint":   [ 0, 0, 0, env[0], env[3], 0 ],
		"XResolution":     "1",
		"YResolution":     "1",
		"GDAL_NODATA":     "255",
		"ModelPixelScale": [(env[2] - env[0]) / b.raster.width, (env[3] - env[1]) / b.raster.height, 0],
	};

	return {
		"tiff":     await GeoTIFF.writeArrayBuffer(arr, metadata),
		"analysis": a,
	};
};

/*
 * priority
 *
 * Paint the priority fills FROM the analysis result (EAE-521): the
 * computing lives in analysis_result() (area-scores.ts underneath), this
 * only turns result.areas[].score/bucket into mapbox fill colours. The
 * bucket is the one area scale's Low..High label; its index in
 * lowmedhigh_scale.range() is the same quantile slot the legacy fill scale
 * (an area scale over analysis_colorscale.stops) would return — both scales
 * share the domain and a 5-element range — so the colours are unchanged.
 */
export function priority(result: { areas: Record<string, { bucket: string | null }> }, tier: number | string) {
	const source = MAPBOX.getSource(`priority-source-${tier}`);

	if (source) {
		const areas = result.areas;

		source._data!.features!.forEach(f => f.properties['__fill'] = "transparent");

		for (const area_id in areas) {
			const feature = source._data!.features!.find(f => f.id === +area_id);
			const area = areas[area_id]!;

			feature!.properties['__fill'] = (area.bucket === null)
				? "transparent"
				: analysis_colorscale.stops[lowmedhigh_scale.range().indexOf(area.bucket)];
		}

		source.setData(json_clone(source._data));
	} else {
		console.debug(`priority-source-${tier}: not yet...`);
	}
};

function valid_layer_datasets(): AnalysisDataset[] {
	return (STATE.datasets as AnalysisDataset[])
		.filter(d => d.raster?.data)
		.filter(d => d.category!.name !== 'boundaries' && d.category!.name !== 'outline');
}

function dataset_layer_entry(dataset: AnalysisDataset, areas: Record<string, unknown>, is_point_layer: boolean) {
	return {
		"name":           dataset.name,
		"unit":           dataset.category!.unit,
		"is_point_layer": is_point_layer,
		"aggregation":    is_point_layer ? 'SUM' : (dataset.category!.analysis?.aggregation ?? 'AVG'),
		areas,
	};
}

export async function aggregate_layer_values(division: { raster: { data: RasterData } }) {
	const divisions = division.raster.data;
	const area_ids = [...new Set(divisions.filter(e => e !== -1))];

	const entries = await Promise.all(
		valid_layer_datasets().map(async dataset => {
			const is_point_layer = dataset.vectors?.shape_type === 'points';
			const areas = is_point_layer
				? aggregate_point_values(divisions, dataset, area_ids)
				: aggregate_scalar_values(divisions, dataset, area_ids);

			return [dataset.id, dataset_layer_entry(dataset, areas, is_point_layer)];
		}),
	);

	return Object.fromEntries(entries);
}

function aggregate_point_values(division_raster: RasterData, dataset: AnalysisDataset, area_ids: number[]) {
	const features = maybe(dataset, 'vectors', 'data', 'features') || [];
	const pixels = [];

	for (const feature of features) {
		const coords = maybe(feature, 'geometry', 'coordinates');
		if (!coords) continue;

		const pixel = coordinates_to_raster_pixel(coords, OUTLINE!.raster) as unknown as { index: number } | null;
		if (!pixel) continue;

		pixels.push(pixel.index);
	}

	return count_points(division_raster, area_ids, pixels);
}

function aggregate_scalar_values(division_raster: RasterData, dataset: AnalysisDataset, area_ids: number[]) {
	const agg_fn = dataset.category!.analysis?.aggregation ?? 'AVG';
	const values_by_area = collect_values(dataset as AggregationDataset, division_raster, area_ids);

	const has_csv_lookup = dataset.csv?.key != null;

	return area_results(values_by_area, area_ids, dataset as AggregationDataset, agg_fn, has_csv_lookup);
}

// ---------------------------------------------------------------------------
// EAE-521: analysis_result — the single memoised entry point for derived
// analysis state (notes/area-score-refactor.md §4-6). The pure cell, the
// in-flight memo and the revision staleness guard live in analysis-state.ts;
// everything below is the impure producer: the computation against
// STATE/GEOGRAPHY/OUTLINE, the inputs fingerprint and the memoised service.
// Every consumer and every QA readiness check reads the analysis cell now.
// ---------------------------------------------------------------------------

// The run() stage is shared between canvas painting (plot_active) and the
// result pipeline, keyed (revision, index, subdiv) like everything else.
export function analysis_cells(type: string): Promise<{ raster: Float32Array }> {
	return result_service.stage(type, () => run(type));
}

// Weak identity tokens so the inputs fingerprint notices data re-parses
// (fresh arrays even at equal lengths) and data arrival.
const input_tokens = new WeakMap<object, number>();
let input_token_count = 0;

function input_token(obj: unknown): number {
	if (obj === null || obj === undefined) return 0;

	let t = input_tokens.get(obj as object);
	if (t === undefined) {
		t = ++input_token_count;
		input_tokens.set(obj, t);
	}

	return t;
}

/*
 * result_inputs
 *
 * The fingerprint of everything an analysis result for (index, subdiv)
 * derives from: the geography, the subdivision filter (both the scope's and
 * the live one, so other-scope entries are dropped when it changes), the
 * subdivision tier run() filters with, the selected timeline date, and per
 * dataset its weight, its _domain/_domain_select (range sliders rewrite
 * _afn from these) and the identity of its loaded data. Any change to these
 * shows up as a different string and invalidates exactly the results whose
 * computation consumed them.
 */
function result_inputs(index: string, subdiv: unknown) {
	const parts = [
		GEOGRAPHY.id ?? GEOGRAPHY.name,
		index,
		subdiv,
		STATE.subdiv,
		STATE.divtier,
		STATE.timeline ?? null,
	];

	// The analysis inputs (also re-stamps d._afn as datasets() always does).
	for (const d of datasets(index))
		parts.push([
			'c', d.id, d.weight, d._domain?.min, d._domain?.max,
			JSON.stringify(d._domain_select ?? null),
			d.analysis_scale(index),
			input_token(d.raster?.data),
			input_token(d.raster?.sum),
			input_token(d.raster?.average),
			input_token(d.csv?.table),
			input_token(d.vectors?.data),
		]);

	// The layer-aggregation inputs (the values phase reads these).
	for (const d of valid_layer_datasets())
		parts.push([
			'v', d.id,
			input_token(d.raster?.data),
			input_token(d.raster?.sum),
			input_token(d.raster?.average),
			input_token(d.csv?.table),
			input_token(d.vectors?.data),
		]);

	return JSON.stringify(parts);
}

async function compute_result_scores(key: ResultKey): Promise<ScoresPayload> {
	const cells = (await analysis_cells(key.index)).raster;

	// Per-area scores need the tier's division raster. Geography init builds
	// it asynchronously — the outline pseudo-division lands late on large
	// geographies — and an early analysis (no/few layers) outruns it, so wait
	// for it the way run() has always waited for data. (Rejection here used
	// to strand the Analysis Results loader.)
	await until(() => GEOGRAPHY.divisions?.[key.tier]?.raster, Infinity);
	const division = GEOGRAPHY.divisions![key.tier]!;

	// The per-area {score, bucket} table (area-scores.ts area_score_table):
	// the same per-area averages the legacy record carried, bucketed by the
	// one area scale over the areas in view.
	const area_scores = area_score_table(cells, division.raster.data, lowmedhigh_scale.range());

	const mask = new Uint8Array(cells.length);
	for (let i = 0; i < cells.length; i += 1)
		mask[i] = has_priority_score(cells[i] as number) ? 1 : 0;

	return { cells, mask, "areas": area_scores };
}

async function compute_result_values(key: ResultKey, scores: ScoresPayload) {
	const division = GEOGRAPHY.divisions![key.tier]!;
	const analysis_raster = scores.cells;

	// The cards for a selected area aggregate the same cells as the
	// country-level cards: cells that have a priority score, restricted to this
	// area (the mask priority() used to build inline).
	const analysis_mask = {
		"raster": { "data": division.raster.data.map((v, i) => (v === -1 || !has_priority_score(analysis_raster[i] as number)) ? -1 : v) },
	};
	const layer_aggregates = await aggregate_layer_values(analysis_mask);

	// The first-class whole-geography entry (notes §6.3): the same layers over
	// the full outline, no analysis mask — what right-panel.js,
	// right-panel-data-tab.ts and summary.js faked as "area 0".
	const national_mask = {
		"raster": { "data": OUTLINE!.raster.data.map(v => (v !== OUTLINE!.raster.nodata) ? 0 : -1) },
	};
	const national_aggregates = await aggregate_layer_values(national_mask);

	// The cards' analysed-area universe (EAE-514): the analysed cells inside
	// the outline — the exact mask the pre-refactor graphs() fabricated as
	// "area 0", computed from the outline alone so it needs no admin
	// division (large geographies build theirs late; the cards must not
	// depend on it).
	const analysed_mask_raster = {
		"raster": { "data": OUTLINE!.raster.data.map((v, i) =>
			(v === OUTLINE!.raster.nodata || !scores.mask[i]) ? -1 : 0) },
	};
	const analysed_aggregates = await aggregate_layer_values(analysed_mask_raster);

	return {
		"areas":            foldValues(layer_aggregates),
		"national":         foldNational(national_aggregates),
		"analysed":         foldNational(analysed_aggregates),
		"layer_aggregates": layer_aggregates,
	};
}

const result_service = createAnalysisService({
	"inputs":        result_inputs,
	"subdiv":        () => (typeof STATE.subdiv === 'number') ? STATE.subdiv : null,
	"geography":     () => GEOGRAPHY.id ?? GEOGRAPHY.name,
	"computeScores": compute_result_scores,
	"computeValues": compute_result_values,
});

/** Phase 1 of analysis_result: per-area scores/buckets land first (§6.7). */
export function analysis_scores(index: string, tier: number | string) {
	return result_service.scores(index, tier);
}

/** The memoised analysis_result: cells, mask, areas, national. */
export function analysis_result(index: string, tier: number | string) {
	return result_service.result(index, tier);
}

// The COMMIT hook (a.js, next to timeline_sync_datasets): revision bump +
// selective invalidation. Deliberately NOT state_set — COMMIT's 300ms
// debounce coalesces range-slider drags into one revalidation.
export function analysis_state_sync() {
	result_service.sync();
}

export function dataset_feeds_index(d: unknown, index: string): boolean {
	const ds = d as AnalysisDataset | undefined;
	if (!ds?.analysis) return false;
	if (ds.index === index) return true;

	const indexes = maybe(ds, 'analysis', 'indexes') as readonly { index: string }[] | undefined;
	return Array.isArray(indexes) && indexes.some(i => i.index === index);
};

export function enough_datasets_for_index(t: string): boolean {
	if (STATE.datasets.some(d => dataset_feeds_index(d, t))) return true;

	if (["eai", "ani"].includes(t)) {
		const required = EAE['indexes'][t]!.compound;
		return required.every(r => STATE.datasets.some(d => dataset_feeds_index(d, r)));
	}

	return false;
};

export function medhigh_point_count(d: ArrayLike<number>, a: ArrayLike<number>): number {
	let count = 0;

	for (let i = 0; i < d.length; i++) {
		if ((d[i] === 0) && (a[i]! > 0.6))
			count += 1;
	}

	return count;
};

export async function getpoints(n = 0) {
	const a = await plot_active(STATE.index);

	const threshold = a.raster.slice(0)
		.sort((x, y) => x > y ? -1 : 1)
		.slice(0, n)[n - 1] as number;

	const points = a.raster.reduce<Array<{ i: number; v: number }>>((t, v, i) => {
		if (v > 0 && v >= threshold)
			t.push({ "i": i, "v": v });

		return t;
	}, []);

	return points
		.sort((a,b) => a.v > b.v ? -1 : 1)
		.map(t => ({ "v": t.v, "i": t.i, "c": raster_pixel_to_coordinates(t.i) }));
};
