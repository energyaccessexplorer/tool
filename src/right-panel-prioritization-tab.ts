// Right-panel Prioritization tab view: renders the atom from
// right-panel-prioritization-state.ts. Impure by design — DOM and i18n live
// here; per-index entries come from memoised analysis results. Producers dispatch
// actions on the atom; the subscription at the bottom runs the entries service.

import {
	analysis_cells,
	analysis_scores,
	dataset_feeds_index,
} from './analysis.ts';

import {
	score_bucket,
} from './area-scores.ts';

import {
	setup_about_button,
} from './right-panel-graphs.js';

import {
	area_type,
} from './utils.js';

import { translateNode, t, translateIndexName, getScaleLabels, registerUIUpdater } from './translate.js';

import {
	make_title,
} from './right-panel-tabs.js';

import {
	ce,
	qs,
	tmpl,
} from '../lib/helpers.js';

import {
	activeDatasets,
} from './right-panel-shared.ts';

import {
	actions,
	cell,
	subscribe,
} from './right-panel-prioritization-state.ts';

import type {
	AnalysisResult,
} from './analysis-state.ts';

import type {
	AdminRef,
} from './right-panel-shared.ts';

import type {
	IndexEntries,
	IndexEntry,
	LocationSummary,
	PriorityState,
	PriorityView,
} from './right-panel-prioritization-state.ts';

function hasDatasetsFor(key: string): boolean {
	const compound = EAE['indexes'][key]?.compound ?? [];
	return STATE.datasets.some(d =>
		dataset_feeds_index(d, key) || compound.some(c => dataset_feeds_index(d, c)));
}

function pixelEntry(raster: ArrayLike<number>, rasterIndex: number): IndexEntry {
	const v = raster[rasterIndex];
	const value = v != null && v !== -1 ? v : null;
	return { value, "bucket": score_bucket(value) };
}

/**
 * One index's entry for the selected admin area, read from that index's
 * memoised analysis result: the area's score and bucket, both from
 * area-scores.ts's one scale.
 */
function adminAreaEntry(result: AnalysisResult | undefined, admin: AdminRef): IndexEntry {
	const area = result?.areas[String(admin.id)];
	return { "value": area?.score ?? null, "bucket": area?.bucket ?? null };
}

/**
 * Every row for the selection is read from its index's memoised analysis
 * result: analysis_scores (per-area score + bucket) for an admin area,
 * analysis_cells for a raster pixel.
 */
async function buildEntries(view: Extract<PriorityView, { readonly kind: 'location' }>): Promise<IndexEntries> {
	const otherKeys = Object.keys(EAE['indexes'])
		.filter(k => k !== STATE.index && hasDatasetsFor(k));

	const admin = view.admin;
	const rasterIndex = view.rasterIndex;
	const empty: IndexEntry = { "value": null, "bucket": null };

	if (admin) {
		// One memoised result per index at the selection's own division tier.
		const keys = hasDatasetsFor(STATE.index) ? [STATE.index, ...otherKeys] : otherKeys;
		const results = await Promise.all(keys.map(key => analysis_scores(key, admin.variant)));
		const entries = Object.fromEntries(keys.map((key, i): [string, IndexEntry] =>
			[key, adminAreaEntry(results[i], admin)]));

		return { ...entries, [STATE.index]: entries[STATE.index] ?? empty };
	}

	const rasters = await Promise.all(otherKeys.map(key => analysis_cells(key)));

	// The current column is the clicked cell's raw value as the open map-info
	// carries it, bucketed through the same one scale.
	const current: IndexEntry = hasDatasetsFor(STATE.index)
		? { "value": view.analysisValue, "bucket": score_bucket(view.analysisValue) }
		: empty;

	return {
		[STATE.index]: current,
		...Object.fromEntries(otherKeys.map((key, i): [string, IndexEntry] =>
			[key, pixelEntry(rasters[i]?.raster ?? [], rasterIndex ?? 0)])),
	};
}

/**
 * Entries service: runs when the view is location-and-pending. If the view
 * moved on while awaiting (map-info closed, another selection landed), the
 * captured view object no longer matches and the result is dropped.
 */
async function computeEntries(): Promise<void> {
	const pending = cell().state.view;
	if (pending.kind !== 'location' || pending.entries !== null) return;

	// Legacy update() returned early when there was nothing to extract from
	// (no admin feature, no raster pixel): resolve empty so the view leaves
	// the pending state but renders no card. Same for _variant-tagged admin
	// refs (EAE-306 Filtered geographies clicks): no priority score exists
	// for timeline coverage, so the per-index card is skipped.
	const entries = (pending.admin == null && pending.rasterIndex == null)
		|| pending.admin?._variant !== undefined
		? {}
		: await buildEntries(pending);

	const c = cell();
	if (c.state.view !== pending) return;
	actions.entriesComputed(c, entries);
}

function renderTitle(view: PriorityView): void {
	const el = qs('#tab-title');
	if (!el) return;

	const admin = view.kind === 'location' ? view.admin : null;
	const rasterIndex = view.kind === 'location' ? view.rasterIndex : null;

	el.replaceChildren(...(activeDatasets().length ? [make_title(admin, rasterIndex)] : []));
}

function makeRow(key: string, entry: IndexEntry | undefined, subordinate = false): HTMLElement {
	const bucket = entry?.bucket ?? null;
	const formatted = (bucket ? getScaleLabels(window.LOCALE)[bucket.index] : undefined) ?? bucket?.label ?? '—';

	const row = ce('div', null, { 'class': subordinate ? 'index-priority-row subordinate' : 'index-priority-row' });
	const name = ce('span', null, { 'class': 'index-priority-name' });
	name.textContent = translateIndexName(window.LOCALE, key);
	const val = ce('span', null, { 'class': 'index-priority-value' });
	val.textContent = formatted;
	row.append(name, val);
	return row;
}

/**
 * Card row order; demand and supply render as subordinate rows of the
 * current index. (Hard-coded in legacy update() — kept, just data-driven.)
 */
const ROWS: ReadonlyArray<readonly [key: string, subordinate: boolean]> = [
	['eai', false],
	['demand', true],
	['supply', true],
	['ani', false],
];

function renderCard(view: PriorityView): void {
	const container = qs('#index-priority-container');
	if (!container) return;

	container.innerHTML = '';

	if (view.kind !== 'location' || !view.entries) return;
	if (!Object.values(view.entries).some(e => e.value !== null)) return;

	const entries = view.entries;
	const card = tmpl('#index-priority-card-template');
	if (!card) return;

	const body = qs('.index-priority-values', card);
	if (!body) return;

	for (const [key, subordinate] of ROWS)
		body.append(makeRow(key, entries[key], subordinate));

	setup_about_button(card, t(window.LOCALE, 'modal.eae_info.index.eai.explain'));
	translateNode(window.LOCALE, card);

	container.append(card);
}

function renderSummary(summary: LocationSummary | null): void {
	const container = qs('#location-summary');
	if (!container) return;

	if (!summary || summary.priorityScore == null) {
		container.style.display = 'none';
		return;
	}

	const areaLabel = summary.variant
		? area_type(summary.variant)
		: t(window.LOCALE, 'right_panel.prioritization.priority_areas', { "area": area_type('raster') });

	const coords = qs('.location-coordinates', container);
	if (coords instanceof HTMLElement) {
		coords.textContent = summary.coordinates ?? '';
		coords.style.display = summary.coordinates ? '' : 'none';
	}

	const badge = qs('.location-priority-badge', container);
	if (badge) badge.textContent = t(window.LOCALE, 'right_panel.prioritization.priority_score_badge', { "score": summary.priorityScore });

	const areaType = qs('.location-area-type span', container);
	if (areaType) areaType.textContent = areaLabel;

	const locRow = qs('.location-name', container);
	if (locRow instanceof HTMLElement) {
		const span = qs('span', locRow);
		if (span) span.textContent = summary.locationName ?? '';
		locRow.style.display = summary.locationName ? '' : 'none';
	}

	container.style.display = '';
}

/**
 * Full-component re-render from the atom: tab title, index-priority card
 * and the location-summary strip.
 */
function render(state: PriorityState): void {
	renderTitle(state.view);
	renderCard(state.view);
	renderSummary(state.summary);
}

export function init(): void {
	render(cell().state);
}

subscribe(s => {
	render(s);
	if (s.view.kind === 'location' && s.view.entries === null) void computeEntries();
});

// i18n bridge: on locale switch, re-render from the atom — the state holds
// raw values, so the title, card rows and summary re-translate in place
// (legacy only replayed the title and left the rest stale).
registerUIUpdater(() => render(cell().state));
