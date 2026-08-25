// EAE-297: single Meiosis cell for the Timeline epic (EAE-304/305/306).
// See /Users/maca/Code/eae/notes/EAE-297/IMPLEMENTATION-NOTES.md.
//
// Deliberately NOT exposed through STATE/state_get: `timeline` there already
// means the legacy per-geography selected Date (a.js:144, timeline.js:328).
// Consumers import { cell, actions, subscribe } from here directly.

import stream from './meiosis-stream.js';

import { same } from '../lib/helpers.js';

const initial = {
	"active": false,

	"modal": {
		"dismissed": localStorage.getItem('timeline-modal-dismissed') === '1',
	},

	"year": {
		"min":      null,
		"max":      null,
		"selected": null,
	},

	"trend": {
		"series": [],
	},

	"filters": {
		"enabled":  false,
		"perLayer": {},
	},

	"filteredGeographies": {
		"tier":     0,
		"page":     1,
		"pageSize": 10,
		"ids":      [],
	},
};

const update = stream();
const states = stream.scan((state, patch) => patch(state), initial, update);

export const cell = () => ({ "state": states(), "update": patch => update(patch) });

export function subscribe(fn) {
	return states.subscribe(fn);
};

export function service(deriveFn, run) {
	return stream.dropRepeats(states, deriveFn, same).subscribe(slice => run(states(), slice));
};

export const actions = {
	selectYear: (c, year) => c.update(s => ({ ...s, "year": { ...s.year, "selected": year } })),

	dismissModal: c => {
		localStorage.setItem('timeline-modal-dismissed', '1');
		c.update(s => ({ ...s, "modal": { ...s.modal, "dismissed": true } }));
	},

	setFilterEnabled: (c, enabled) => c.update(s => ({ ...s, "filters": { ...s.filters, enabled } })),
};

// Called from a.js's COMMIT (not reload()) whenever STATE.datasets changes.
export function syncDatasets(datasets) {
	const c = cell();

	const active = datasets.some(d => d.timeline && d.on);
	if (active === c.state.active) return;

	c.update(s => ({
		...s,
		active,
		"year": active ? {
			"min":      s.year.min ?? (GEOGRAPHY.timeline_dates?.[0] ?? null),
			"max":      s.year.max ?? (GEOGRAPHY.timeline_dates?.slice(-1)[0] ?? null),
			"selected": s.year.selected ?? (GEOGRAPHY.timeline_dates?.slice(-1)[0] ?? null),
		} : s.year,
	}));
};
