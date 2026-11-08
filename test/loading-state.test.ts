import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
	actions,
	busy,
	cell,
	load,
	loadsSettled,
	recompute,
	subscribe,
} from '../src/loading-state.ts';

import type {
	LoadingState,
} from '../src/loading-state.ts';

// The atom and the in-flight map are module singletons: every test uses its
// own dataset ids and leaves the counters as it found them.
const state = (): LoadingState => cell().state;

function deferred() {
	let resolve!: () => void;
	let reject!: (err: Error) => void;
	const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
	return { promise, resolve, reject };
}

describe('loading-state: busy', () => {
	it('starts idle', () => {
		assert.equal(busy(state()), false);
	});

	it('is busy while any dataset loads, a recompute runs, or a COMMIT is queued', () => {
		const base: LoadingState = { "datasets": { "a": 'loaded', "b": 'failed' }, "queued": false, "recomputes": 0 };

		assert.equal(busy(base), false);
		assert.equal(busy({ ...base, "datasets": { ...base.datasets, "c": 'loading' } }), true);
		assert.equal(busy({ ...base, "recomputes": 1 }), true);
		assert.equal(busy({ ...base, "queued": true }), true);
	});

	it('queued is a flag, not a counter', () => {
		actions.queued(cell(), true);
		actions.queued(cell(), true);
		actions.queued(cell(), false);

		assert.equal(state().queued, false);
	});
});

describe('loading-state: load', () => {
	it('marks the dataset loading, then loaded', async () => {
		const d = deferred();
		const p = load('ok-1', () => d.promise);

		assert.equal(state().datasets['ok-1'], 'loading');
		assert.equal(busy(state()), true);

		d.resolve();
		await p;

		assert.equal(state().datasets['ok-1'], 'loaded');
		assert.equal(busy(state()), false);
	});

	it('joins a load in flight instead of starting a second one', async () => {
		const d = deferred();
		let calls = 0;
		const fn = () => { calls += 1; return d.promise; };

		const a = load('dedupe-1', fn);
		const b = load('dedupe-1', fn);

		assert.equal(a, b);

		d.resolve();
		await Promise.all([a, b]);

		assert.equal(calls, 1);
	});

	it('a failed load rejects, settles the atom, and is retried by the next call', async () => {
		const err = new Error('boom');
		await assert.rejects(load('fail-1', () => Promise.reject(err)), err);

		assert.equal(state().datasets['fail-1'], 'failed');
		assert.equal(busy(state()), false);

		let retried = false;
		await load('fail-1', async () => { retried = true; });

		assert.equal(retried, true);
		assert.equal(state().datasets['fail-1'], 'loaded');
	});

	it('a synchronous throw settles like a rejection and does not wedge the id', async () => {
		await assert.rejects(load('sync-1', () => { throw new Error('sync'); }));

		assert.equal(state().datasets['sync-1'], 'failed');

		await load('sync-1', async () => {});
		assert.equal(state().datasets['sync-1'], 'loaded');
	});

	it('a subscriber that loads again on settle starts a fresh load', async () => {
		let reloaded = false;
		let once = true;

		const off = subscribe(s => {
			if (once && s.datasets['reentrant-1'] === 'failed') {
				once = false;
				load('reentrant-1', async () => { reloaded = true; });
			}
		});

		await assert.rejects(load('reentrant-1', () => Promise.reject(new Error('first'))));
		await loadsSettled();
		off();

		assert.equal(reloaded, true);
		assert.equal(state().datasets['reentrant-1'], 'loaded');
	});
});

describe('loading-state: loadsSettled', () => {
	it('waits for every load in flight, failed ones included', async () => {
		const ok = deferred();
		const ko = deferred();

		const a = load('settled-ok', () => ok.promise);
		const b = load('settled-ko', () => ko.promise);
		b.catch(() => {});

		let settled = false;
		const all = loadsSettled().then(() => { settled = true; });

		ok.resolve();
		await a;
		await Promise.resolve();
		assert.equal(settled, false);

		ko.reject(new Error('ko'));
		await all;
		assert.equal(settled, true);
	});

	it('resolves at once with nothing in flight', async () => {
		await loadsSettled();
	});
});

describe('loading-state: recompute', () => {
	it('counts overlapping recomputes and returns the result', async () => {
		const d = deferred();

		const a = recompute(async () => { await d.promise; return 'a'; });
		const b = recompute(async () => 'b');

		assert.equal(state().recomputes >= 1, true);
		assert.equal(await b, 'b');
		assert.equal(state().recomputes, 1);

		d.resolve();
		assert.equal(await a, 'a');
		assert.equal(state().recomputes, 0);
	});

	it('settles the count when the recompute throws', async () => {
		await assert.rejects(recompute(async () => { throw new Error('nope'); }));

		assert.equal(state().recomputes, 0);
		assert.equal(busy(state()), false);
	});
});
