import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
	actions,
	cell,
	createAnalysisService,
	foldNational,
	foldValues,
	resultKey,
	subscribe,
	withScores,
	withValues,
} from '../src/analysis-state.ts';

import type {
	AnalysisResult,
	ResultKey,
	ScoresPayload,
	ServiceSpec,
	Subdiv,
	ValuesPayload,
} from '../src/analysis-state.ts';

// cell() snapshots state at call time (timeline-state convention): re-read
// after every action instead of holding on to a cell's `state` property.
const state = () => cell().state;

const key = (over: Partial<ResultKey> = {}): ResultKey => ({
	"index":  'eai',
	"tier":   2,
	"subdiv": null,
	...over,
});

const scoresPayload = (score = 0.5): ScoresPayload => ({
	"cells": new Float32Array([score, -1]),
	"mask":  new Uint8Array([1, 0]),
	"areas": {
		"7": { "score": score, "bucket": 'High' },
		"8": { "score": -1, "bucket": null },
	},
});

const valuesPayload = (value = 3): ValuesPayload => ({
	"areas":    { "7": { "solar": { "type": 'scalar', "value": value } } },
	"national": { "solar": { "type": 'scalar', "value": value * 10 } },
	"analysed": { "solar": { "type": 'scalar', "value": value * 2 } },
});

/**
 * Fake producer inputs: every dataset's `_afn` fingerprint (range sliders
 * rewrite _domain -> _afn) plus which datasets each index's computation
 * consumes, the live subdiv and the geography.
 */
interface FakeInputs {
	geography: string;
	subdiv: Subdiv;
	datasets: Record<string, string>;
	perIndex: Record<string, readonly string[]>;
}

const fingerprint = (fake: FakeInputs, index: string, subdiv: Subdiv): string =>
	JSON.stringify([
		fake.geography,
		subdiv,
		fake.subdiv,
		(fake.perIndex[index] ?? []).map(id => [id, fake.datasets[id] ?? '']),
	]);

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
	let resolveFn: ((value: T) => void) | null = null;
	const promise = new Promise<T>(res => { resolveFn = res; });

	return {
		promise,
		"resolve": (value: T) => { if (resolveFn) resolveFn(value); },
	};
}

const tick = (): Promise<void> => new Promise(res => setTimeout(res, 0));

/** Builds a service over mutable fake inputs with call counters. */
function makeService(
	fake: FakeInputs,
	over: Partial<ServiceSpec<ValuesPayload>> = {},
) {
	const calls = { "scores": 0, "values": 0, "stage": 0 };

	const service = createAnalysisService<ValuesPayload>({
		"inputs":        (index, subdiv) => fingerprint(fake, index, subdiv),
		"subdiv":        () => fake.subdiv,
		"geography":     () => fake.geography,
		"computeScores": () => { calls.scores += 1; return scoresPayload(); },
		"computeValues": () => { calls.values += 1; return valuesPayload(); },
		...over,
	});

	return { service, calls };
}

const freshFake = (): FakeInputs => ({
	"geography": 'uganda',
	"subdiv":    null,
	"datasets":  { "maize": '[0,235]', "solar": '[0,1]' },
	"perIndex":  { "eai": ['maize', 'solar'], "demand": ['solar'] },
});

describe('analysis-state: atom', () => {
	it('resultKey carries index, tier and subdiv', () => {
		assert.equal(resultKey('eai', 2, null), 'eai|2|null');
		assert.equal(resultKey('demand', 'raster', 5), 'demand|raster|5');
		assert.ok(resultKey('eai', 2, 0) !== resultKey('eai', 2, null));
	});

	it('computed stores the result under key(index, tier, subdiv)', () => {
		actions.reset(cell());
		const applied = actions.computed(cell(), {
			"revision": state().revision,
			"key":      key(),
			"inputs":   'f1',
			"result":   withScores(scoresPayload(0.7)),
		});

		assert.equal(applied, true);
		const entry = state().results[resultKey('eai', 2, null)];
		assert.equal(entry?.result.areas['7']?.score, 0.7);
		assert.equal(entry?.result.areas['7']?.values, null);
	});

	it('discards results for a stale revision (staleness guard)', () => {
		actions.reset(cell());
		const stale = state().revision;

		actions.commit(cell(), {}); // a COMMIT bumped the revision meanwhile

		const applied = actions.computed(cell(), {
			"revision": stale,
			"key":      key(),
			"inputs":   'f1',
			"result":   withScores(scoresPayload()),
		});

		assert.equal(applied, false);
		assert.deepEqual(Object.keys(state().results), []);
	});

	it('commit bumps the revision and re-stamps unchanged entries', () => {
		actions.reset(cell());
		actions.computed(cell(), {
			"revision": state().revision,
			"key":      key(),
			"inputs":   'same',
			"result":   withScores(scoresPayload(0.4)),
		});

		const before = state().revision;
		actions.commit(cell(), { [resultKey('eai', 2, null)]: 'same' });

		assert.equal(state().revision, before + 1);
		const entry = state().results[resultKey('eai', 2, null)];
		assert.equal(entry?.revision, before + 1);
		assert.equal(entry?.result.areas['7']?.score, 0.4);
	});

	it('commit drops exactly the entries whose inputs changed', () => {
		actions.reset(cell());
		const rev = state().revision;

		actions.computed(cell(), { "revision": rev, "key": key(), "inputs": 'a1', "result": withScores(scoresPayload()) });
		actions.computed(cell(), {
			"revision": rev,
			"key":      key({ "index": 'demand' }),
			"inputs":   'b1',
			"result":   withScores(scoresPayload()),
		});

		// 'eai' inputs moved (a range slider rewrite); 'demand' did not.
		actions.commit(cell(), {
			[resultKey('eai', 2, null)]:    'a2',
			[resultKey('demand', 2, null)]: 'b1',
		});

		assert.equal(state().results[resultKey('eai', 2, null)], undefined);
		assert.equal(state().results[resultKey('demand', 2, null)]?.result.areas['7']?.score, 0.5);
	});

	it('commit drops entries whose fingerprint cannot be verified', () => {
		actions.reset(cell());
		actions.computed(cell(), {
			"revision": state().revision,
			"key":      key(),
			"inputs":   'f1',
			"result":   withScores(scoresPayload()),
		});

		actions.commit(cell(), {});
		assert.deepEqual(Object.keys(state().results), []);
	});

	it('the second publish phase fills values and national in place', () => {
		actions.reset(cell());
		const rev = state().revision;

		actions.computed(cell(), { "revision": rev, "key": key(), "inputs": 'f', "result": withScores(scoresPayload(0.9)) });
		actions.computed(cell(), {
			"revision": rev,
			"key":      key(),
			"inputs":   'f',
			"result":   withValues(withScores(scoresPayload(0.9)), valuesPayload(3)),
		});

		const entry = state().results[resultKey('eai', 2, null)];
		assert.equal(entry?.result.areas['7']?.score, 0.9);
		assert.deepEqual(entry?.result.areas['7']?.values, { "solar": { "type": 'scalar', "value": 3 } });
		assert.deepEqual(entry?.result.national.values, { "solar": { "type": 'scalar', "value": 30 } });
		assert.deepEqual(entry?.result.analysed.values, { "solar": { "type": 'scalar', "value": 6 } });
	});

	it('reset clears every result and bumps the revision (geography change)', () => {
		actions.reset(cell());
		actions.computed(cell(), {
			"revision": state().revision,
			"key":      key(),
			"inputs":   'f',
			"result":   withScores(scoresPayload()),
		});

		const before = state().revision;
		actions.reset(cell());

		assert.equal(state().revision, before + 1);
		assert.deepEqual(Object.keys(state().results), []);
	});

	it('notifies subscribers synchronously on every publish', () => {
		actions.reset(cell());
		const seen: Array<number | undefined> = [];
		const off = subscribe(s => seen.push(s.results[resultKey('eai', 2, null)]?.result.areas['7']?.score));

		actions.computed(cell(), {
			"revision": state().revision,
			"key":      key(),
			"inputs":   'f',
			"result":   withScores(scoresPayload(0.25)),
		});
		off();

		assert.deepEqual(seen, [0.25]);
	});
});

describe('analysis-state: pure result assembly', () => {
	it('withScores makes scores readable with values pending', () => {
		const result = withScores(scoresPayload(0.5));
		assert.equal(result.areas['7']?.score, 0.5);
		assert.equal(result.areas['7']?.bucket, 'High');
		assert.equal(result.areas['8']?.bucket, null);
		assert.equal(result.areas['7']?.values, null);
		assert.equal(result.national.values, null);
		assert.equal(result.mask[1], 0);
	});

	it('withValues folds the aggregates into the pending result', () => {
		const complete = withValues(withScores(scoresPayload()), valuesPayload(3));
		assert.deepEqual(complete.areas['7']?.values, { "solar": { "type": 'scalar', "value": 3 } });
		assert.deepEqual(complete.national.values, { "solar": { "type": 'scalar', "value": 30 } });
		assert.deepEqual(complete.analysed.values, { "solar": { "type": 'scalar', "value": 6 } });
		// scores untouched
		assert.equal(complete.areas['7']?.score, 0.5);
	});

	it('foldValues/foldNational reshape layer data to per-area values', () => {
		const layerData = {
			"solar": { "areas": { "0": { "result": { "type": 'scalar', "value": 100 } }, "7": { "result": { "type": 'scalar', "value": 3 } } } },
			"maize": { "areas": { "7": { "result": null } } },
		};

		assert.deepEqual(foldValues(layerData), {
			"0": { "solar": { "type": 'scalar', "value": 100 } },
			"7": { "solar": { "type": 'scalar', "value": 3 }, "maize": null },
		});
		assert.deepEqual(foldNational(layerData), {
			"solar": { "type": 'scalar', "value": 100 },
			"maize": null,
		});
	});
});

describe('analysis-state: producer service', () => {
	it('publishes per-area scores synchronously, before the aggregates land', async () => {
		actions.reset(cell());
		const fake = freshFake();
		const pending = deferred<ValuesPayload>();

		// The popup handler: reads scores SYNCHRONOUSLY from the atom.
		let scoreAtPublish: number | undefined;
		let valuesAtPublish: unknown = 'unset';
		const off = subscribe(s => {
			const entry = s.results[resultKey('eai', 2, null)];
			if (!entry) return;
			scoreAtPublish = entry.result.areas['7']?.score;
			valuesAtPublish = entry.result.areas['7']?.values;
		});

		const { service } = makeService(fake, {
			"computeValues": () => pending.promise,
		});

		const done = service.result('eai', 2);
		const partial = await service.scores('eai', 2);

		// Phase 1 is published and synchronously readable while the layer
		// aggregates are still in flight (analysis.js:407 vs :417 ordering).
		assert.equal(scoreAtPublish, 0.5);
		assert.equal(valuesAtPublish, null);
		assert.equal(partial.areas['7']?.score, 0.5);
		assert.equal(state().results[resultKey('eai', 2, null)]?.result.areas['7']?.values, null);

		pending.resolve(valuesPayload(3));
		const complete = await done;
		off();

		assert.deepEqual(complete.areas['7']?.values, { "solar": { "type": 'scalar', "value": 3 } });
		assert.equal(state().results[resultKey('eai', 2, null)]?.result.areas['7']?.score, 0.5);
	});

	it('concurrent callers share one computation (in-flight promises memoised)', async () => {
		actions.reset(cell());
		const fake = freshFake();
		const pending = deferred<ScoresPayload>();
		const { service, calls } = makeService(fake, { "computeScores": () => { calls.scores += 1; return pending.promise; } });

		const a = service.result('eai', 2);
		const b = service.scores('eai', 2);
		const c = service.result('eai', 2);

		pending.resolve(scoresPayload(0.5));
		const [ra, rb, rc] = await Promise.all([a, b, c]);

		assert.equal(calls.scores, 1);
		assert.equal(calls.values, 1);
		assert.equal(ra.areas['7']?.score, 0.5);
		assert.equal(rb.areas['7']?.score, 0.5);
		assert.equal(rc.areas['7']?.score, 0.5);
	});

	it('stage() shares one computation across callers and tiers', async () => {
		actions.reset(cell());
		const fake = freshFake();
		const { service, calls } = makeService(fake);

		await service.stage('eai', () => { calls.stage += 1; return 'cells'; });
		const shared = await service.stage('eai', () => { calls.stage += 1; return 'other'; });

		assert.equal(calls.stage, 1);
		assert.equal(shared, 'cells');
	});

	it('cache hits re-verify the fingerprint inside the COMMIT debounce', async () => {
		actions.reset(cell());
		const fake = freshFake();
		const { service, calls } = makeService(fake);

		const first = await service.result('eai', 2);
		assert.equal(calls.scores, 1);

		// A change lands but the 300ms COMMIT debounce has not fired yet —
		// no sync(), so the revision and the cache key are unchanged. The
		// hit must re-verify the captured fingerprint and miss instead of
		// serving the pre-change entry.
		fake.datasets['maize'] = '[0,50]';

		const fresh = await service.result('eai', 2);
		assert.equal(calls.scores, 2);
		assert.ok(fresh !== first);
	});

	it('stage() hits re-verify the fingerprint too', async () => {
		actions.reset(cell());
		const fake = freshFake();
		const { service, calls } = makeService(fake);

		const first = await service.stage('eai', () => { calls.stage += 1; return 'pre'; });
		assert.equal(first, 'pre');

		fake.datasets['maize'] = '[0,50]'; // changed mid-debounce, no sync()

		const fresh = await service.stage('eai', () => { calls.stage += 1; return 'post'; });
		assert.equal(calls.stage, 2);
		assert.equal(fresh, 'post');
	});

	it('subdiv changes invalidate the cached results', async () => {
		actions.reset(cell());
		const fake = freshFake();
		const { service, calls } = makeService(fake);

		await service.result('eai', 2);
		assert.equal(calls.scores, 1);

		// Hit while the subdivision is unchanged: served from the cache.
		await service.result('eai', 2);
		assert.equal(calls.scores, 1);

		fake.subdiv = 5;
		service.sync(); // the COMMIT hook sees the changed subdiv fingerprint

		assert.deepEqual(Object.keys(state().results), []);
		await service.result('eai', 2);
		assert.equal(calls.scores, 2);
	});

	it('dataset _afn changes (range sliders) invalidate via COMMIT', async () => {
		actions.reset(cell());
		const fake = freshFake();
		const { service, calls } = makeService(fake);

		await service.result('eai', 2);
		assert.equal(calls.scores, 1);

		// cards.js range slider rewrites maize's _domain/_afn and COMMITs.
		fake.datasets['maize'] = '[0,50]';
		service.sync();

		await service.result('eai', 2);
		assert.equal(calls.scores, 2);
	});

	it('invalidates exactly the affected entries; unrelated changes do not', async () => {
		actions.reset(cell());
		const fake = freshFake();
		const { service, calls } = makeService(fake);

		await service.result('eai', 2);
		await service.result('demand', 2);
		assert.equal(calls.scores, 2);

		// The maize range slider feeds the eai computation only.
		fake.datasets['maize'] = '[0,50]';
		service.sync();

		await service.result('demand', 2); // unaffected: served from the cache
		assert.equal(calls.scores, 2);

		await service.result('eai', 2); // affected: recomputed
		assert.equal(calls.scores, 3);
	});

	it('unrelated COMMITs do not invalidate (entries re-stamped, no recompute)', async () => {
		actions.reset(cell());
		const fake = freshFake();
		const { service, calls } = makeService(fake);

		const first = await service.result('eai', 2);

		for (let i = 0; i < 3; i += 1) service.sync(); // map moves, tab switches...

		const again = await service.result('eai', 2);
		assert.equal(calls.scores, 1);
		assert.equal(again, first);
		assert.equal(state().results[resultKey('eai', 2, null)]?.revision, state().revision);
	});

	it('an in-flight computation landing after an unrelated COMMIT still publishes', async () => {
		actions.reset(cell());
		const fake = freshFake();
		const pending = deferred<ScoresPayload>();
		const { service, calls } = makeService(fake, { "computeScores": () => { calls.scores += 1; return pending.promise; } });

		const done = service.scores('eai', 2);
		service.sync(); // unrelated COMMIT mid-flight: revision bumped

		pending.resolve(scoresPayload(0.6));
		await done;
		await tick();

		// inputs unchanged -> published under the new revision, not dropped.
		assert.equal(state().results[resultKey('eai', 2, null)]?.result.areas['7']?.score, 0.6);
		assert.equal(state().results[resultKey('eai', 2, null)]?.revision, state().revision);
	});

	it('an in-flight computation is discarded when a relevant change lands first', async () => {
		actions.reset(cell());
		const fake = freshFake();
		const pending = deferred<ScoresPayload>();
		const { service, calls } = makeService(fake, { "computeScores": () => { calls.scores += 1; return pending.promise; } });

		const done = service.scores('eai', 2);

		fake.datasets['maize'] = '[0,50]'; // range slider moved mid-flight
		service.sync();

		// The stale computation is discarded and the request RETRIED against
		// the new inputs (the caller asked for the result for the current
		// inputs): the caller still resolves (reload keeps going)...
		pending.resolve(scoresPayload());
		const result = await done;
		assert.equal(result.areas['7']?.score, 0.5);
		assert.equal(calls.scores, 2);

		// ...and what got published is the recomputed result, never the
		// stale computation's.
		await tick();
		assert.equal(state().results[resultKey('eai', 2, null)]?.result.areas['7']?.score, 0.5);
	});

	it('a discarded publish retries against the current inputs (never resolves un-published)', async () => {
		actions.reset(cell());
		const fake = freshFake();
		const pending = deferred<ScoresPayload>();
		const { service, calls } = makeService(fake, {
			"computeScores": () => {
				calls.scores += 1;
				// The retry computes against the NEW inputs and must produce a
				// different payload than the discarded first computation.
				return calls.scores === 1 ? pending.promise : scoresPayload(0.8);
			},
		});

		const done = service.result('eai', 2);

		// The change lands mid-computation (debounce pending, no sync()):
		// publish() re-checks the fingerprint and discards the result.
		fake.datasets['maize'] = '[0,50]';
		pending.resolve(scoresPayload(0.5));

		const result = await done;

		// The caller asked for the result for the CURRENT inputs: it
		// resolves with the recomputed one (0.8), never with the stale
		// un-published computation (0.5)...
		assert.equal(result.areas['7']?.score, 0.8);
		assert.equal(calls.scores, 2);

		// ...and what resolved is exactly what the atom holds.
		await tick();
		assert.equal(state().results[resultKey('eai', 2, null)]?.result, result);
	});

	it('a geography change clears the cache and the atom', async () => {
		actions.reset(cell());
		const fake = freshFake();
		const { service, calls } = makeService(fake);

		await service.result('eai', 2);
		assert.equal(calls.scores, 1);

		fake.geography = 'kenya';
		service.sync();

		assert.deepEqual(Object.keys(state().results), []);
		assert.equal(service.cacheSize(), 0);

		await service.result('eai', 2);
		assert.equal(calls.scores, 2);
	});

	it('the cache stays bounded across revisions', async () => {
		actions.reset(cell());
		const fake = freshFake();
		const { service } = makeService(fake);

		await service.result('eai', 2);
		const size = service.cacheSize();

		for (let i = 0; i < 5; i += 1) {
			service.sync();
			await service.result('eai', 2);
		}

		assert.ok(service.cacheSize() <= size);
	});
});

describe('analysis-state: result shape', () => {
	it('carries cells, mask, per-area values/score/bucket and national', async () => {
		actions.reset(cell());
		const fake = freshFake();
		const { service } = makeService(fake);

		const result: AnalysisResult = await service.result('eai', 2);

		assert.equal(result.cells.length, 2);
		assert.deepEqual([...result.mask], [1, 0]);
		assert.deepEqual(result.areas['7'], {
			"score":   0.5,
			"bucket": 'High',
			"values": { "solar": { "type": 'scalar', "value": 3 } },
		});
		assert.deepEqual(result.areas['8'], { "score": -1, "bucket": null, "values": null });
		assert.deepEqual(result.national, { "values": { "solar": { "type": 'scalar', "value": 30 } } });
		assert.deepEqual(result.analysed, { "values": { "solar": { "type": 'scalar', "value": 6 } } });
	});
});
