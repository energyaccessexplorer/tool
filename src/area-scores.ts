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
 * THE one score -> {bucket, label, colour} scale: fixed absolute 20% bands
 * over [0, 1], Low..High, with the exact boundary going to the upper band
 * (floor(v * 5)) and out-of-range scores clamping into the outer bands. Null
 * for a missing value, the -1 nodata marker or a non-finite value.
 *
 * Every percentage, Low..High label and bucket colour reads this mapping — do
 * not add a second scale.
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

export function score_bucket(value: number | null | undefined): ScoreBucket | null {
	if (value === null || value === undefined) return null;
	if (!Number.isFinite(value) || value === -1) return null;

	const x = Math.min(1, Math.max(0, value));
	return bucket_of_index(Math.min(score_bands.length - 1, Math.floor(x * score_bands.length)));
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
 * The score strategy knob. `cell_mean` scores an area by its cells' average;
 * `pixel_sum` by the score mass its cells hold.
 */
export type ScoreMode = 'cell_mean' | 'pixel_sum';

export const SCORE_MODE: ScoreMode = 'cell_mean';

/** The score the lowest-ranked area reads (1%): it was analysed, so it keeps a priority score. */
export const AREA_SCORE_FLOOR = 0.01;

/*
 * area_score_strategy
 *
 * One score per area, read off the cell scores the map paints and stretched
 * over the areas present: the top area reads 1, the lowest AREA_SCORE_FLOOR,
 * the rest linearly between — the same min-max stretch run() gives the cells.
 * `cell_mean` ranks by the area's cells averaged, so the division map is the
 * km² map at a coarser resolution. `pixel_sum` ranks by the cell scores
 * added up, so size counts. Equal raw scores all read 1.
 *
 * Scoring the raster rather than re-deriving an area value from the layer
 * aggregates is what keeps ONE direction rule in the app: every dataset's
 * scaling and `invert` are applied once, per cell, in run(). No area-level
 * aggregate can disagree with the map, and a sum of the non-negative cell
 * scores run() leaves behind cannot be negative.
 */
export function area_score_strategy(
	mode: ScoreMode,
	areas: AreaCellScores,
): Record<string, number> {
	const raw: Record<string, number> = {};
	let min = Infinity;
	let max = -Infinity;

	for (const id in areas) {
		const a = areas[id]!;
		const v = (mode === 'cell_mean') ? a.average : a.sum;
		raw[id] = v;
		if (v < min) min = v;
		if (v > max) max = v;
	}

	const span = max - min;
	const scores: Record<string, number> = {};
	for (const id in raw)
		scores[id] = (span > 0) ? AREA_SCORE_FLOOR + ((1 - AREA_SCORE_FLOOR) * (raw[id]! - min) / span) : 1;

	return scores;
}

/*
 * area_score_table
 *
 * The per-area {score, bucket} table the analysis result publishes: the
 * strategy's score, bucketed by score_bucket.
 */
export function area_score_table(
	areas: AreaCellScores,
	mode: ScoreMode = SCORE_MODE,
): Record<string, AreaScore> {
	const scores = area_score_strategy(mode, areas);

	const out: Record<string, AreaScore> = {};
	for (const id in scores) out[id] = { "score": scores[id]!, "bucket": score_bucket(scores[id]!) };

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

