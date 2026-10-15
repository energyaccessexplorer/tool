// The pure atom for derived analysis state: a meiosis cell of memoised
// analysis_result payloads — cells, mask, per-area scores/buckets/values and
// the whole-geography entry — keyed by (index, tier, subdiv), plus the service
// that memoises in-flight promises and publishes through a revision guard.
//
// Erasable syntax only (no namespace/enum): node strip-types runs the tests.

import stream from './meiosis-stream.ts';

import type {
	ScoreBucket,
} from './area-scores.ts';

/** A subdivision selection (STATE.subdiv); null is "no subdivision filter". */
export type Subdiv = number | string | null;

/** A division tier (STATE.divtier): a tier number or 'raster'. */
export type Tier = number | string;

export interface ResultKey {
	readonly index: string;
	readonly tier: Tier;
	readonly subdiv: Subdiv;
}

/** Composite results-record key; subdiv is part of the memoisation key. */
export function resultKey(index: string, tier: Tier, subdiv: Subdiv): string {
	return `${index}|${String(tier)}|${String(subdiv)}`;
}

/** One dataset's aggregate for one area (the layer-data `result` shape). */
export interface AggregateResult {
	readonly type: string;
	readonly value: number | string;
}

/** Per-area values per dataset id. */
export type AreaValues = Readonly<Record<string, AggregateResult | null>>;

/** The score/bucket half of an area entry. */
export interface AreaScores {
	readonly score: number;
	/** The shared score scale's bucket (area-scores.ts); null is "no score". */
	readonly bucket: ScoreBucket | null;
}

export interface AreaResult extends AreaScores {
	/** Per-area values per dataset; null until the values publish. */
	readonly values: AreaValues | null;
}

/** The whole-geography aggregate over the full outline, no analysis mask;
 * values is null until the values publish. */
export interface NationalResult {
	readonly values: AreaValues | null;
}

/** One derived analysis result.
 *
 * mask is the one "analysed cells" rule (area-scores.ts analysed_mask); the
 * criteria display mask is deliberately a different concept (criteria_pass_mask).
 * analysed comes from the outline alone, so the cards need no admin division. */
export interface AnalysisResult {
	readonly cells: Float32Array;
	readonly mask: Uint8Array;
	readonly areas: Readonly<Record<string, AreaResult>>;
	readonly national: NationalResult;
	readonly analysed: NationalResult;
}

/** One published result, tagged with the revision and inputs it was built from. */
export interface ResultEntry {
	readonly revision: number;
	readonly key: ResultKey;
	/** The inputs fingerprint captured at compute time. */
	readonly inputs: string;
	readonly result: AnalysisResult;
}

export interface AnalysisState {
	/** Bumped on every COMMIT (service.sync()); publishes carry it. */
	readonly revision: number;
	/** key(index, tier, subdiv) -> published result. */
	readonly results: Readonly<Record<string, ResultEntry>>;
}

export type Patch = (state: AnalysisState) => AnalysisState;

export interface AnalysisCell {
	/** Snapshot at cell() call time; re-call cell() or subscribe() for a
	 * fresh read. */
	readonly state: AnalysisState;
	update(patch: Patch): void;
}

const initial: AnalysisState = {
	"revision": 0,
	"results":  {},
};

const update = stream<Patch>();
const states = stream.scan((state: AnalysisState, patch: Patch) => patch(state), initial, update);

export const cell = (): AnalysisCell => ({
	"state":  states(),
	"update": patch => { update(patch); },
});

export function subscribe(fn: (state: AnalysisState) => void): () => void {
	return states.subscribe(fn);
};

export interface ComputedPayload {
	/** The state revision the computation was valid for (the staleness guard). */
	readonly revision: number;
	readonly key: ResultKey;
	readonly inputs: string;
	readonly result: AnalysisResult;
}

export const actions = {
	/** Applied only while the state still carries the revision the payload was
	 * computed for — a stale payload is discarded, not written over fresher
	 * state. Called with the scores-only result and again with the completed one. */
	computed(c: AnalysisCell, payload: ComputedPayload): boolean {
		if (c.state.revision !== payload.revision) return false;

		const k = resultKey(payload.key.index, payload.key.tier, payload.key.subdiv);

		c.update(s => (s.revision !== payload.revision ? s : {
			...s,
			"results": {
				...s.results,
				[k]: {
					"revision": payload.revision,
					"key":      payload.key,
					"inputs":   payload.inputs,
					"result":   payload.result,
				},
			},
		}));

		return true;
	},

	/** Bumps the revision and keeps exactly the entries whose inputs still
	 * match `current`, re-stamping them to the new revision; entries whose
	 * fingerprint moved, or that are missing from `current`, are dropped. */
	commit(c: AnalysisCell, current: Readonly<Record<string, string>>): void {
		c.update(s => {
			const results: Record<string, ResultEntry> = {};

			for (const k in s.results) {
				const entry = s.results[k];
				if (!entry) continue;

				const now = current[k];
				if (now !== undefined && now === entry.inputs)
					results[k] = { ...entry, "revision": s.revision + 1 };
			}

			return { "revision": s.revision + 1, results };
		});
	},

	/** Geography changed: every result derives from it, drop everything. */
	reset(c: AnalysisCell): void {
		c.update(s => ({ "revision": s.revision + 1, "results": {} }));
	},
} as const;

// ---------------------------------------------------------------------------
// Pure result assembly (exported for the producer and for unit tests).
// ---------------------------------------------------------------------------

/** Everything but the per-dataset aggregates. */
export interface ScoresPayload {
	readonly cells: Float32Array;
	readonly mask: Uint8Array;
	readonly areas: Readonly<Record<string, AreaScores>>;
}

/** The per-dataset aggregates, areas first. */
export interface ValuesPayload {
	readonly areas: Readonly<Record<string, AreaValues>>;
	readonly national: AreaValues;
	readonly analysed: AreaValues;
}

/** A result whose values are still pending. */
export function withScores(scores: ScoresPayload): AnalysisResult {
	return {
		"cells":   scores.cells,
		"mask":    scores.mask,
		"areas":   Object.fromEntries(
			Object.entries(scores.areas).map(([id, a]): [string, AreaResult] =>
				[id, { "score": a.score, "bucket": a.bucket, "values": null }]),
		),
		"national": { "values": null },
		"analysed": { "values": null },
	};
}

export function withValues(partial: AnalysisResult, values: ValuesPayload): AnalysisResult {
	return {
		...partial,
		"areas": Object.fromEntries(
			Object.entries(partial.areas).map(([id, a]): [string, AreaResult] =>
				[id, { ...a, "values": values.areas[id] ?? null }]),
		),
		"national": { "values": values.national },
		"analysed": { "values": values.analysed },
	};
}

/** Structural view of aggregate_layer_values' output
 * ({ [datasetId]: { areas: { [areaId]: { result } } } }). */
export interface LayerDataLike {
	readonly [datasetId: string]: {
		readonly areas?: Readonly<Record<string, { readonly result?: AggregateResult | null } | undefined>> | undefined;
	} | undefined;
}

export function foldValues(aggregates: LayerDataLike): Record<string, AreaValues> {
	const out: Record<string, Record<string, AggregateResult | null>> = {};

	for (const datasetId in aggregates) {
		const areas = aggregates[datasetId]?.areas;
		if (!areas) continue;

		for (const areaId in areas) {
			const perArea = out[areaId] ?? (out[areaId] = {});
			perArea[datasetId] = areas[areaId]?.result ?? null;
		}
	}

	return out;
}

/** The whole-geography entry of a whole-outline aggregate (area '0'). */
export function foldNational(aggregates: LayerDataLike): AreaValues {
	const out: Record<string, AggregateResult | null> = {};

	for (const datasetId in aggregates)
		out[datasetId] = aggregates[datasetId]?.areas?.['0']?.result ?? null;

	return out;
}

// ---------------------------------------------------------------------------
// The producer service: memoises in-flight promises, publishes, invalidates.
// ---------------------------------------------------------------------------

export type MaybePromise<T> = T | Promise<T>;

export type PublishPhase = 'scores' | 'complete';

export interface ServiceSpec<V extends ValuesPayload> {
	/** Fingerprint of everything a result for (index, subdiv) derives from,
	 * live state included (subdiv, divtier, timeline date, per-dataset
	 * on/weight/domain/data). Every input change must produce a different
	 * string; the live subdiv is folded in so other-scope entries drop too. */
	readonly inputs: (index: string, subdiv: Subdiv) => string;

	/** The current subdivision (STATE.subdiv), for building request keys. */
	readonly subdiv: () => Subdiv;

	/** Geography identity; a change clears the whole cache. */
	readonly geography: () => string;

	/** Phase 1: cells, mask and per-area scores/buckets. Published before
	 * computeValues runs — popup handlers read scores synchronously. */
	readonly computeScores: (key: ResultKey) => MaybePromise<ScoresPayload>;

	/** Phase 2: the per-area / national aggregates. */
	readonly computeValues: (key: ResultKey, scores: ScoresPayload) => MaybePromise<V>;

	/** Called after a publish was actually applied (optional side-effect hook). */
	readonly published?: (
		key: ResultKey,
		phase: PublishPhase,
		payload: ScoresPayload | V,
		result: AnalysisResult,
	) => void;
}

export interface AnalysisService {
	/** Phase 1 as soon as it lands (scores readable while values are pending). */
	scores(index: string, tier: Tier): Promise<AnalysisResult>;
	/** The completed result. Never resolves with a result whose publish was
	 * discarded as stale — that case retries against the current inputs. */
	result(index: string, tier: Tier): Promise<AnalysisResult>;
	/** Memoised run() stage shared by canvas painting and the result pipeline,
	 * keyed (revision, index, subdiv); concurrent callers share one promise. */
	stage<T>(index: string, fn: () => MaybePromise<T>): Promise<T>;
	/** The COMMIT hook (a.js): revision bump + selective invalidation. */
	sync(): void;
	/** Drop every memoised promise without touching the atom. */
	clear(): void;
	/** Memoised promise count (bounded; tests/telemetry). */
	cacheSize(): number;
}

interface MemoEntry {
	key: ResultKey;
	revision: number;
	readonly inputs: string;
	readonly scores: Promise<AnalysisResult>;
	readonly done: Promise<AnalysisResult>;
}

/** The (index, subdiv) scope an entry's fingerprint is computed for. */
interface Scoped {
	readonly index: string;
	readonly subdiv: Subdiv;
}

interface StageEntry {
	readonly index: string;
	readonly subdiv: Subdiv;
	revision: number;
	readonly inputs: string;
	readonly promise: Promise<unknown>;
}

export function createAnalysisService<V extends ValuesPayload>(spec: ServiceSpec<V>): AnalysisService {
	let memo = new Map<string, MemoEntry>();
	let stages = new Map<string, StageEntry>();
	// Lazy: spec.geography() may read app globals absent at construction time.
	// Seeding the baseline on first use still catches a change before first sync.
	let geography: string | null = null;

	function observeGeography(): string {
		const geo = spec.geography();
		if (geography === null) geography = geo;
		return geo;
	}

	const memoKey = (revision: number, key: ResultKey) =>
		`${revision}|${resultKey(key.index, key.tier, key.subdiv)}`;

	function publish(
		inputs: string,
		key: ResultKey,
		phase: PublishPhase,
		payload: ScoresPayload | V,
		result: AnalysisResult,
	): boolean {
		const c = cell();

		// Inputs moved while the computation was in flight: do not publish. The
		// caller retries against the current inputs (see start()).
		if (spec.inputs(key.index, key.subdiv) !== inputs) return false;

		const applied = actions.computed(c, {
			"revision": c.state.revision,
			key,
			"inputs": inputs,
			result,
		});

		if (applied && spec.published) spec.published(key, phase, payload, result);

		return applied;
	}

	function start(key: ResultKey): MemoEntry {
		observeGeography();
		const revision = cell().state.revision;
		const k = memoKey(revision, key);
		const inputs = spec.inputs(key.index, key.subdiv);

		// A change can land inside COMMIT's 300ms debounce, before the revision
		// (and memo key) is bumped; serving a pre-change entry would publish a
		// stale analysis. Mismatch = miss.
		const hit = memo.get(k);
		if (hit && hit.inputs === inputs) return hit;

		// In-flight promises are memoised so concurrent callers share one computation.
		const scoresPayload = (async () => spec.computeScores(key))();

		// Phase 1, shared by both entry points; null when its publish was
		// discarded as stale.
		const phase1 = (async () => {
			const payload = await scoresPayload;
			const partial = withScores(payload);

			// Phase 1 lands before computeValues is called: popup handlers read
			// per-area scores synchronously at publish time, while the aggregates
			// are still pending.
			return publish(inputs, key, 'scores', payload, partial)
				? { payload, partial }
				: null;
		})();

		const scores = (async () => {
			const p1 = await phase1;

			// Publish was discarded as stale: retry against the current inputs
			// rather than resolve a result the atom never held.
			return p1 ? p1.partial : start(key).scores;
		})();

		const done = (async () => {
			const p1 = await phase1;
			if (!p1) return start(key).done;

			const values = await spec.computeValues(key, p1.payload);
			const complete = withValues(p1.partial, values);

			// Phase 2 went stale too: recompute the whole pipeline against the
			// current inputs.
			return publish(inputs, key, 'complete', values, complete)
				? complete
				: start(key).done;
		})();

		const entry: MemoEntry = { key, revision, inputs, scores, done };
		memo.set(k, entry);

		return entry;
	}

	function keepEntry(entry: { revision: number; inputs: string }, scope: Scoped, revision: number): boolean {
		if (spec.inputs(scope.index, scope.subdiv) !== entry.inputs) return false;
		// Bounded cache: drop anything older than the previous revision.
		if (entry.revision < revision - 1) return false;

		entry.revision = revision;
		return true;
	}

	return {
		scores(index: string, tier: Tier): Promise<AnalysisResult> {
			return start({ index, "tier": tier, "subdiv": spec.subdiv() }).scores;
		},

		result(index: string, tier: Tier): Promise<AnalysisResult> {
			return start({ index, "tier": tier, "subdiv": spec.subdiv() }).done;
		},

		stage<T2>(index: string, fn: () => MaybePromise<T2>): Promise<T2> {
			observeGeography();
			const subdiv = spec.subdiv();
			const revision = cell().state.revision;
			const k = `${revision}|stage|${index}|${String(subdiv)}`;
			const inputs = spec.inputs(index, subdiv);

			// Same re-verification as start(): a stale stage's cells would be
			// folded into a post-change result whose guard then applies it.
			// Mismatch = miss.
			const hit = stages.get(k);
			if (hit && hit.inputs === inputs) return hit.promise as Promise<T2>;

			const promise = Promise.resolve(fn());

			stages.set(k, {
				index,
				subdiv,
				revision,
				inputs,
				"promise": promise,
			});

			return promise;
		},

		sync(): void {
			const c = cell();
			const geo = observeGeography();

			if (geo !== geography) {
				geography = geo;
				memo.clear();
				stages.clear();
				actions.reset(c);
				return;
			}

			const current: Record<string, string> = {};
			for (const k in c.state.results) {
				const entry = c.state.results[k];
				if (entry) current[k] = spec.inputs(entry.key.index, entry.key.subdiv);
			}

			actions.commit(c, current);

			// Re-read: cell() snapshots at call time, so c.state still carries
			// the pre-commit revision.
			const revision = cell().state.revision;

			const keptMemo = new Map<string, MemoEntry>();
			for (const entry of memo.values()) {
				if (keepEntry(entry, entry.key, revision))
					keptMemo.set(memoKey(revision, entry.key), entry);
			}
			memo = keptMemo;

			const keptStages = new Map<string, StageEntry>();
			for (const entry of stages.values()) {
				if (keepEntry(entry, entry, revision))
					keptStages.set(`${revision}|stage|${entry.index}|${String(entry.subdiv)}`, entry);
			}
			stages = keptStages;
		},

		clear(): void {
			memo.clear();
			stages.clear();
		},

		cacheSize(): number {
			return memo.size + stages.size;
		},
	};
}
