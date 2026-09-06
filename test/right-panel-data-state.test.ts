import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
	actions,
	cell,
	subscribe,
	resolveAdminInfo,
	indexEntries,
	toLayerEntries,
} from '../src/right-panel-data-state.ts';

import type {
	DataState,
	DetailedDatum,
	LayerEntry,
} from '../src/right-panel-data-state.ts';

/** CamelCase domain entry (nationalComputed / stored state). */
const entry = (over: Partial<LayerEntry> = {}): LayerEntry => ({
	"label":    'Solar potential',
	"value":    '1 234 kWh/m²',
	"rawValue": 1234,
	"unit":     'kWh/m²',
	...over,
});

/** Legacy detailedData row (locationSelected payload, snake_case). */
const datum = (over: Partial<DetailedDatum> = {}): DetailedDatum => ({
	"label":     'Solar potential',
	"value":     '1 234 kWh/m²',
	"raw_value": 1234,
	"unit":      'kWh/m²',
	...over,
});

// cell() snapshots state at call time (timeline-state convention): re-read
// after every action instead of holding on to a cell's `state` property.
const state = (): DataState => cell().state;

describe('right-panel-data-state: atom', () => {
	it('starts blank with no analysis data', () => {
		assert.deepEqual(state().view, { "kind": 'blank' });
		assert.equal(state().analysisLayerData, null);
	});

	it('locationSelected switches to the location view and normalises undefined', () => {
		const c = cell();
		actions.locationSelected(c, { "entries": [datum()], "admin": undefined, "rasterIndex": undefined });

		assert.equal(state().view.kind, 'location');
		const view = state().view;
		if (view.kind !== 'location') return;
		assert.equal(view.admin, null);
		assert.equal(view.rasterIndex, null);
		assert.equal(view.entries.length, 1);
	});

	it('locationSelected carries the clicked admin feature', () => {
		const c = cell();
		actions.locationSelected(c, {
			"entries": [datum()],
			"admin":   { "variant": 'division-1', "id": 42 },
		});

		const view = state().view;
		assert.equal(view.kind, 'location');
		if (view.kind !== 'location') return;
		assert.deepEqual(view.admin, { "variant": 'division-1', "id": 42 });
	});

	it('locationSelected converts legacy rows to camelCase entries', () => {
		const c = cell();
		actions.locationSelected(c, {
			"entries": [datum({ "subordinate": true }), datum({ "label": 'Other', "raw_value": 'Not aggregated' })],
		});

		const view = state().view;
		if (view.kind !== 'location') return assert.fail('expected location view');
		assert.equal(view.entries[0]?.rawValue, 1234);
		assert.equal(view.entries[0]?.subordinate, true);
		assert.equal(view.entries[1]?.rawValue, 'Not aggregated');
	});

	it('backToNational enters the pending national view, keeping analysis data', () => {
		const c = cell();
		const layerData = { "solar": { "name": 'Solar potential' } };

		actions.analysisCompleted(c, layerData);
		actions.locationSelected(c, { "entries": [datum()] });
		actions.backToNational(c);

		assert.deepEqual(state().view, { "kind": 'national', "entries": null });
		assert.equal(state().analysisLayerData, layerData);
	});

	it('nationalComputed fills a pending national view', () => {
		const c = cell();
		actions.backToNational(c);
		actions.nationalComputed(c, [entry()]);

		const view = state().view;
		assert.equal(view.kind, 'national');
		if (view.kind !== 'national') return;
		assert.equal(view.entries?.length, 1);
	});

	it('nationalComputed is dropped when the view moved on (staleness guard)', () => {
		// Legacy race: clear() started an async national recompute, then a
		// map-info opened; the late national payload clobbered the location
		// cards. Now the guard drops it.
		const c = cell();
		actions.backToNational(c);
		actions.locationSelected(c, { "entries": [datum({ "label": 'clicked' })] });
		actions.nationalComputed(c, [entry({ "label": 'stale-national' })]);

		const view = state().view;
		assert.equal(view.kind, 'location');
		if (view.kind !== 'location') return;
		assert.equal(view.entries[0]?.label, 'clicked');
	});

	it('nationalComputed does not overwrite an already-computed national view', () => {
		const c = cell();
		actions.backToNational(c);
		actions.nationalComputed(c, [entry({ "label": 'first' })]);
		actions.nationalComputed(c, [entry({ "label": 'second' })]);

		const view = state().view;
		if (view.kind !== 'national') return assert.fail('expected national view');
		assert.equal(view.entries?.[0]?.label, 'first');
	});

	it('enterBlank returns to the blank view', () => {
		const c = cell();
		actions.locationSelected(c, { "entries": [datum()] });
		actions.enterBlank(c);

		assert.deepEqual(state().view, { "kind": 'blank' });
	});

	it('analysisCompleted does not change the current view', () => {
		const c = cell();
		actions.locationSelected(c, { "entries": [datum()] });
		actions.analysisCompleted(c, { "x": { "name": 'X' } });

		assert.equal(state().view.kind, 'location');
		assert.equal(state().analysisLayerData?.['x']?.name, 'X');
	});

	it('notifies subscribers on every action', () => {
		const seen: Array<DataState['view']['kind']> = [];
		const off = subscribe(s => seen.push(s.view.kind));

		actions.backToNational(cell());
		actions.nationalComputed(cell(), []);
		actions.enterBlank(cell());
		off();
		actions.enterBlank(cell());

		assert.deepEqual(seen, ['national', 'national', 'blank']);
	});
});

describe('right-panel-data-state: toLayerEntries', () => {
	it('maps snake_case rows to camelCase entries', () => {
		const rows: DetailedDatum[] = [
			{ "label": 'a', "value": 'A', "raw_value": 1, "unit": 'km', "aggregation": 'SUM' },
			{ "label": 'b', "value": null, "raw_value": null, "subordinate": true },
		];

		assert.deepEqual(toLayerEntries(rows), [
			{ "label": 'a', "value": 'A', "rawValue": 1, "unit": 'km', "aggregation": 'SUM' },
			{ "label": 'b', "value": null, "rawValue": null, "unit": null, "aggregation": null, "subordinate": true },
		]);
	});

	it('omits optional fields that are absent on the source row', () => {
		const [mapped] = toLayerEntries([{ "label": 'a', "value": 'A', "raw_value": 'x' }]);
		assert.deepEqual(mapped, { "label": 'a', "value": 'A', "rawValue": 'x', "unit": null, "aggregation": null });
	});
});

describe('right-panel-data-state: resolveAdminInfo', () => {
	const raster = { "data": [7, 7, -9999, 3], "nodata": -9999 };

	it('prefers an explicit admin ref', () => {
		const admin = { "variant": 'division-2', "id": 9 };
		assert.deepEqual(resolveAdminInfo(admin, 0, 'division-1', raster), admin);
	});

	it('resolves the division covering a raster pixel', () => {
		assert.deepEqual(resolveAdminInfo(null, 0, 'division-1', raster), { "variant": 'division-1', "id": 7 });
	});

	it('returns null for the raster variant itself', () => {
		assert.equal(resolveAdminInfo(null, 0, 'raster', raster), null);
	});

	it('returns null without a pixel or without raster data', () => {
		assert.equal(resolveAdminInfo(null, null, 'division-1', raster), null);
		assert.equal(resolveAdminInfo(null, 0, 'division-1', null), null);
		assert.equal(resolveAdminInfo(null, 0, 'division-1', undefined), null);
	});

	it('returns null on nodata or missing pixels', () => {
		assert.equal(resolveAdminInfo(null, 2, 'division-1', raster), null);
		assert.equal(resolveAdminInfo(null, 99, 'division-1', raster), null);
	});
});

describe('right-panel-data-state: indexEntries', () => {
	it('indexes value-bearing, non-subordinate entries by label', () => {
		const byLabel = indexEntries([
			entry({ "label": 'a' }),
			entry({ "label": 'b', "subordinate": true }),
			entry({ "label": 'c', "rawValue": null }),
			entry({ "label": 'd', "rawValue": 'Not aggregated' }),
		]);

		assert.deepEqual([...byLabel.keys()], ['a']);
	});

	it('keeps later duplicates (legacy Map behaviour)', () => {
		const byLabel = indexEntries([
			entry({ "label": 'a', "value": 'old' }),
			entry({ "label": 'a', "value": 'new' }),
		]);

		assert.equal(byLabel.get('a')?.value, 'new');
	});
});
