import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
	actions,
	cell,
	subscribe,
	toSummary,
} from '../src/right-panel-prioritization-state.ts';

import type {
	IndexEntries,
	PriorityState,
} from '../src/right-panel-prioritization-state.ts';

// cell() snapshots state at call time (timeline-state convention): re-read
// after every action instead of holding on to a cell's `state` property.
const state = (): PriorityState => cell().state;

const entries = (over: Partial<IndexEntries> = {}): IndexEntries => ({
	"eai":    { "value": 0.5, "bucket": 'Medium' },
	"demand": { "value": null, "bucket": null },
	...over,
});

const summary = {
	"coordinates":  '12.34, 56.78',
	"priorityScore": '0.42',
	"variant":      'division-1',
	"locationName": 'Some District',
};

describe('right-panel-prioritization-state: atom', () => {
	it('starts national with no summary', () => {
		assert.deepEqual(state().view, { "kind": 'national' });
		assert.equal(state().summary, null);
	});

	it('locationSelected switches to a pending location view and sets the summary', () => {
		const c = cell();
		actions.locationSelected(c, { "summary": summary });

		const view = state().view;
		assert.equal(view.kind, 'location');
		if (view.kind !== 'location') return;
		assert.equal(view.admin, null);
		assert.equal(view.rasterIndex, null);
		assert.equal(view.analysisValue, null);
		assert.equal(view.entries, null);
		assert.deepEqual(state().summary, summary);
	});

	it('locationSelected carries the selection', () => {
		const c = cell();
		actions.locationSelected(c, {
			"admin":         { "variant": 'division-1', "id": 42 },
			"rasterIndex":   7,
			"analysisValue": 0.9,
		});

		const view = state().view;
		if (view.kind !== 'location') return assert.fail('expected location view');
		assert.deepEqual(view.admin, { "variant": 'division-1', "id": 42 });
		assert.equal(view.rasterIndex, 7);
		assert.equal(view.analysisValue, 0.9);
	});

	it('entriesComputed fills a pending location view', () => {
		const c = cell();
		actions.locationSelected(c, {});
		actions.entriesComputed(c, entries());

		const view = state().view;
		if (view.kind !== 'location') return assert.fail('expected location view');
		assert.equal(view.entries?.['eai']?.bucket, 'Medium');
	});

	it('entriesComputed is dropped when the view moved on (staleness guard)', () => {
		// Legacy race: update() awaited the per-index analyses; if the map-info
		// was closed meanwhile, the late results still rendered. Now dropped.
		const c = cell();
		actions.locationSelected(c, {});
		actions.backToNational(c);
		actions.entriesComputed(c, entries());

		assert.equal(state().view.kind, 'national');
	});

	it('entriesComputed does not overwrite already-computed entries', () => {
		const c = cell();
		actions.locationSelected(c, {});
		actions.entriesComputed(c, entries({ "eai": { "value": 0.1, "bucket": 'Low' } }));
		actions.entriesComputed(c, entries({ "eai": { "value": 0.9, "bucket": 'High' } }));

		const view = state().view;
		if (view.kind !== 'location') return assert.fail('expected location view');
		assert.equal(view.entries?.['eai']?.bucket, 'Low');
	});

	it('backToNational returns to national and clears the summary', () => {
		const c = cell();
		actions.locationSelected(c, { "summary": summary });
		actions.backToNational(c);

		assert.deepEqual(state().view, { "kind": 'national' });
		assert.equal(state().summary, null);
	});

	it('notifies subscribers on every action', () => {
		const seen: Array<PriorityState['view']['kind']> = [];
		const off = subscribe(s => seen.push(s.view.kind));

		actions.locationSelected(cell(), {});
		actions.entriesComputed(cell(), entries());
		actions.backToNational(cell());
		off();
		actions.backToNational(cell());

		assert.deepEqual(seen, ['location', 'location', 'national']);
	});
});

describe('right-panel-prioritization-state: toSummary', () => {
	const data = {
		"coordinates": '12.34, 56.78',
		"basicData": [
			{ "key": 'Priority score', "value": '0.42' },
			{ "key": 'Location', "value": 'Some District' },
		],
	};

	it('extracts the summary from an area_info payload', () => {
		assert.deepEqual(toSummary(data, { "variant": 'division-1', "id": 42 }), {
			"coordinates":  '12.34, 56.78',
			"priorityScore": '0.42',
			"variant":      'division-1',
			"locationName": 'Some District',
		});
	});

	it('returns null without a priority score (legacy early return)', () => {
		assert.equal(toSummary({ "basicData": [{ "key": 'Location', "value": 'x' }] }, null), null);
		assert.equal(toSummary(null, null), null);
		assert.equal(toSummary(undefined, null), null);
	});

	it('maps a raster selection to a null variant and tolerates missing rows', () => {
		assert.deepEqual(toSummary({ "basicData": [{ "key": 'Priority score', "value": 3 }] }, null), {
			"coordinates":  null,
			"priorityScore": 3,
			"variant":      null,
			"locationName": null,
		});
	});
});
