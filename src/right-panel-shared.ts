// Shared bits for the right-panel tab atoms and views.
//
// Both tabs (Data, Prioritization) keep their own Meiosis atom for now, but
// they describe the same selection (a clicked admin feature or raster pixel)
// and filter the same dataset set. These are the pieces they share; when the
// two atoms consolidate into one, this module is where the merge starts.

import { t, translateUnit } from './translate.js';

/** An admin-division feature the user clicked (as produced by mapbox).
 * `_variant` tags items originating from a variant-tagged list (EAE-306
 * Filtered geographies); the Prioritization tab skips per-index entries
 * for those (no priority score exists for timeline coverage). */
export interface AdminRef {
	readonly variant: string;
	readonly id: number;
	readonly _variant?: string | number;
}

/**
 * Minimal structural type for the legacy dataset objects the views touch
 * (STATE.datasets entries). Full dataset typing is out of scope; grow as
 * more modules are ported.
 */
export interface LegacyDataset {
	readonly id: string;
	readonly name: string;
	readonly on: boolean;
	readonly type?: string;
	// matches the legacy DS method name (ds.js) — not renamed
	info_modal(): void;
	readonly category?: {
		readonly name: string;
		readonly datatype?: string;
		readonly unit?: string;
		readonly analysis?: { readonly aggregation?: string };
		readonly controls?: { readonly path?: readonly string[]; readonly range_label?: string };
	};
	readonly csv?: {
		readonly data?: ReadonlyArray<Record<string, unknown>>;
		readonly key?: string;
		readonly column?: string;
	};
	readonly raster?: RasterLike;
	/** Colour ramp: `fn` maps a value to a colour, `stops` is the ramp itself. */
	readonly colorscale?: {
		readonly fn: (value: number) => string;
		readonly stops?: readonly string[];
		readonly intervals?: readonly number[];
	};
	/** Vector layers paint one fill/stroke rather than a ramp. */
	readonly vectors?: {
		readonly fill?: string;
		readonly stroke?: string;
		readonly shape_type?: string;
	};
	readonly domain?: { readonly min: number; readonly max: number };
	/** A dataset that hosts others labels its ramp from the host. */
	readonly hosts?: readonly LegacyDataset[];
	readonly host?: LegacyDataset;
	/** The card lets the user pick the domain instead of reading it. */
	readonly _domain_select?: boolean;
}

/** The ends of a dataset's ramp and what sits between them, as the dataset
 * cards label it. */
export interface RampLabels {
	readonly min: string;
	readonly mid: string;
	readonly max: string;
}

/** A single-colour layer draws a mark rather than a ramp. */
export interface LayerMark {
	readonly shape: 'point' | 'line' | 'area';
	readonly color: string;
}

/** Everything a legend needs to draw one layer, whichever surface draws it: the
 * colour ramp when the layer paints one, the ends to label, and the single
 * colour vector layers use instead of a ramp. */
export interface LayerLegend {
	readonly stops: readonly string[] | null;
	readonly labels: RampLabels | null;
	readonly mark: LayerMark | null;
}

/**
 * A layer's legend as data, so the dataset card and the exported map read the
 * same numbers instead of each deriving them.
 */
export function layer_legend(ds: LegacyDataset): LayerLegend | null {
	const source = (ds.hosts ? ds.host : ds) ?? ds;
	const stops = source.colorscale?.stops;
	const legend: LayerLegend = {
		"stops":  stops?.length ? stops : null,
		"labels": ramp_labels(ds),
		"mark":   layer_mark(ds),
	};

	if (!legend.stops && !legend.labels && !legend.mark) return null;

	return legend;
}

/**
 * min / unit / max for a layer's legend, labelled the way the cards label it:
 * the decimals follow the spread of the domain, and a 0–100 percentage keeps
 * whole numbers. Null when the dataset has no domain to label.
 */
function ramp_labels(ds: LegacyDataset): RampLabels | null {
	const source = (ds.hosts ? ds.host : ds) ?? ds;
	const cat = ds.category;

	if (!source.domain) return null;

	const mid = cat?.controls?.range_label
		?? translateUnit(window.LOCALE, cat?.unit)
		?? t(window.LOCALE, 'left_panel.cards.card.range');

	if (source._domain_select) return { "min": '', mid, "max": '' };

	const { min, max } = source.domain;
	const digits = ramp_digits(min, max, cat?.unit);

	return { "min": min.toFixed(digits), mid, "max": max.toFixed(digits) };
}

function ramp_digits(min: number, max: number, unit: string | undefined): number {
	const spread = Math.abs(max - min);
	const from_spread = 3 - Math.ceil(Math.log10(spread || 1));

	if (unit === '%' && ((min === 0 && max === 100) || (min === 100 && max === 0))) return 0;

	return Math.max(from_spread, 0);
}

/** The colour a layer without a ramp paints its features with. */
function layer_mark(ds: LegacyDataset): LayerMark | null {
	const shape = ds.vectors?.shape_type ?? ds.type ?? '';
	const { fill, stroke } = ds.vectors ?? {};

	if (!fill && !stroke) return null;

	if (shape.startsWith('points')) return { "shape": 'point', "color": fill ?? stroke ?? '' };

	if (shape.startsWith('lines')) return { "shape": 'line', "color": stroke ?? fill ?? '' };

	if (shape.startsWith('polygons')) return { "shape": 'area', "color": fill ?? stroke ?? '' };

	return null;
}

/**
 * Datasets the right panel shows cards for: switched on, and not the
 * internal boundaries/outline datasets. Both tabs filter STATE.datasets
 * with exactly this predicate.
 */
export function activeDatasets(): LegacyDataset[] {
	return (STATE.datasets as LegacyDataset[]).filter(
		ds => ds.on && ds.category?.name !== 'boundaries' && ds.category?.name !== 'outline',
	);
}
