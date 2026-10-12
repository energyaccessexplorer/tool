// EAE-521: the single atom for derived analysis state
// (notes/area-score-refactor.md §4-6, esp. §6.7-8). One meiosis cell holds
// the memoised `analysis_result` payloads — cells, mask, per-area scores /
// buckets / values and the first-class whole-geography entry — keyed by
// key(index, tier, subdiv), plus the pure producer service that memoises
// in-flight promises and publishes through a revision staleness guard.
//
// Same conventions as right-panel-data-state.ts / timeline-state.ts:
// pure module (no DOM, no app globals), meiosis-stream function patches,
// cell/actions/subscribe, staleness-guarded actions. The IMPURE producer
// (run() + area-scores + layer aggregates against STATE/GEOGRAPHY/OUTLINE)
// is injected as computeScores/computeValues and lives in analysis.js.
//
// Invalidation is driven from a.js's COMMIT (via service.sync(), next to
// timeline_sync_datasets) — NOT from state_set — so the 300ms debounce
// coalesces slider drags into one revalidation. Every commit bumps
// `revision`; entries whose inputs are unchanged are re-stamped to the new
// revision (unrelated commits do NOT invalidate), entries whose inputs
// moved are dropped (so a change evicts exactly what it affects).
//
// Two-phase publish (§6.7): computeScores' payload — per-area scores and
// buckets — is published synchronously before computeValues is even
// called, because mapbox popup handlers read scores synchronously while
// the layer aggregates are still being computed.
//
// Erasable-syntax only (no namespace/enum): node strip-types runs the tests.

import stream from './meiosis-stream.ts';

/** A subdivision selection (STATE.subdiv); null is "no subdivision filter". */
export type Subdiv = number | string | null;

/** A division tier (STATE.variant: a tier number or 'raster'). */
export type Tier = number | string;

/** The identity of one derived analysis result. */
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

/** The score/bucket half of an area entry (phase 1). */
export interface AreaScores {
	/** The area's average analysis score. */
	readonly score: number;
	/** Low..High label from the one area scale; null is "no score". */
	readonly bucket: string | null;
}

/** One area's full entry: score, bucket and its per-dataset aggregates. */
export interface AreaResult extends AreaScores {
	/** Per-area values per dataset; null until the second publish phase. */
	readonly values: AreaValues | null;
}

/**
 * The whole-geography entry, FIRST-CLASS (§6.3): the per-dataset aggregates
 * over the full outline with no analysis mask. This is what right-panel.js,
 * right-panel-data-tab.ts and summary.js faked as "area 0" until now. Null
 * until the second publish phase.
 */
export interface NationalResult {
	readonly values: AreaValues | null;
}

/**
 * One derived analysis result (notes §4).
 *
 * - cells:   the analysis raster (run()'s rescaled scores, -1 clipped).
 * - mask:    the "analysed cells" rule (today's has_priority_score; the
 *            mask unification lands separately, TODO(#13)).
 * - areas:   per division area: values per dataset, score, bucket.
 * - national: the whole-geography entry (§6.3).
 * - analysed: the analysed cells inside the outline — the cards'
 *             analysed-area universe (EAE-514), outline-gated so it needs
 *             no admin division.
 */
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
	/** The inputs fingerprint captured at compute time (see ServiceSpec.inputs). */
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
	/** Snapshot taken at cell() call time (timeline-state convention) —
	 * re-call cell() or use subscribe() for a fresh read. */
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
	/**
	 * A result computation resolved and is being published. Applied only
	 * while the state still carries the revision it was computed for — a
	 * stale payload (a commit landed meanwhile) is discarded instead of
	 * clobbering fresher state (the right-panel-data-state nationalComputed
	 * pattern). Two-phase: called once with the scores-only result and again
	 * with the completed one. Returns whether it was applied.
	 */
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

	/**
	 * A COMMIT landed: bump the revision and keep exactly the entries whose
	 * inputs are unchanged (re-stamped to the new revision, so unrelated
	 * commits — map moves, tab switches — do not invalidate anything);
	 * entries whose fingerprint moved — dataset on/weight/domain (`_afn`
	 * range sliders), subdiv, tier, data arrival — are dropped.
	 *
	 * `current` maps every stored entry's resultKey to its fingerprint NOW
	 * (ServiceSpec.inputs). Entries missing from the map are unverifiable
	 * and are dropped too.
	 */
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

/** Phase-1 payload: everything but the per-dataset aggregates. */
export interface ScoresPayload {
	readonly cells: Float32Array;
	readonly mask: Uint8Array;
	readonly areas: Readonly<Record<string, AreaScores>>;
}

/** Phase-2 payload: the per-dataset aggregates, areas first. */
export interface ValuesPayload {
	readonly areas: Readonly<Record<string, AreaValues>>;
	readonly national: AreaValues;
	readonly analysed: AreaValues;
}

/** Builds the phase-1 result (values pending) from a scores payload. */
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

/** Folds the phase-2 aggregates into a phase-1 result. */
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

/**
 * Structural view of analysis.js's aggregate_layer_values output
 * ({ [datasetId]: { ..., areas: { [areaId]: { result } } } }).
 */
export interface LayerDataLike {
	readonly [datasetId: string]: {
		readonly areas?: Readonly<Record<string, { readonly result?: AggregateResult | null } | undefined>> | undefined;
	} | undefined;
}

/** Folds layer data into per-area values per dataset (area-first). */
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

/** The whole-geography entry of a whole-outline aggregate (fake "area 0"). */
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
	/**
	 * The fingerprint of EVERYTHING a result for (index, subdiv) derives
	 * from: live mutable state included (subdiv, divtier, timeline date,
	 * dataset on/weight/domain/_domain_select, data arrival). Compared
	 * across commits to decide invalidation — every input change must show
	 * up as a different string. `subdiv` is the scope's key part; fold in the
	 * live subdiv too so entries of other subdivisions are dropped when it
	 * changes.
	 */
	readonly inputs: (index: string, subdiv: Subdiv) => string;

	/** The current subdivision (STATE.subdiv), used to build request keys. */
	readonly subdiv: () => Subdiv;

	/** Geography identity; a change clears the whole cache. */
	readonly geography: () => string;

	/**
	 * Phase 1: cells, mask and per-area scores/buckets. Runs first and its
	 * result is published before computeValues is called (§6.7).
	 */
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
	/**
	 * The completed result (values + national). Never resolves with a
	 * result whose publish was discarded as stale — that case retries the
	 * computation against the current inputs (see start()).
	 */
	result(index: string, tier: Tier): Promise<AnalysisResult>;
	/**
	 * Memoised first stage (the run() shared by canvas painting and the
	 * result pipeline), keyed (revision, index, subdiv). Concurrent callers
	 * share one promise.
	 */
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

/** The (index, subdiv) scope a cache entry's fingerprint is computed for. */
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
	// Lazy: spec.geography() may read app globals that do not exist yet at
	// construction time (the module loads before the geography does). The
	// baseline is seeded on first use, so a change before the first sync is
	// still caught.
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

		// Inputs moved while the computation was in flight: the result is
		// stale in substance — do not publish it. The caller retries against
		// the current inputs (see start()), so an un-published result is never
		// resolved to a consumer either.
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

		// A hit is served only while its captured fingerprint still matches:
		// a change can land INSIDE the 300ms COMMIT debounce — the revision,
		// and with it the memo key, is not bumped yet — and a pre-change entry
		// served here publishes a stale analysis. Mismatch = miss.
		const hit = memo.get(k);
		if (hit && hit.inputs === inputs) return hit;

		// In-flight promises are memoised, so concurrent callers (map paint
		// + popup + summary firing from one reload()) share one computation.
		const scoresPayload = (async () => spec.computeScores(key))();

		// Phase 1, shared by both entry points — or null when its publish was
		// discarded as stale (inputs moved while the computation was in
		// flight).
		const phase1 = (async () => {
			const payload = await scoresPayload;
			const partial = withScores(payload);

			// Phase 1 lands BEFORE computeValues is even called: per-area
			// scores are synchronously readable at publish time (§6.7).
			return publish(inputs, key, 'scores', payload, partial)
				? { payload, partial }
				: null;
		})();

		const scores = (async () => {
			const p1 = await phase1;

			// The publish was discarded as stale: the caller asked for the
			// result for the CURRENT inputs — retry the computation against
			// them rather than resolving a result the atom never held (the
			// fresh start re-verifies and replaces this entry, so every
			// waiting caller shares one retry).
			return p1 ? p1.partial : start(key).scores;
		})();

		const done = (async () => {
			const p1 = await phase1;
			if (!p1) return start(key).done;

			const values = await spec.computeValues(key, p1.payload);
			const complete = withValues(p1.partial, values);

			// Phase 2 went stale (inputs moved while the aggregates were in
			// flight): the completed result is stale in substance too —
			// recompute the whole pipeline against the current inputs.
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

			// Same hit re-verification as start(): the pre-change run() cells a
			// stale stage hit returns would be folded into a post-change result
			// whose publish guard sees matching (post-change) captures and
			// applies it — the stale-publish half of the debounce race.
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

			// Re-read: cell() snapshots state at call time (timeline-state
			// convention), so c.state still carries the pre-commit revision.
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
