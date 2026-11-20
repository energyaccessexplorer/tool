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
	waitingOn,
	watchdog,
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
		const base: LoadingState = {
			"datasets":   { "a": { "status": 'loaded', "role": 'layer' }, "b": { "status": 'failed', "role": 'layer' } },
			"queued":     false,
			"recomputes": 0,
			"waits":      {},
			"epoch":      0,
		};

		assert.equal(busy(base), false);
		assert.equal(busy({ ...base, "datasets": { ...base.datasets, "c": { "status": 'loading', "role": 'layer' } } }), true);
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

		assert.equal(state().datasets['ok-1']?.status, 'loading');
		assert.equal(busy(state()), true);

		d.resolve();
		await p;

		assert.equal(state().datasets['ok-1']?.status, 'loaded');
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

		assert.equal(state().datasets['fail-1']?.status, 'failed');
		assert.equal(busy(state()), false);

		let retried = false;
		await load('fail-1', async () => { retried = true; });

		assert.equal(retried, true);
		assert.equal(state().datasets['fail-1']?.status, 'loaded');
	});

	it('a synchronous throw settles like a rejection and does not wedge the id', async () => {
		await assert.rejects(load('sync-1', () => { throw new Error('sync'); }));

		assert.equal(state().datasets['sync-1']?.status, 'failed');

		await load('sync-1', async () => {});
		assert.equal(state().datasets['sync-1']?.status, 'loaded');
	});

	it('a subscriber that loads again on settle starts a fresh load', async () => {
		let reloaded = false;
		let once = true;

		const off = subscribe(s => {
			if (once && s.datasets['reentrant-1']?.status === 'failed') {
				once = false;
				load('reentrant-1', async () => { reloaded = true; });
			}
		});

		await assert.rejects(load('reentrant-1', () => Promise.reject(new Error('first'))));
		await loadsSettled();
		off();

		assert.equal(reloaded, true);
		assert.equal(state().datasets['reentrant-1']?.status, 'loaded');
	});
});

describe('loading-state: roles', () => {
	it('a support load does not make the panel busy', async () => {
		const d = deferred();
		const p = load('support-1', () => d.promise, 'support');

		assert.deepEqual(state().datasets['support-1'], { "status": 'loading', "role": 'support' });
		assert.equal(busy(state()), false);

		d.resolve();
		await p;
		assert.deepEqual(state().datasets['support-1'], { "status": 'loaded', "role": 'support' });
	});

	it('a layer request joining a support load promotes it', async () => {
		const d = deferred();
		const a = load('promote-1', () => d.promise, 'support');
		const b = load('promote-1', async () => {});

		assert.equal(a, b);
		assert.equal(state().datasets['promote-1']?.role, 'layer');
		assert.equal(busy(state()), true);

		d.resolve();
		await a;
		assert.equal(busy(state()), false);
	});

	it('loadsSettled waits for layer loads, not support ones', async () => {
		const layer = deferred();
		const support = deferred();

		const a = load('settle-layer', () => layer.promise);
		load('settle-support', () => support.promise, 'support');

		let settled = false;
		const all = loadsSettled().then(() => { settled = true; });

		layer.resolve();
		await a;
		await all;
		assert.equal(settled, true);
		assert.equal(state().datasets['settle-support']?.status, 'loading');

		support.resolve();
		await loadsSettled();
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

const tick = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('loading-state: waitingOn', () => {
	it('names the step while it is pending, failed or not', async () => {
		const ok = deferred();
		const ko = deferred();

		const a = waitingOn('step-a', ok.promise);
		const b = waitingOn('step-b', ko.promise);
		b.catch(() => {});

		assert.deepEqual(Object.keys(state().waits).sort(), ['step-a', 'step-b']);

		ok.resolve();
		await a;
		ko.reject(new Error('ko'));
		await assert.rejects(b);

		assert.deepEqual(state().waits, {});
	});

	it('counts overlapping waits on the same step', async () => {
		const x = deferred();
		const y = deferred();

		const a = waitingOn('same', x.promise);
		const b = waitingOn('same', y.promise);
		assert.equal(state().waits['same'], 2);

		x.resolve();
		await a;
		assert.equal(state().waits['same'], 1);

		y.resolve();
		await b;
		assert.equal(state().waits['same'], undefined);
	});
});

describe('loading-state: watchdog', () => {
	it('reports a recompute that makes no progress, then gives it up', async () => {
		const stuck = deferred();
		const stalls: LoadingState[] = [];
		const off = watchdog(20, s => stalls.push(s));

		const a = recompute(() => waitingOn('never', stuck.promise));
		await tick(60);

		assert.equal(stalls.length, 1);
		assert.equal(stalls[0]!.recomputes, 1);
		assert.equal(stalls[0]!.waits['never'], 1);
		assert.equal(state().recomputes, 0);
		assert.deepEqual(state().waits, {});
		assert.equal(busy(state()), false);

		// The abandoned recompute settling late must not count against the next.
		const next = deferred();
		const b = recompute(() => next.promise);
		stuck.resolve();
		await a;
		assert.equal(state().recomputes, 1);

		off();
		next.resolve();
		await b;
		assert.equal(state().recomputes, 0);
	});

	it('waits while a load is in flight', async () => {
		const loading = deferred();
		const work = deferred();
		const stalls: LoadingState[] = [];
		const off = watchdog(20, s => stalls.push(s));

		const l = load('watchdog-load', () => loading.promise);
		const r = recompute(() => work.promise);
		await tick(60);
		assert.equal(stalls.length, 0);

		loading.resolve();
		await l;
		await tick(60);
		assert.equal(stalls.length, 1);

		off();
		work.resolve();
		await r;
		assert.equal(state().recomputes, 0);
	});

	it('restarts its clock on progress', async () => {
		const stalls: LoadingState[] = [];
		const off = watchdog(40, s => stalls.push(s));

		const r = recompute(async () => {
			for (let i = 0; i < 4; i++) await waitingOn(`step-${i}`, tick(25));
		});
		await r;

		assert.equal(stalls.length, 0);
		off();
	});

	it('stops when uninstalled', async () => {
		const work = deferred();
		const stalls: LoadingState[] = [];
		const off = watchdog(20, s => stalls.push(s));

		const r = recompute(() => work.promise);
		off();
		await tick(60);
		assert.equal(stalls.length, 0);

		work.resolve();
		await r;
	});
});
