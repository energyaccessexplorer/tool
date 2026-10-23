// The pure core of the admin-area score computation: typed arrays in, numbers
// out, deterministic, no app state. Erasable syntax only (no namespace/enum).
// Every score, bucket and weight rule the app shows is defined here — do not
// fork one locally.

import {
	colorscale,
	resolve_raster_value,
	uniform_split,
} from './utils.js';

/** The dataset analysis scales that act as filters, not scores. */
export const filter_types: readonly string[] = ["key-delta", "exclusion-buffer", "inclusion-buffer"];

/** The slices of a dataset the weight computation reads. */
export interface WeightDataset {
	readonly id: string;
	readonly index?: string | null;
	readonly weight: number;
	readonly analysis_scale: (type: string) => string;
}

/** Per-dataset weights plus the per-index totals they were derived from. */
export interface Weights {
	readonly weights: Record<string, number>;
	readonly totals: Record<string, number>;
}

/*
 * weights_for
 *
 * The analysis weights run() combines cell scores with. Each dataset takes a
 * share of its index's total weight, split across every non-compound index
 * that contributed a dataset; `ani` is the exception, splitting over the
 * grand total of all indexes. Filter datasets weigh nothing and never count
 * towards the totals. A dataset whose index total dropped to zero divides by
 * undefined and yields NaN — pinned: run()'s zero-total gate reads it as 0.
 */
export function weights_for(index: string, datasets: readonly WeightDataset[]): Weights {
	// Add up how much non-compound indexes datasets will account for. Then, just
	// below, these values will be split into equal proportions of the total
	// analysis.
	//
	const singles: Record<string, number> = {};
	for (const i in EAE['indexes']) {
		const compound = EAE['indexes'][i]!.compound;
		if (compound.length < 2) singles[i] = 0;
	}

	const tots = datasets.reduce((a, d) => {
		if (filter_types.indexOf(d.analysis_scale(index)) === -1 && d.index)
			a[d.index] = (a[d.index] as number) + d.weight;

		return a;
	}, singles);

	for (const s in singles) if (singles[s] === 0) delete singles[s];

	const weights: Record<string, number> = {};
	datasets.forEach(d => {
		if (filter_types.indexOf(d.analysis_scale(index)) > -1) weights[d.id] = 0;
		else {
			switch (index) {
			case "ani": {
				weights[d.id] = d.index ? d.weight / Object.keys(tots).reduce((a, c) => (tots[c] as number) + a, 0) : 0;
				break;
			}

			default: {
				weights[d.id] = d.index ? d.weight / ((tots[d.index] as number) * Object.keys(singles).length) : 0;
				break;
			}
			}
		}
	});

	return { weights, "totals": tots };
}

// The analysis output colour ramp: 5 magma stops, one per Low..High band,
// starting at analysis_low (0.167) into the gradient. analysis.js re-exports
// it for the plotting/legend consumers.
const analysis_low = 0.167;

export const analysis_colorscale = colorscale({
	"stops":  uniform_split(5).map(x => d3.interpolateMagma(analysis_low + (x * (1 - analysis_low)))),
	"domain": { "min": 0, "max": 1 },
});

/**
 * A score's place on the five Low..High bands, and the colour the analysis
 * ramp gives that band. Nearly every percentage, label and bucket colour the
 * app shows reads this vocabulary — do not fork a second one.
 */
export interface ScoreBucket {
	/** 0..4: the slot in score_bands and analysis_colorscale.stops. */
	readonly index: number;
	/** The canonical English Low..High label (translate via getScaleLabels). */
	readonly label: string;
	/** The bucket's colour on the analysis output ramp. */
	readonly colour: string;
}

/** The five Low..High band labels in bucket order. */
export const score_bands: readonly string[] = ["Low", "Low-Medium", "Medium", "Medium-High", "High"];

function bucket_of_index(index: number): ScoreBucket {
	return {
		index,
		"label":  score_bands[index] as string,
		"colour": analysis_colorscale.stops[index] as string,
	};
}

// Absolute 20% bands over [0, 1]: the label depends on the score alone, unlike
// the area table's tier-relative natural breaks. The km² cells, popups and
// exports read this one.
export function score_bucket(value: number | null | undefined): ScoreBucket | null {
	if (value === null || value === undefined) return null;
	if (!Number.isFinite(value) || value === -1) return null;

	const x = Math.min(1, Math.max(0, value));
	return bucket_of_index(Math.min(score_bands.length - 1, Math.floor(x * score_bands.length)));
}

/*
 * jenks_breaks
 *
 * Natural-breaks class edges for the five bands: the partition of the sorted
 * values into `n_classes` runs minimising within-class variance (the QGIS
 * "Natural Breaks (Jenks)" mode). Returns n_classes+1 edges (first = min,
 * last = max), or null when the values cannot form that many classes (fewer
 * values, or fewer distinct values, than classes) — the caller falls back to
 * the fixed bands. Equal values may split across classes; the edges record
 * the upper class's first value, so duplicate edges collapse harmlessly.
 *
 * O(n^2 * classes): a Parish tier (~7.5k areas) is a few hundred ms.
 */
export function jenks_breaks(values: readonly number[], n_classes: number): number[] | null {
	const data = values.filter(Number.isFinite).sort((a, b) => a - b);
	const n = data.length;
	if (n < n_classes || new Set(data).size < n_classes) return null;

	const sum = new Float64Array(n + 1);
	const sumsq = new Float64Array(n + 1);
	for (let i = 0; i < n; i++) {
		sum[i + 1] = sum[i]! + data[i]!;
		sumsq[i + 1] = sumsq[i]! + data[i]! * data[i]!;
	}

	// sum of squared deviations of data[a..b] (inclusive), via cumsums
	const ssd = (a: number, b: number): number => {
		const s = sum[b + 1]! - sum[a]!;
		return (sumsq[b + 1]! - sumsq[a]!) - (s * s) / (b - a + 1);
	};

	const K = n_classes;
	const at = (l: number, k: number): number => l * (K + 1) + k;
	const best = new Float64Array((n + 1) * (K + 1)).fill(Infinity);
	const start = new Int32Array((n + 1) * (K + 1));

	for (let l = 1; l <= n; l++) {
		best[at(l, 1)] = ssd(0, l - 1);
		start[at(l, 1)] = 1;
	}

	for (let k = 2; k <= K; k++) {
		for (let l = k; l <= n; l++) {
			// last class is data[m-1 .. l-1]
			for (let m = k; m <= l; m++) {
				const v = best[at(m - 1, k - 1)]! + ssd(m - 1, l - 1);
				if (v < best[at(l, k)]!) {
					best[at(l, k)] = v;
					start[at(l, k)] = m;
				}
			}
		}
	}

	const edges: number[] = new Array(K + 1);
	edges[0] = data[0]!;
	edges[K] = data[n - 1]!;
	let l = n;
	for (let k = K; k > 1; k--) {
		const m = start[at(l, k)]!;
		edges[k - 1] = data[m - 1]!;
		l = m - 1;
	}

	return edges;
}

/*
 * bucket_in_edges
 *
 * The jenks_edges counterpart of score_bucket: an edge is its class's lower
 * bound, so a value sitting exactly on one belongs to the class above it —
 * score_bucket's boundary rule, and QGIS's. The last edge is the data's
 * maximum, so a top class holding a single distinct value needs that
 * inclusive comparison to have any member at all. Null for a missing/nodata
 * value, as score_bucket.
 */
export function bucket_in_edges(value: number | null | undefined, edges: readonly number[]): ScoreBucket | null {
	if (value === null || value === undefined) return null;
	if (!Number.isFinite(value) || value === -1) return null;

	let i = 0;
	for (let e = 1; e < edges.length - 1; e++) if (edges[e]! <= value) i = e;

	return bucket_of_index(i);
}

/** A division area's cell-score aggregate, keyed by stringified area id. */
export interface AreaCellScore {
	/** The area's cell scores added up — the score mass it holds. */
	readonly sum: number;
	/** The same mass averaged over its cells: the size-neutral sibling. */
	readonly average: number;
}

/** A per-area record ({ [area_id]: { sum, average } }). */
export type AreaCellScores = Readonly<Record<string, AreaCellScore>>;

/*
 * aggregate_by_area
 *
 * Sum and average the analysis raster over each division area. Returns
 * { [area_id]: { sum, average } }: `sum` is the score mass the area holds (the
 * pixel_sum strategy's input), `average` the same mass per cell.
 */
export function aggregate_by_area(
	analysis_raster: ArrayLike<number>,
	division_data: ArrayLike<number>,
): Record<string, AreaCellScore> {
	return Object.fromEntries(
		Object.entries(
			Array.from(analysis_raster).reduce((acc, value, i) => {
				const id = division_data[i] as number;
				// skip nodata pixels
				if (id === -1 || value === -1) {
					return acc;
				} else {
					return Object.assign(acc, {
						[id]: {
							"sum":   (acc[id]?.sum || 0) + value,
							"count": (acc[id]?.count || 0) + 1,
						},
					});
				}
			}, {} as Record<string, { "sum": number; "count": number }>),
		).map(([id, { sum, count }]): [string, AreaCellScore] => [id, { sum, "average": sum / count }]),
	);
}

/** One area's published score entry: the score + its ONE-scale bucket. */
export interface AreaScore {
	readonly score: number;
	/** The bucket from score_bucket (index + label + colour); null is "no score". */
	readonly bucket: ScoreBucket | null;
}

/**
 * The score strategy knob. `layer_totals` scores an area by its layers'
 * aggregates (population summed, GHI averaged, facilities counted), each
 * min-max normalised across the areas; `cell_mean` by its cells' average;
 * `pixel_sum` by the score mass its cells hold.
 */
export type ScoreMode = 'layer_totals' | 'cell_mean' | 'pixel_sum';

export const SCORE_MODE: ScoreMode = 'layer_totals';

/** The score the lowest-ranked area reads (1%): it was analysed, so it keeps a priority score. */
export const AREA_SCORE_FLOOR = 0.01;

/** One analysis dataset's slices for `layer_totals`. */
export interface ScoreLayer {
	readonly id: string;
	readonly weight: number;
	readonly invert: boolean;
}

/** Area -> dataset id -> that layer's aggregate over the area's analysed cells. */
export type LayerTotals = Readonly<Record<string,
	Readonly<Record<string, { readonly type?: string; readonly value: unknown } | null | undefined>> | null | undefined>>;

/*
 * weighted_layer_shares
 *
 * Per layer, each area's aggregate min-max normalised across the areas that
 * have one (lowest 0, highest 1), flipped for an `invert` layer, then the
 * layers' weighted average. `invert` speaks for the raster the cells are
 * scored from (proximity: closer is better), so it never flips a feature
 * count. A layer that is equal everywhere cannot rank areas and is skipped.
 */
function weighted_layer_shares(totals: LayerTotals, layers: readonly ScoreLayer[]): Record<string, number> {
	const ids = Object.keys(totals).filter(id => totals[id]);
	const out: Record<string, number> = Object.fromEntries(ids.map(id => [id, 0]));
	let weight_sum = 0;

	for (const l of layers) {
		if (!(l.weight > 0)) continue;

		const v: Record<string, number> = {};
		let min = Infinity;
		let max = -Infinity;
		let counts_features = false;

		for (const id of ids) {
			const e = totals[id]![l.id];
			if (!e || typeof e.value !== 'number' || !Number.isFinite(e.value)) continue;

			v[id] = e.value;
			if (e.value < min) min = e.value;
			if (e.value > max) max = e.value;
			if (e.type === 'points') counts_features = true;
		}

		const span = max - min;
		if (!(span > 0)) continue;

		const flip = l.invert && !counts_features;
		weight_sum += l.weight;

		for (const id in v) {
			const share = (v[id]! - min) / span;
			out[id] = out[id]! + (l.weight * (flip ? 1 - share : share));
		}
	}

	if (weight_sum > 0) for (const id of ids) out[id] = out[id]! / weight_sum;

	return out;
}

/*
 * area_score_strategy
 *
 * One score per area, stretched over the areas present: the top area reads
 * 1, the lowest AREA_SCORE_FLOOR, the rest linearly between. Equal raw
 * scores all read 1. An area without analysed cells reads the floor.
 *
 * `layer_totals` aggregates first and normalises after, so an area's score
 * is about what it holds — Greater Kampala's 6 M people outrank Bukedi's
 * 2.5 M however densely Bukedi is settled. The layer's own display scale
 * (intervals, ranges) does not shape it; its filters still decide which
 * cells are analysed. `cell_mean` and `pixel_sum` read the cell scores the
 * km² map paints, averaged or added up.
 */
export function area_score_strategy(
	mode: ScoreMode,
	areas: AreaCellScores,
	totals: LayerTotals = {},
	layers: readonly ScoreLayer[] = [],
): Record<string, number> {
	const raw: Record<string, number> = (mode === 'layer_totals')
		? weighted_layer_shares(totals, layers)
		: Object.fromEntries(Object.entries(areas).map(([id, a]) => [id, (mode === 'cell_mean') ? a.average : a.sum]));

	let min = Infinity;
	let max = -Infinity;
	for (const id in raw) {
		if (raw[id]! < min) min = raw[id]!;
		if (raw[id]! > max) max = raw[id]!;
	}

	const span = max - min;
	const scores: Record<string, number> = {};
	for (const id in raw)
		scores[id] = (span > 0) ? AREA_SCORE_FLOOR + ((1 - AREA_SCORE_FLOOR) * (raw[id]! - min) / span) : 1;

	// An area with no analysed cell has no layer aggregate: it ranks last
	// without moving the stretch.
	for (const id in areas) if (!(id in scores)) scores[id] = AREA_SCORE_FLOOR;

	return scores;
}

/*
 * area_score_table
 *
 * The per-area {score, bucket} table the analysis result publishes: the
 * strategy's score, bucketed by the tier's natural breaks — the five classes
 * fitted to the areas it actually has. A tier too small or too flat to cut
 * five classes has no breaks and falls back to the absolute 20% bands, which
 * is also what the raster cells and the popups read.
 */
export function area_score_table(
	areas: AreaCellScores,
	totals: LayerTotals = {},
	layers: readonly ScoreLayer[] = [],
	mode: ScoreMode = SCORE_MODE,
): Record<string, AreaScore> {
	const scores = area_score_strategy(mode, areas, totals, layers);
	const values = Object.values(scores);

	const edges = jenks_breaks(values, score_bands.length);

	const out: Record<string, AreaScore> = {};
	for (const id in scores) {
		const s = scores[id]!;
		const bucket = edges ? bucket_in_edges(s, edges) : score_bucket(s);
		out[id] = { "score": s, bucket };
	}

	return out;
}

// A cell or area HAS A PRIORITY SCORE when the analysis gave it a positive
// index. This is the ONE "has a score" rule — the aggregation mask every
// aggregate counts, the export's priority-cell list and the Priority areas
// listing all read it, so changing it here moves them together. The index is
// rescaled into a Float32Array, so its minimum can land a hair below zero; the
// strict comparison keeps those bottom-band cells out.
export function has_priority_score(value: number): boolean {
	return Number.isFinite(value) && value > 0;
}

/*
 * analysed_mask
 *
 * The has_priority_score rule over a whole raster: 1 for every cell that
 * carries a priority score, 0 otherwise. The analysis result publishes it as
 * `mask`, and every aggregate counts exactly these cells. The rule inherits
 * run()'s joint nodata drop — a cell with nodata in ANY active dataset is
 * clipped to -1 and counts for no dataset at all.
 */
export function analysed_mask(cells: ArrayLike<number>): Uint8Array {
	const out = new Uint8Array(cells.length);
	for (let i = 0; i < out.length; i += 1) out[i] = has_priority_score(cells[i] as number) ? 1 : 0;
	return out;
}

/** One dataset's contribution to the criteria display mask. */
export interface MaskLayer {
	readonly data: ArrayLike<number>;
	readonly nodata: number;
	/** The dataset's per-cell scaling function (run()'s afn). */
	readonly score: (value: number) => number;
}

/*
 * criteria_pass_mask
 *
 * Which pixels satisfy every active dataset's own criteria: 1 where every
 * layer scores the cell within [0, 1], 0 where some layer clips it out or
 * the cell is nodata for it.
 *
 * Deliberately distinct from analysed_mask — this is the timeline-filters
 * DISPLAY mask ("Only show areas that meet all data layer criteria"), which
 * answers "does this cell pass every layer's own criteria?", not "did the
 * combined index score it?". Do not wire the two together: a cell can pass
 * every criterion yet carry no priority score (every layer scores it 0), sit
 * in the index rescale's bottom band or fall outside STATE.subdiv —
 * analysed_mask drops those, this mask keeps them, and folding them would
 * change which cells grey out.
 */
export function criteria_pass_mask(cell_count: number, layers: readonly MaskLayer[]): Uint8Array {
	const it = new Uint8Array(cell_count).fill(1);
	if (!layers.length) return it;

	for (let i = 0; i < it.length; i += 1) {
		for (const c of layers) {
			const v = c.data[i] as number;

			if (v === c.nodata) { it[i] = 0; break; }

			const sv = c.score(v);
			if (sv < 0 || sv > 1) { it[i] = 0; break; }
		}
	}

	return it;
}

/** The slices of a dataset the layer aggregation reads. */
export interface AggregationDataset {
	readonly category: {
		readonly analysis?: { readonly aggregation?: string };
	};
	readonly raster: {
		readonly data: ArrayLike<number>;
		readonly nodata: number;
		readonly sum?: ArrayLike<number>;
		readonly average?: ArrayLike<number>;
	};
	readonly csv?: {
		readonly key?: string | number | null;
		readonly table?: Record<string, unknown>;
	};
}

/** One area's scalar aggregate, in the layer-data shape consumers read. */
export interface ScalarResult {
	readonly type: 'scalar';
	readonly value: number;
}

/** One area's point count, in the layer-data shape consumers read. */
export interface PointResult {
	readonly type: 'points';
	readonly value: number;
}

// The band used for a dataset's scalar aggregation. SUM reads the area-weighted
// sum band, AVG reads the area-weighted average band, and categorical datasets
// (csv lookup) keep the near band since their values are category codes.
// The parser has already folded legacy single-band rasters into every band.
export function aggregation_band(dataset: AggregationDataset): ArrayLike<number> {
	const agg_fn = dataset.category.analysis?.aggregation ?? 'AVG';

	if (dataset.csv?.key != null) return dataset.raster.data;
	if (agg_fn === 'SUM') return dataset.raster.sum!;
	return dataset.raster.average!;
}

// Collect the values of a dataset's aggregation band for each division area,
// skipping nodata cells.
export function collect_values(
	dataset: AggregationDataset,
	division_raster: ArrayLike<number>,
	area_ids: readonly number[],
): Record<string, number[]> {
	const band = aggregation_band(dataset);
	const nodata = dataset.raster.nodata;
	const result: Record<string, number[]> = Object.fromEntries(
		area_ids.map((id): [number, number[]] => [id, []]),
	);

	for (let i = 0; i < division_raster.length; i += 1) {
		const area_id = division_raster[i] as number;
		if (area_id !== -1 && band[i] !== nodata && area_id in result)
			result[area_id]!.push(band[i] as number);
	}

	return result;
}

export function aggregate(values: readonly number[], fn: string): number {
	const sum = values.reduce((a, b) => a + b, 0);

	switch (fn) {
	case "SUM":
		return sum;

	case "AVG":
	default:
		return sum / values.length;
	}
}

// Turn per-area value lists into the aggregate result objects the layer-data
// consumers expect, resolving csv lookups for categorical datasets.
export function area_results(
	values_by_area: Record<string, number[]>,
	area_ids: readonly number[],
	dataset: AggregationDataset,
	agg_fn: string,
	has_csv_lookup: boolean,
): Record<string, { result: ScalarResult | null }> {
	return Object.fromEntries(
		area_ids.map((id): [number, { result: ScalarResult | null }] => {
			let values = values_by_area[id]!;

			if (has_csv_lookup) {
				values = values.map(v => resolve_raster_value(dataset, v)).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
			}

			return [id, {
				"result": (values.length || agg_fn === 'SUM')
					? { "type": 'scalar', "value": values.length ? aggregate(values, agg_fn) : 0 }
					: null,
			}];
		}),
	);
}

// Count the raster pixels that fall inside each division area (the point
// layer aggregation). `pixels` holds one raster index per feature that
// resolved to a pixel; features outside every area are dropped, area id 0 is
// a legitimate area.
export function count_points(
	division_raster: ArrayLike<number>,
	area_ids: readonly number[],
	pixels: Iterable<number>,
): Record<string, { result: PointResult }> {
	const counts: Record<string, number> = Object.fromEntries(
		area_ids.map((id): [number, number] => [id, 0]),
	);

	for (const i of pixels) {
		const area_id = division_raster[i] as number;
		if (area_id === -1) continue;
		if (!(area_id in counts)) continue;

		counts[area_id] = (counts[area_id] as number) + 1;
	}

	return Object.fromEntries(
		area_ids.map((id): [number, { result: PointResult }] => [id, {
			"result": { "type": 'points', "value": counts[id] as number },
		}]),
	);
}

