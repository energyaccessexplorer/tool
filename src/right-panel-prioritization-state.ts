// Meiosis cell for the right-panel Prioritization tab.
// Same conventions as right-panel-data-state.ts (one atom per feature scope;
// consumers import the cell directly). See that module's header for the
// references.
//
// This module is pure: no DOM, no app globals (STATE/GEOGRAPHY/EAE), so
// node --experimental-strip-types runs its unit tests directly. Everything
// impure the old right-panel-prioritization-tab.js did (running the per-index
// analyses, division averages, priority scales, DOM and i18n) lives in the
// view module right-panel-prioritization-tab.ts.
//
// Parity notes vs the legacy module:
// - update(raster_index, admin_info, analysis_value) -> actions.locationSelected
// - the async per-index analysis results               -> actions.entriesComputed
//   (legacy wrote straight into the DOM; a stale computation racing a newer
//   selection or a close could clobber it. entriesComputed is only applied
//   while the view is still location-and-pending — same staleness guard as
//   the Data tab's nationalComputed)
// - clear()                              -> actions.backToNational
// - update_location_summary(data, info)  -> the summary slice of
//   actions.locationSelected (built by the pure toSummary helper)
// - clear_location_summary()             -> folded into actions.backToNational
//   (every legacy caller already invoked the two together)
//
// Erasable-syntax only (no namespace/enum): node strip-types runs the tests.

import stream from './meiosis-stream.ts';

import type {
	AdminRef,
} from './right-panel-shared.ts';

export type {
	AdminRef,
} from './right-panel-shared.ts';

/**
 * One index's priority result for the current selection. `value` is the raw
 * index value (null when the pixel/area has none); `bucket` is the value
 * mapped through the applicable scale (low/med/high for pixels, the
 * division quantile scale for admin areas) — the label the row displays,
 * resolved to a locale label at render time.
 */
export interface IndexEntry {
	readonly value: number | null;
	readonly bucket: string | null;
}

/** Keyed by index id ('eai', 'demand', 'supply', 'ani', ...). */
export type IndexEntries = Readonly<Record<string, IndexEntry>>;

/**
 * What the Prioritization tab is showing.
 *
 * - 'national': nothing selected — default geography title, empty priority
 *               card area. (The tab's blank/loading states are owned by
 *               right-panel.js, which also drives the graphs wrapper.)
 * - 'location': a map-info is open. `entries` null means the per-index
 *               analyses are running; the view leaves the container empty
 *               meanwhile (legacy update() did the same synchronously).
 */
export type PriorityView =
	| { readonly kind: 'national' }
	| {
		readonly kind: 'location';
		readonly admin: AdminRef | null;
		readonly rasterIndex: number | null;
		readonly analysisValue: number | null;
		readonly entries: IndexEntries | null;
	};

/**
 * Raw inputs for the #location-summary strip (shown above the tabs for
 * either tab). Values are untranslated; the view formats them at render
 * time so a locale switch re-renders correctly.
 */
export interface LocationSummary {
	readonly coordinates: string | null;
	readonly priorityScore: string | number | null;
	/** Admin variant when an admin feature was clicked; null for a raster pixel. */
	readonly variant: string | null;
	readonly locationName: string | null;
}

export interface PriorityState {
	readonly view: PriorityView;
	readonly summary: LocationSummary | null;
}

export type Patch = (state: PriorityState) => PriorityState;

export interface PriorityCell {
	/** Snapshot taken at cell() call time (timeline-state convention) —
	 * re-call cell() or use subscribe() for a fresh read. */
	readonly state: PriorityState;
	update(patch: Patch): void;
}

const initial: PriorityState = {
	"view":    { "kind": 'national' },
	"summary": null,
};

const update = stream<Patch>();
const states = stream.scan((state: PriorityState, patch: Patch) => patch(state), initial, update);

export const cell = (): PriorityCell => ({
	"state":  states(),
	"update": patch => { update(patch); },
});

export function subscribe(fn: (state: PriorityState) => void): () => void {
	return states.subscribe(fn);
};

export const actions = {
	/**
	 * map-info opened: show the selection's title and (asynchronously
	 * computed) index-priority card, plus the location-summary strip.
	 */
	locationSelected(
		c: PriorityCell,
		payload: {
			admin?: AdminRef | null | undefined;
			rasterIndex?: number | null | undefined;
			analysisValue?: number | null | undefined;
			summary?: LocationSummary | null | undefined;
		},
	): void {
		// Replaces both fields wholesale — no spread of the previous state.
		c.update(() => ({
			"view": {
				"kind":          'location',
				"admin":         payload.admin ?? null,
				"rasterIndex":   payload.rasterIndex ?? null,
				"analysisValue": payload.analysisValue ?? null,
				"entries":       null,
			},
			"summary": payload.summary ?? null,
		}));
	},

	/**
	 * The per-index analyses resolved. Only applied while the view is still
	 * location-and-pending — a stale computation (map-info closed or
	 * re-opened meanwhile) is dropped instead of clobbering the view.
	 */
	entriesComputed(c: PriorityCell, entries: IndexEntries): void {
		c.update(s => (s.view.kind === 'location' && s.view.entries === null
			? { ...s, "view": { ...s.view, entries } }
			: s));
	},

	/**
	 * map-info closed or analysis lifecycle reset: back to the default
	 * national view and hide the location-summary strip (legacy clear() +
	 * clear_location_summary(), which callers always invoked together).
	 */
	backToNational(c: PriorityCell): void {
		c.update(s => ({ ...s, "view": { "kind": 'national' }, "summary": null }));
	},
} as const;

// ---------------------------------------------------------------------------
// Pure helpers (exported for the producers and for unit tests).
// ---------------------------------------------------------------------------

/**
 * Minimal structural type for the area_info() payload (area-analysis.js)
 * the summary is extracted from. basicData rows carry a stable `key` plus
 * an already-translated `label`; the `key` is what we match on.
 */
export interface AreaInfoLike {
	readonly coordinates?: string | null;
	readonly basicData?: ReadonlyArray<{
		readonly key?: string;
		readonly value?: string | number | null;
	}>;
}

/**
 * Legacy update_location_summary extraction: the 'Priority score' row is
 * mandatory (without it the legacy function returned early and showed
 * nothing); 'Location' and coordinates are optional.
 */
export function toSummary(data: AreaInfoLike | null | undefined, admin: AdminRef | null): LocationSummary | null {
	const score = data?.basicData?.find(e => e.key === 'Priority score');
	if (!score) return null;

	const location = data?.basicData?.find(e => e.key === 'Location');

	return {
		"coordinates":  data?.coordinates ?? null,
		"priorityScore": score.value ?? null,
		"variant":      admin?.variant ?? null,
		"locationName": location?.value != null ? String(location.value) : null,
	};
};
