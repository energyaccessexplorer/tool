// EAE-297: single Meiosis cell for the Timeline epic (EAE-304/305/306).
// See /Users/maca/Code/eae/notes/EAE-297/IMPLEMENTATION-NOTES.md.
//
// This module is pure: no DOM, no app globals (STATE/GEOGRAPHY), no
// localStorage — so node --experimental-strip-types can run its tests
// directly. Producers inject what it needs: syncDatasets receives
// GEOGRAPHY.timeline_dates from a.js's COMMIT, and the view hydrates the
// persisted modal dismissal via actions.hydrateModal at init.
//
// Deliberately NOT exposed through STATE/state_get: `timeline` there already
// means the legacy per-geography selected Date (a.js state_get, timeline.js).
// Consumers import { cell, actions, subscribe } from here directly.
//
// Erasable-syntax only (no namespace/enum): node strip-types runs the tests.

import stream from './meiosis-stream.ts';

import { same } from '../lib/helpers.js';

export interface TimelineState {
	/** Derived: true when an active dataset carries the timeline flag. */
	readonly active: boolean;

	/** EAE-305: first-add modal; `dismissed` is hydrated from localStorage. */
	readonly modal: {
		readonly dismissed: boolean;
	};

	/** EAE-305: shared year-range control (entries of GEOGRAPHY.timeline_dates). */
	readonly year: {
		readonly min: string | null;
		readonly max: string | null;
		readonly selected: string | null;
	};

	/** EAE-304: trend-lines widget. `series` is one TrendSeries per active
	 * polygons-timeline dataset; `dates` is the subset of
	 * GEOGRAPHY.timeline_dates that actually has data (see TrendSeries). Both
	 * are recomputed together by the view module when the active dataset set,
	 * the location, or the underlying CSV data changes. */
	readonly trend: {
		readonly series: readonly TrendSeries[];
		readonly dates: readonly string[];
	};

	/** EAE-306: global "only areas passing all dataset filters" toggle. */
	readonly filters: {
		readonly enabled: boolean;
		readonly perLayer: Readonly<Record<string, boolean>>;
	};

	/**
	 * EAE-306: Trend lines scoping — one clicked Filtered geographies
	 * location (an admin-tier area or a raw raster pixel); null is the
	 * whole-geography aggregate.
	 */
	readonly trendLocation: TrendLocation | null;
}

export type Patch = (state: TimelineState) => TimelineState;

/**
 * One active timeline dataset's value series across timeline_dates.
 * NaN marks a date with no data (missing cells are excluded from the
 * average); the chart skips NaN points via d3.line.defined.
 */
export interface TrendSeries {
	readonly id: string;
	readonly label: string;
	readonly color: string;
	/** The dataset category's display unit ('' when unitless). */
	readonly unit: string;
	readonly values: readonly number[];
}

/**
 * One Filtered geographies selection: an admin-tier area ({tier, id}) or a
 * raster-mode pixel ({pixel}); label is the display name. tier/id keep the
 * legacy loose number|string typing — STATE.variant keys GEOGRAPHY.divisions
 * (array-like) while dataset config's divisions_tier is JSON-typed.
 */
export type TrendLocation =
	| { readonly tier: number | string; readonly id: number | string; readonly label: string }
	| { readonly pixel: number; readonly label: string };

/**
 * Producer payload: the timeline-relevant flags of a STATE.datasets entry.
 * `timeline` is the dataset category's timeline config object
 * ({enabled, ...}) when the dataset is timeline-capable — legacy mode
 * detection is truthiness on it, not === true.
 */
export interface DatasetTimelineFlag {
	readonly timeline?: { readonly enabled?: boolean } | boolean | null;
	readonly on?: boolean;
}

export interface TimelineCell {
	/** Snapshot taken at cell() call time — re-call cell() or use
	 * subscribe() for a fresh read. */
	readonly state: TimelineState;
	update(patch: Patch): void;
}

const initial: TimelineState = {
	"active": false,

	"modal": {
		"dismissed": false,
	},

	"year": {
		"min":      null,
		"max":      null,
		"selected": null,
	},

	"trend": {
		"series": [],
		"dates":  [],
	},

	"filters": {
		"enabled":  false,
		"perLayer": {},
	},

	"trendLocation": null,
};

const update = stream<Patch>();
const states = stream.scan((state: TimelineState, patch: Patch) => patch(state), initial, update);

export const cell = (): TimelineCell => ({
	"state":  states(),
	"update": patch => { update(patch); },
});

export function subscribe(fn: (state: TimelineState) => void): () => void {
	return states.subscribe(fn);
};

export function service<T>(
	deriveFn: (state: TimelineState) => T,
	run: (state: TimelineState, slice: T) => void,
): () => void {
	return stream.dropRepeats(states, deriveFn, same).subscribe(slice => run(states(), slice));
};

export const actions = {
	selectYear(c: TimelineCell, year: string | null): void {
		c.update(s => ({ ...s, "year": { ...s.year, "selected": year } }));
	},

	/** Pure: the view persists to localStorage before dispatching this. */
	dismissModal(c: TimelineCell): void {
		c.update(s => ({ ...s, "modal": { ...s.modal, "dismissed": true } }));
	},

	/** Init-time hydration of the persisted "don't show again" flag. */
	hydrateModal(c: TimelineCell, dismissed: boolean): void {
		c.update(s => ({ ...s, "modal": { ...s.modal, dismissed } }));
	},

	setFilterEnabled(c: TimelineCell, enabled: boolean): void {
		c.update(s => ({ ...s, "filters": { ...s.filters, enabled } }));
	},

	setTrendLocation(c: TimelineCell, location: TrendLocation | null): void {
		c.update(s => ({ ...s, "trendLocation": location }));
	},

	/**
	 * Replaces the derived trend slice atomically: `series` plus the
	 * `dates` those series are indexed by (the subset of the geography's
	 * timeline_dates that has data). When `dates` is non-empty it also
	 * corrects `year.min/max/selected` so the year control never offers — or
	 * defaults to — a year with no data.
	 *
	 * NaN-safe no-op guard: Object.is(NaN, NaN) is true, so series with
	 * missing cells compare equal and don't trigger a pointless emission
	 * (a same()-based guard would never fire once EAE-498 lets NaN in,
	 * looping update -> render -> update).
	 */
	setTrend(c: TimelineCell, series: readonly TrendSeries[], dates: readonly string[]): void {
		const prev = c.state.trend;
		const prevYear = c.state.year;

		const seriesUnchanged = prev.series.length === series.length && series.every((s, i) => {
			const p = prev.series[i];
			return p !== undefined
				&& p.id === s.id && p.label === s.label && p.color === s.color && p.unit === s.unit
				&& p.values.length === s.values.length
				&& s.values.every((v, j) => Object.is(v, p.values[j]));
		});
		const datesUnchanged = prev.dates.length === dates.length
			&& dates.every((d, i) => d === prev.dates[i]);

		let year = prevYear;
		if (dates.length > 0) {
			const min = dates[0] ?? null;
			const max = dates[dates.length - 1] ?? null;
			let selected = prevYear.selected;
			if (selected === null || dates.indexOf(selected) === -1) selected = max;

			if (prevYear.min !== min || prevYear.max !== max || prevYear.selected !== selected)
				year = { min, max, selected };
		}

		if (seriesUnchanged && datesUnchanged && year === prevYear) return;

		c.update(s => ({
			...s,
			"trend": { "series": series, "dates": dates },
			"year":  year === prevYear ? s.year : year,
		}));
	},
} as const;

/**
 * Called from a.js's COMMIT (not reload()) whenever STATE.datasets changes.
 * `timelineDates` is GEOGRAPHY.timeline_dates, injected by the caller.
 */
export function syncDatasets(
	datasets: readonly DatasetTimelineFlag[],
	timelineDates: readonly string[] | null | undefined,
): void {
	const c = cell();

	const active = datasets.some(d => Boolean(d.timeline) && Boolean(d.on));
	if (active === c.state.active) return;

	const last = timelineDates?.[timelineDates.length - 1] ?? null;

	c.update(s => ({
		...s,
		active,
		"year": active ? {
			"min":      s.year.min ?? (timelineDates?.[0] ?? null),
			"max":      s.year.max ?? last,
			"selected": s.year.selected ?? last,
		} : s.year,
	}));
};
