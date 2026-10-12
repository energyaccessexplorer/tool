import {
	colorscale_svg,
	coordinates_to_raster_pixel,
	raster_pixel_to_coordinates,
} from './utils.js';

import {
	analysis_colorscale,
	area_results,
	aggregate_by_area,
	area_score_table,
	analysed_mask,
	collect_values,
	count_points,
	criteria_pass_mask,
	filter_types,
	type AggregationDataset,
	type ScoreBucket,
	weights_for,
} from './area-scores.ts';

import {
	createAnalysisService,
	foldNational,
	foldValues,
	type ResultKey,
	type ScoresPayload,
	type ValuesPayload,
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

// The DS registry's legacy row shape (ds.js), narrowed to what this module
// reads; the boundary cast lives in datasets()/valid_layer_datasets().
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

// The analysis ramp belongs to the shared score->bucket scale (area-scores.ts,
// whose stops are the five bucket colours); re-exported for the plot and
// legend consumers.
export { analysis_colorscale };

export const analysis_colorscale_svg = colorscale_svg(analysis_colorscale.stops);

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

	// Per-dataset weights and per-index totals, from weights_for()
	// (area-scores.ts) so run() and the scoring strategy share one weights source.
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
	// run() is shared with the analysis_result pipeline via the service's
	// stage cache: one reload() computes the cells once.
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

// The timeline-filters display mask (a.js apply_criteria_mask) — deliberately
// NOT the one "analysed cells" rule (area-scores.ts analysed_mask).
export function criteria_mask(type: string) {
	const list = datasets(type);

	return criteria_pass_mask(OUTLINE!.raster.data.length, list.map(d => ({
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
 * Paint fills from result.areas[].bucket; the colour is the shared score
 * scale's, the same band the percentage and the Low..High label read off.
 */
export function priority(result: { areas: Record<string, { bucket: ScoreBucket | null }> }, tier: number | string) {
	const source = MAPBOX.getSource(`priority-source-${tier}`);

	if (source) {
		const areas = result.areas;

		source._data!.features!.forEach(f => f.properties['__fill'] = "transparent");

		for (const area_id in areas) {
			const feature = source._data!.features!.find(f => f.id === +area_id);
			const area = areas[area_id]!;

			feature!.properties['__fill'] = area.bucket ? area.bucket.colour : "transparent";
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
// analysis_result: the single memoised entry point for derived analysis state.
// The pure cell and staleness guard live in analysis-state.ts; below is the
// impure producer — computation, inputs fingerprint and the memoised service.
// ---------------------------------------------------------------------------

// run()'s stage is shared by canvas painting (plot_active) and the result
// pipeline, keyed (revision, index, subdiv).
export function analysis_cells(type: string): Promise<{ raster: Float32Array }> {
	return result_service.stage(type, () => run(type));
}

// Weak identity tokens so the fingerprint notices data re-parses (fresh arrays
// even at equal lengths) and data arrival.
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
 * Fingerprint of everything a result for (index, subdiv) derives from: a
 * change invalidates exactly the results that consumed the changed input.
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

// The scoring dataset slices: run()'s weights (weights_for) and each dataset's
// per-index `invert` direction (ds.js analysis_fn's range flip).
function score_datasets(index: string) {
	const list = datasets(index);
	const { weights } = weights_for(index, list);

	return list.map(d => ({
		"id":     d.id,
		"weight": weights[d.id] || 0,
		"invert": !!d.analysis?.indexes?.find(i => i.index === index)?.invert,
	}));
}

// The aggregates the scores were derived from, stashed against the phase-1
// payload so the values phase folds them instead of recomputing.
const values_stash = new WeakMap<ScoresPayload, ValuesPayload & { layer_aggregates: Record<string, unknown> }>();

async function compute_result_scores(key: ResultKey): Promise<ScoresPayload> {
	const cells = (await analysis_cells(key.index)).raster;

	// Geography init builds the tier's division raster asynchronously and an
	// early analysis (no/few layers) outruns it, so wait the way run() waits
	// for data.
	await until(() => GEOGRAPHY.divisions?.[key.tier]?.raster, Infinity);
	const division = GEOGRAPHY.divisions![key.tier]!;

	// The one "analysed cells" mask (area-scores.ts analysed_mask); every
	// aggregate below counts exactly these cells.
	const mask = analysed_mask(cells);

	// The scores are derived from these exact aggregates, so the values phase
	// publishes this fold rather than recomputing it.
	const analysis_mask = {
		"raster": { "data": division.raster.data.map((v, i) => (v === -1 || !mask[i]) ? -1 : v) },
	};
	const layer_aggregates = await aggregate_layer_values(analysis_mask);

	// The whole-geography aggregate: the same layers over the full outline,
	// with no analysis mask.
	const national_mask = {
		"raster": { "data": OUTLINE!.raster.data.map(v => (v !== OUTLINE!.raster.nodata) ? 0 : -1) },
	};
	const national_aggregates = await aggregate_layer_values(national_mask);

	// The cards' analysed-area universe: analysed cells inside the outline,
	// computed from the outline alone so it needs no admin division (large
	// geographies build theirs late).
	const analysed_mask_raster = {
		"raster": { "data": OUTLINE!.raster.data.map((v, i) =>
			(v === OUTLINE!.raster.nodata || !mask[i]) ? -1 : 0) },
	};
	const analysed_aggregates = await aggregate_layer_values(analysed_mask_raster);

	const values = foldValues(layer_aggregates);

	// The per-area {score, bucket} table; area_score_table is the scoring
	// strategy knob, currently 'total'.
	const intensities = Object.fromEntries(
		Object.entries(aggregate_by_area(cells, division.raster.data))
			.map(([id, a]): [string, number] => [id, a.average]),
	);
	const areas = area_score_table(intensities, values, score_datasets(key.index));

	const scores = { cells, mask, areas };
	values_stash.set(scores, {
		"areas":            values,
		"national":         foldNational(national_aggregates),
		"analysed":         foldNational(analysed_aggregates),
		"layer_aggregates": layer_aggregates,
	});

	return scores;
}

async function compute_result_values(_key: ResultKey, scores: ScoresPayload) {
	// The fold compute_result_scores stashed — no recomputation.
	return values_stash.get(scores)!;
}

const result_service = createAnalysisService({
	"inputs":        result_inputs,
	"subdiv":        () => (typeof STATE.subdiv === 'number') ? STATE.subdiv : null,
	"geography":     () => GEOGRAPHY.id ?? GEOGRAPHY.name,
	"computeScores": compute_result_scores,
	"computeValues": compute_result_values,
});

/** analysis_result phase 1: per-area scores/buckets, published before values. */
export function analysis_scores(index: string, tier: number | string) {
	return result_service.scores(index, tier);
}

/** The completed analysis_result: cells, mask, areas, national. */
export function analysis_result(index: string, tier: number | string) {
	return result_service.result(index, tier);
}

// COMMIT hook (a.js): revision bump + selective invalidation. Deliberately
// NOT state_set — COMMIT's 300ms debounce coalesces slider drags into one revalidation.
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
