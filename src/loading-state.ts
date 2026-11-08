// Meiosis cell for what the tool is waiting on: dataset loads and analysis
// recomputes. The analysis spinner and map pulse derive from busy(); nothing
// may toggle them by hand. Every load() and recompute() must settle the atom,
// however it ends.
//
// Pure and erasable-syntax only: node strip-types runs the tests.

import stream from './meiosis-stream.ts';

export type LoadStatus = 'loading' | 'loaded' | 'failed';

export interface LoadingState {
	readonly datasets: Readonly<Record<string, LoadStatus>>;
	/** A COMMIT is waiting out its debounce. */
	readonly queued: boolean;
	/** A count: a slow reload() can overlap the next. */
	readonly recomputes: number;
}

export type Patch = (state: LoadingState) => LoadingState;

export interface LoadingCell {
	/** Snapshot at cell() call time; re-call cell() or subscribe() for a
	 * fresh read. */
	readonly state: LoadingState;
	update(patch: Patch): void;
}

const initial: LoadingState = {
	"datasets":   {},
	"queued":     false,
	"recomputes": 0,
};

const update = stream<Patch>();
const states = stream.scan((state: LoadingState, patch: Patch) => patch(state), initial, update);

export const cell = (): LoadingCell => ({
	"state":  states(),
	"update": patch => { update(patch); },
});

export function subscribe(fn: (state: LoadingState) => void): () => void {
	return states.subscribe(fn);
};

export function busy(s: LoadingState): boolean {
	return s.queued || s.recomputes > 0 || Object.values(s.datasets).includes('loading');
};

export const actions = {
	loadStarted(c: LoadingCell, id: string): void {
		c.update(s => ({ ...s, "datasets": { ...s.datasets, [id]: 'loading' } }));
	},

	loadSettled(c: LoadingCell, id: string, ok: boolean): void {
		c.update(s => ({ ...s, "datasets": { ...s.datasets, [id]: ok ? 'loaded' : 'failed' } }));
	},

	queued(c: LoadingCell, queued: boolean): void {
		c.update(s => (s.queued === queued ? s : { ...s, queued }));
	},

	recomputeStarted(c: LoadingCell): void {
		c.update(s => ({ ...s, "recomputes": s.recomputes + 1 }));
	},

	recomputeSettled(c: LoadingCell): void {
		c.update(s => ({ ...s, "recomputes": Math.max(0, s.recomputes - 1) }));
	},
} as const;

const inflight = new Map<string, Promise<void>>();

/** One load per dataset at a time: callers arriving while it runs join it.
 * A failed load is not kept; the next call retries. */
export function load(id: string, fn: () => Promise<unknown>): Promise<void> {
	const running = inflight.get(id);
	if (running) return running;

	// Out of the map before the atom notifies: a subscriber that loads again
	// must start afresh, not join the settled load.
	const settle = (ok: boolean) => {
		inflight.delete(id);
		actions.loadSettled(cell(), id, ok);
	};

	// fn runs only once registered, so a synchronous throw has an entry to remove.
	const promise = Promise.resolve()
		.then(fn)
		.then(() => settle(true), err => {
			settle(false);
			throw err;
		});

	inflight.set(id, promise);
	actions.loadStarted(cell(), id);

	return promise;
};

/** Waits for the loads running now, failed ones included. */
export async function loadsSettled(): Promise<void> {
	await Promise.allSettled([...inflight.values()]);
};

export async function recompute<T>(fn: () => Promise<T>): Promise<T> {
	actions.recomputeStarted(cell());

	try {
		return await fn();
	} finally {
		actions.recomputeSettled(cell());
	}
};
