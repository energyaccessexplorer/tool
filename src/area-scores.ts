// EAE-521: the pure core of the admin-area score computation
// (notes/area-score-refactor.md §4-6). Typed arrays in, numbers out: every
// function here is deterministic and reads no app state. Erasable-syntax
// only (no namespace/enum).
//
// Extracted unchanged from tool/src/analysis.js in step 2 of the plan
// (behaviour-pinned by tool/test/area-scores.test.ts):
//
//   - the per-area averages fold + the one quantile area scale + the
//     area_score_table built from them (compute_result_scores' table)
//   - has_priority_score (moved as-is, the ONE "has a score" rule)
//   - aggregation_band / collect_values / aggregate / area_results /
//     count_points       (analysis.js's aggregate_layer_values internals)
//   - analysed_mask      (the pure loop of analysis.js's criteria_mask)
//   - weights_for        (run()'s inline weight computation, so run() and
//                         the future area_score_strategy share one source)
//
// The legacy alias exports were retired with the consumer migration: every
// consumer reads the analysis result now.

import {
	resolve_raster_value,
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
 * The analysis weights run() combines cell scores with. Each dataset
 * accounts for a share of its index's total weight (`totals`); that share is
 * then split into equal proportions of the analysis across every
 * non-compound index that contributed a dataset. `ani` is the exception: it
 * splits every weight over the grand total of all indexes instead of
 * per-index totals. Filter datasets weigh nothing and never count towards
 * the totals. Note a dataset whose index total dropped to zero divides by
 * undefined and yields a NaN weight here — pinned behaviour, the zero-total
 * gate in run() treats it as 0.
 *
 * (Extracted from run()'s inline computation in analysis.js.)
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

/** A division area's aggregate, keyed by stringified area id. */
export interface AreaAverage {
	readonly average: number;
}

/** A per-area averages record ({ [area_id]: { average } }). */
export type AreaAverages = Readonly<Record<string, AreaAverage>>;

/*
 * aggregate_by_area
 *
 * Compute the average analysis value per division area.
 * Returns { [area_id]: { average } }
 */
export function aggregate_by_area(
	analysis_raster: ArrayLike<number>,
	division_data: ArrayLike<number>,
): Record<string, AreaAverage> {
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
		).map(([id, { sum, count }]): [string, AreaAverage] => [id, { "average": sum / count }]),
	);
}

/** A quantile scale over the areas' averages (a d3 v5 scaleQuantile). */
export interface AreaScale<R> {
	(value: number | null): R | undefined;
}

/*
 * area_scale
 *
 * Bucket the areas' average scores through a quantile scale whose domain is
 * [min, max] of the usable averages (-1 nodata and non-finite averages are
 * dropped first). Returns null when no area carries a usable average.
 */
export function area_scale<R extends string | number>(
	area_averages: AreaAverages,
	range: readonly R[],
): AreaScale<R> | null {
	const averages = Object.values(area_averages)
		.map(d => d.average)
		.filter((v): v is number => v !== -1 && Number.isFinite(v));
	if (averages.length === 0) return null;
	return d3.scaleQuantile<R>()
		.domain([Math.min(...averages), Math.max(...averages)])
		.range(range);
}

/** One area's phase-1 entry: average score + Low..High bucket label. */
export interface AreaScore {
	readonly score: number;
	readonly bucket: string | null;
}

/*
 * area_score_table
 *
 * The per-area score table the analysis result publishes (phase 1): each
 * area's average analysis value plus its bucket from the ONE area scale over
 * the usable averages, with the (score === -1 || !scale) null rule. Wraps
 * aggregate_by_area + area_scale + the bucketing so the result pipeline and
 * the unit tests share one definition.
 */
export function area_score_table(
	analysis_raster: ArrayLike<number>,
	division_data: ArrayLike<number>,
	range: readonly string[],
): Record<string, AreaScore> {
	const areas = aggregate_by_area(analysis_raster, division_data);
	const scale = area_scale(areas, range);

	const out: Record<string, AreaScore> = {};
	for (const id in areas) {
		const score = areas[id]!.average;
		out[id] = {
			score,
			"bucket": (score === -1 || !scale) ? null : (scale(score) as string),
		};
	}

	return out;
}

// A cell or area HAS A PRIORITY SCORE when the analysis gave it a positive
// index. This is the single definition for every consumer:
//   - the aggregation mask the Data-tab cards use (graphs() in right-panel.js
//     and priority() in analysis.js), so the cards average exactly the cells
//     that carry a score;
//   - the priority-cell list the CSV export is built from (all_points() in
//     right-panel-high-priority-areas.js), which is what writes the
//     "Priority score" / index columns;
//   - the Priority areas listing and its pagination (get_division_results()).
// Change the rule here and the cells the cards average over and the rows that
// carry a priority score move together. Note the index is rescaled into a
// Float32Array, so its minimum can land a hair below zero (≈ -1.6e-8); the
// strict comparison keeps those bottom-band cells out, which is what the export
// has always done.
export function has_priority_score(value: number): boolean {
	return Number.isFinite(value) && value > 0;
}

/** One dataset's contribution to the "analysed cells" mask. */
export interface MaskLayer {
	readonly data: ArrayLike<number>;
	readonly nodata: number;
	/** The dataset's per-cell scaling function (run()'s afn). */
	readonly score: (value: number) => number;
}

/*
 * analysed_mask
 *
 * Which pixels satisfy every active dataset's own criteria: 1 where every
 * layer scores the cell within [0, 1], 0 where some layer clips it out (or
 * the cell is nodata for it). The pure loop of analysis.js's criteria_mask().
 */
export function analysed_mask(cell_count: number, layers: readonly MaskLayer[]): Uint8Array {
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

