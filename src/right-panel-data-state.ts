// Meiosis cell for the right-panel Data tab.
// See /Users/maca/Code/eae/notes/EAE-297/IMPLEMENTATION-NOTES.md for the
// cell conventions (one atom per feature scope; consumers import the cell
// directly instead of routing through the legacy STATE proxy).
//
// This module is pure: no DOM, no app globals (STATE/GEOGRAPHY/OUTLINE/DST),
// so node --experimental-strip-types runs its unit tests directly. Anything
// impure the old right-panel-data-tab.js did (national aggregation against
// OUTLINE/DST/analysis.js, categorical-distribution caching, formatting and
// i18n) lives in the view module right-panel-data-tab.ts.
//
// Parity notes vs the legacy module:
// - set_analysis_layer_data(data)        -> actions.analysisCompleted
// - update(entries, admin, raster_index) -> actions.locationSelected
// - clear()                              -> actions.backToNational
//   (clear() also wiped the view-side caches and re-aggregated; the view's
//   national service does that when it sees a pending national view)
// - init()                               -> actions.enterBlank
// - update_top_level_geography() racing a map-info open could land its
//   national cards AFTER the location cards, clobbering them. The
//   nationalComputed staleness guard below fixes that: a computed payload is
//   only applied while the view is still national-and-pending.
//
// Erasable-syntax only (no namespace/enum): node strip-types runs the tests.

import stream from './meiosis-stream.ts';

/** An admin-division feature the user clicked (as produced by mapbox). */
export interface AdminRef {
	readonly variant: string;
	readonly id: number;
}

/**
 * One layer's computed value for the current geography/location (the Data
 * tab's camelCase domain shape). `value` is a producer-formatted display
 * string today; `rawValue` is the raw value and may carry the 'Not
 * aggregated' sentinel string.
 */
export interface LayerEntry {
	readonly label: string;
	readonly value: string | number | null;
	readonly rawValue: string | number | null;
	readonly unit?: string | null;
	readonly aggregation?: string | null;
	readonly subordinate?: boolean;
}

/**
 * The legacy producer payload the atom receives at the action boundary:
 * area_analysis.js's `detailedData` rows (map-info feeds them straight in).
 * The shape is shared with map-info's own DOM and the prioritization tab,
 * so its snake_case keys stay as-is; toLayerEntries converts to LayerEntry.
 * Rows also carry key/has_info_button/has_subordinates — the Data tab
 * ignores those, and map-info renders them from its own copy of the rows.
 */
export interface DetailedDatum {
	readonly label: string;
	readonly value: string | number | null;
	readonly raw_value: string | number | null;
	readonly unit?: string | null;
	readonly aggregation?: string | null;
	readonly subordinate?: boolean;
}

/** Converts legacy detailedData rows to the camelCase domain shape. */
export function toLayerEntries(rows: readonly DetailedDatum[]): LayerEntry[] {
	return rows.map(row => ({
		"label":       row.label,
		"value":       row.value,
		"rawValue":    row.raw_value,
		"unit":        row.unit ?? null,
		"aggregation": row.aggregation ?? null,
		...(row.subordinate === undefined ? {} : { "subordinate": row.subordinate }),
	}));
}

/** One dataset's aggregates, as returned by analysis.js aggregate_layer_values. */
export interface AggregateResult {
	readonly type: string;
	readonly value: number | string;
}

export interface AggregatedLayer {
	readonly name: string;
	readonly aggregation?: string | null;
	readonly unit?: string | null;
	readonly areas?: ReadonlyArray<{ readonly result?: AggregateResult | null }>;
}

/** Keyed by dataset id. */
export type AggregatedLayerData = Readonly<Record<string, AggregatedLayer>>;

/**
 * What the Data tab is showing.
 *
 * - 'blank':    nothing to show yet (initial state / init()).
 * - 'national': whole-geography overview cards. `entries` null means the
 *               aggregates are being (re)computed asynchronously; the view
 *               leaves the pane empty meanwhile (legacy clear() emptied the
 *               container synchronously too).
 * - 'location': a map-info is open (feature click or pixel inspect) and its
 *               detailedData entries drive the cards. `admin` is the clicked
 *               admin feature when there is one; `rasterIndex` is the hovered
 *               raster pixel otherwise.
 */
export type DataView =
	| { readonly kind: 'blank' }
	| { readonly kind: 'national'; readonly entries: readonly LayerEntry[] | null }
	| {
		readonly kind: 'location';
		readonly admin: AdminRef | null;
		readonly rasterIndex: number | null;
		readonly entries: readonly LayerEntry[];
	};

export interface DataState {
	readonly view: DataView;
	/** Aggregates clipped to the analysis mask; set by right-panel.js graphs(). */
	readonly analysisLayerData: AggregatedLayerData | null;
}

export type Patch = (state: DataState) => DataState;

export interface DataCell {
	/** Snapshot taken at cell() call time (timeline-state convention) —
	 * re-call cell() or use subscribe() for a fresh read. */
	readonly state: DataState;
	update(patch: Patch): void;
}

const initial: DataState = {
	"view":             { "kind": 'blank' },
	"analysisLayerData": null,
};

const update = stream<Patch>();
const states = stream.scan((state: DataState, patch: Patch) => patch(state), initial, update);

export const cell = (): DataCell => ({
	"state":  states(),
	"update": patch => { update(patch); },
});

export function subscribe(fn: (state: DataState) => void): () => void {
	return states.subscribe(fn);
};

export const actions = {
	/**
	 * map-info opened: show the clicked location's cards. Entries are the
	 * legacy detailedData rows; they are converted to camelCase LayerEntry
	 * before being stored.
	 */
	locationSelected(
		c: DataCell,
		payload: {
			entries: readonly DetailedDatum[];
			admin?: AdminRef | null | undefined;
			rasterIndex?: number | null | undefined;
		},
	): void {
		c.update(s => ({
			...s,
			"view": {
				"kind":        'location',
				"admin":       payload.admin ?? null,
				"rasterIndex": payload.rasterIndex ?? null,
				"entries":     toLayerEntries(payload.entries),
			},
		}));
	},

	/**
	 * map-info closed, analysis lifecycle reset, or dataset set changed:
	 * recompute the national overview. entries: null marks the async gap;
	 * the view's national service fills it in.
	 */
	backToNational(c: DataCell): void {
		c.update(s => ({ ...s, "view": { "kind": 'national', "entries": null } }));
	},

	/**
	 * The national service resolved its aggregates. Only applied while the
	 * view is still national-and-pending — a stale computation (user opened
	 * a map-info meanwhile) is dropped instead of clobbering the location
	 * cards (fixes the legacy clear()/update_top_level_geography race).
	 */
	nationalComputed(c: DataCell, entries: readonly LayerEntry[]): void {
		c.update(s => (s.view.kind === 'national' && s.view.entries === null
			? { ...s, "view": { "kind": 'national', entries } }
			: s));
	},

	/** init()/first paint: blank until datasets or aggregates exist. */
	enterBlank(c: DataCell): void {
		c.update(s => ({ ...s, "view": { "kind": 'blank' } }));
	},

	/**
	 * An analysis run finished: swap in the aggregates clipped to the
	 * analysis mask. Does not itself change the view — the producer follows
	 * with backToNational (legacy order: set_analysis_layer_data then
	 * update_analysis → clear).
	 */
	analysisCompleted(c: DataCell, layerData: AggregatedLayerData): void {
		c.update(s => ({ ...s, "analysisLayerData": layerData }));
	},
} as const;

// ---------------------------------------------------------------------------
// Pure helpers (exported for the view module and for unit tests).
// ---------------------------------------------------------------------------

/**
 * Legacy resolve_admin_info, with the app globals injected:
 * an explicit admin ref wins; otherwise resolve the admin division covering
 * the given raster pixel (not for the 'raster' variant itself).
 */
export function resolveAdminInfo(
	admin: AdminRef | null,
	rasterIndex: number | null,
	variant: string,
	divisionRaster: { readonly data: ArrayLike<number>; readonly nodata: number } | null | undefined,
): AdminRef | null {
	if (admin) return admin;
	if (rasterIndex == null || variant === 'raster') return null;
	if (!divisionRaster?.data) return null;

	const id = divisionRaster.data[rasterIndex];
	if (id == null || id === divisionRaster.nodata) return null;

	return { variant, id };
};

/**
 * Legacy by_label merge from update(): drop subordinate rows and entries
 * with no value ('Not aggregated' sentinel included), index by dataset name;
 * later duplicates win.
 */
export function indexEntries(entries: readonly LayerEntry[]): ReadonlyMap<string, LayerEntry> {
	const byLabel = new Map<string, LayerEntry>();

	for (const e of entries) {
		if (e.subordinate) continue;
		if (e.rawValue == null || e.rawValue === 'Not aggregated') continue;
		byLabel.set(e.label, e);
	}

	return byLabel;
};
