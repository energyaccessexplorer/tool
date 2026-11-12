// Meiosis cell for what the tool is waiting on: dataset loads and analysis
// recomputes. The analysis spinner and map pulse derive from busy(); nothing
// may toggle them by hand. Every load() and recompute() must settle the atom,
// however it ends; watchdog() gives up a recompute that never does.
//
// Pure and erasable-syntax only: node strip-types runs the tests.

import stream from './meiosis-stream.ts';

export type LoadStatus = 'loading' | 'loaded' | 'failed';

/** 'layer': data the user asked for; the panel waits on it. 'support': data
 * a view reads on its own schedule, such as the summary's population. */
export type LoadRole = 'layer' | 'support';

export interface LoadEntry {
	readonly status: LoadStatus;
	readonly role: LoadRole;
}

export interface LoadingState {
	readonly datasets: Readonly<Record<string, LoadEntry>>;
	/** A COMMIT is waiting out its debounce. */
	readonly queued: boolean;
	/** A count: a slow reload() can overlap the next. */
	readonly recomputes: number;
	/** The steps the running recomputes wait on, by name; counts, since
	 * overlapping recomputes wait on the same steps. */
	readonly waits: Readonly<Record<string, number>>;
	/** Bumped when stalled recomputes are given up: their late settles must
	 * not count against the recomputes running by then. */
	readonly epoch: number;
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
	"waits":      {},
	"epoch":      0,
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

export function layer_loading(e: LoadEntry | undefined): boolean {
	return e?.status === 'loading' && e.role === 'layer';
};

export function busy(s: LoadingState): boolean {
	return s.queued || s.recomputes > 0 || Object.values(s.datasets).some(layer_loading);
};

export const actions = {
	loadStarted(c: LoadingCell, id: string, role: LoadRole): void {
		c.update(s => ({ ...s, "datasets": { ...s.datasets, [id]: { "status": 'loading', role } } }));
	},

	/** A layer request joined a support load: the user now waits on it. */
	loadPromoted(c: LoadingCell, id: string): void {
		c.update(s => {
			const e = s.datasets[id];
			if (!e || e.role === 'layer') return s;

			return { ...s, "datasets": { ...s.datasets, [id]: { ...e, "role": 'layer' } } };
		});
	},

	loadSettled(c: LoadingCell, id: string, ok: boolean): void {
		c.update(s => {
			const role = s.datasets[id]?.role ?? 'layer';

			return { ...s, "datasets": { ...s.datasets, [id]: { "status": ok ? 'loaded' : 'failed', role } } };
		});
	},

	queued(c: LoadingCell, queued: boolean): void {
		c.update(s => (s.queued === queued ? s : { ...s, queued }));
	},

	recomputeStarted(c: LoadingCell): void {
		c.update(s => ({ ...s, "recomputes": s.recomputes + 1 }));
	},

	recomputeSettled(c: LoadingCell, epoch: number): void {
		c.update(s => (s.epoch !== epoch ? s : { ...s, "recomputes": Math.max(0, s.recomputes - 1) }));
	},

	waitStarted(c: LoadingCell, label: string): void {
		c.update(s => ({ ...s, "waits": { ...s.waits, [label]: (s.waits[label] ?? 0) + 1 } }));
	},

	waitSettled(c: LoadingCell, label: string, epoch: number): void {
		c.update(s => {
			if (s.epoch !== epoch) return s;

			const { [label]: n = 0, ...rest } = s.waits;

			return { ...s, "waits": n > 1 ? { ...rest, [label]: n - 1 } : rest };
		});
	},

	recomputesAbandoned(c: LoadingCell): void {
		c.update(s => ({ ...s, "recomputes": 0, "waits": {}, "epoch": s.epoch + 1 }));
	},
} as const;

const inflight = new Map<string, Promise<void>>();

/** One load per dataset at a time: callers arriving while it runs join it.
 * A failed load is not kept; the next call retries. */
export function load(id: string, fn: () => Promise<unknown>, role: LoadRole = 'layer'): Promise<void> {
	const running = inflight.get(id);
	if (running) {
		if (role === 'layer') actions.loadPromoted(cell(), id);
		return running;
	}

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
	actions.loadStarted(cell(), id, role);

	return promise;
};

/** Waits for the layer loads running now, failed ones included. */
export async function loadsSettled(): Promise<void> {
	const datasets = cell().state.datasets;

	await Promise.allSettled([...inflight].filter(([id]) => layer_loading(datasets[id])).map(([, p]) => p));
};

export async function recompute<T>(fn: () => Promise<T>): Promise<T> {
	const epoch = cell().state.epoch;

	actions.recomputeStarted(cell());

	try {
		return await fn();
	} finally {
		actions.recomputeSettled(cell(), epoch);
	}
};

/** Names a step of the running recompute in the atom while it is pending. */
export async function waitingOn<T>(label: string, p: Promise<T>): Promise<T> {
	const epoch = cell().state.epoch;

	actions.waitStarted(cell(), label);

	try {
		return await p;
	} finally {
		actions.waitSettled(cell(), label, epoch);
	}
};

/** A recompute is stalled once the atom has not changed for `limit` ms while
 * no load is in flight: loads bound their own waits (parse.js
 * fetch_unstalled), a recompute need not. onStall gets the stalled state, then
 * the recomputes are given up so busy() cannot hold forever. Returns the
 * uninstaller. */
export function watchdog(limit: number, onStall: (s: LoadingState) => void): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;

	const arm = (s: LoadingState) => {
		clearTimeout(timer);
		timer = undefined;

		if (s.recomputes === 0) return;
		if (Object.values(s.datasets).some(e => e.status === 'loading')) return;

		timer = setTimeout(() => {
			onStall(cell().state);
			actions.recomputesAbandoned(cell());
		}, limit);
	};

	const unsubscribe = subscribe(arm);
	arm(cell().state);

	return () => {
		clearTimeout(timer);
		unsubscribe();
	};
};
