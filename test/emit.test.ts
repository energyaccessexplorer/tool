import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Smoke tests against the tsc-emitted JS in tsbuild/ — the same modules the
// browser screens copy into dist. Loading the emitted files here (not the
// .ts sources) catches emit drift, broken .js specifier rewrites, and
// missing modules that source-level unit tests are blind to. The makefile's
// test target runs the `ts` emit first, so tsbuild/ exists by the time
// these run.

describe('emitted modules (tsbuild/src)', () => {
	it('meiosis-stream.js loads and behaves like the source', async () => {
		const mod = await import('../tsbuild/src/meiosis-stream.js');
		assert.equal(typeof mod.default, 'function');

		const s = mod.default(1);
		assert.equal(s(), 1);

		const seen: unknown[] = [];
		s.subscribe((v: number) => { seen.push(v); });
		s(2);

		assert.deepEqual(seen, [2]);
	});

	it('right-panel-data-state.js loads and dispatches actions', async () => {
		const { cell, actions } = await import('../tsbuild/src/right-panel-data-state.js');

		// cell() snapshots state at call time — re-read it after each action.
		const state = () => cell().state;

		actions.enterBlank(cell());
		assert.equal(state().view.kind, 'blank');

		actions.backToNational(cell());
		assert.equal(state().view.kind, 'national');

		actions.locationSelected(cell(), { "entries": [{ "label": 'x', "value": 1, "raw_value": 1 }] });
		assert.equal(state().view.kind, 'location');
		const loc = state().view;
		if (loc.kind === 'location') assert.equal(loc.entries[0]?.rawValue, 1);

		actions.backToNational(cell());
		actions.nationalComputed(cell(), []);
		assert.equal(state().view.kind, 'national');

		actions.analysisCompleted(cell(), { "solar": { "name": 'Solar' } });
		assert.equal(state().analysisLayerData?.['solar']?.name, 'Solar');
	});

	it('right-panel-prioritization-state.js loads and dispatches actions', async () => {
		const { cell, actions, toSummary } = await import('../tsbuild/src/right-panel-prioritization-state.js');

		const state = () => cell().state;

		actions.locationSelected(cell(), {
			"rasterIndex":   3,
			"analysisValue": 0.7,
			"summary":       toSummary({ "basicData": [{ "key": 'Priority score', "value": '0.7' }] }, null),
		});
		assert.equal(state().view.kind, 'location');
		assert.equal(state().summary?.priorityScore, '0.7');

		actions.entriesComputed(cell(), { "eai": { "value": 0.7, "bucket": 'High' } });
		const view = state().view;
		if (view.kind === 'location') assert.equal(view.entries?.['eai']?.bucket, 'High');

		actions.backToNational(cell());
		assert.equal(state().view.kind, 'national');
		assert.equal(state().summary, null);
	});
});

describe('emitted modules (tsbuild/src): analysis-state', () => {
	it('analysis-state.js loads, publishes and guards by revision', async () => {
		const { actions, cell, createAnalysisService, resultKey } = await import('../tsbuild/src/analysis-state.js');

		// cell() snapshots state at call time — re-read it after each action.
		const state = () => cell().state;

		actions.reset(cell());
		const applied = actions.computed(cell(), {
			"revision": state().revision,
			"key":      { "index": 'eai', "tier": 2, "subdiv": null },
			"inputs":   'f',
			"result":   {
				"cells":    new Float32Array([0.5]),
				"mask":     new Uint8Array([1]),
				"areas":    { "7": { "score": 0.5, "bucket": 'High', "values": null } },
				"national": { "values": null },
			},
		});

		assert.equal(applied, true);
		assert.equal(state().results[resultKey('eai', 2, null)]?.result.areas['7']?.score, 0.5);

		const stale = state().revision;
		actions.commit(cell(), {});
		assert.equal(actions.computed(cell(), {
			"revision": stale,
			"key":      { "index": 'eai', "tier": 2, "subdiv": null },
			"inputs":   'f',
			"result":   {
				"cells":    new Float32Array([0.5]),
				"mask":     new Uint8Array([1]),
				"areas":    {},
				"national": { "values": null },
			},
		}), false);

		assert.equal(typeof createAnalysisService, 'function');
	});
});
