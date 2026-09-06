// Right-panel Prioritization tab view: renders the atom from
// right-panel-prioritization-state.ts. Impure by design — DOM, i18n, the
// per-index analyses and division scales live here. Producers dispatch
// actions on the atom; the subscription at the bottom re-renders and runs
// the entries service.

import analysis_run, {
	dataset_feeds_index,
	division_averages,
	lowmedhigh_scale,
	priority_scale,
} from './analysis.js';

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
	AdminRef,
} from './right-panel-shared.ts';

import type {
	IndexEntries,
	IndexEntry,
	LocationSummary,
	PriorityState,
	PriorityView,
} from './right-panel-prioritization-state.ts';

/** Division averages as keyed by division id (division_averages stringifies ids). */
type DivisionAverages = Record<string, { readonly average: number }>;

function hasDatasetsFor(key: string): boolean {
	const compound = EAE['indexes'][key]?.compound ?? [];
	return STATE.datasets.some(d =>
		dataset_feeds_index(d, key) || compound.some(c => dataset_feeds_index(d, c)));
}

/**
 * Bucket a value through the applicable scale, or null when there is no
 * value or no scale (legacy make_row's (value != null && scale) guard).
 */
function bucketOf(value: number | null, scale: ((v: number) => string) | null): string | null {
	return value != null && scale ? scale(value) : null;
}

function pixelEntry(raster: ArrayLike<number>, rasterIndex: number): IndexEntry {
	const v = raster[rasterIndex];
	const value = v != null && v !== -1 ? v : null;
	return { value, "bucket": bucketOf(value, lowmedhigh_scale) };
}

function adminAreaEntry(raster: ArrayLike<number>, admin: AdminRef): IndexEntry {
	const division = GEOGRAPHY.divisions?.[admin.variant];
	if (!division?.raster?.data) return { "value": null, "bucket": null };

	const areas = division_averages(raster, division.raster.data) as DivisionAverages;
	const value = areas[String(admin.id)]?.average ?? null;
	const scale = priority_scale(areas, lowmedhigh_scale.range()) as ((v: number) => string) | null;

	return { value, "bucket": bucketOf(value, scale) };
}

/**
 * Legacy update(), minus the DOM: run the per-index analyses for every
 * index but the current one and bucket each result for the selection.
 */
async function buildEntries(view: Extract<PriorityView, { readonly kind: 'location' }>): Promise<IndexEntries> {
	const otherKeys = Object.keys(EAE['indexes'])
		.filter(k => k !== STATE.index && hasDatasetsFor(k));

	const results = await Promise.all(otherKeys.map(key => analysis_run(key)));

	const admin = view.admin;
	const rasterIndex = view.rasterIndex;

	const extract = admin
		? (raster: ArrayLike<number>) => adminAreaEntry(raster, admin)
		: (raster: ArrayLike<number>) => pixelEntry(raster, rasterIndex ?? 0);

	let currentBucket: string | null = null;
	if (admin) {
		const priorityData = GEOGRAPHY.divisions?.[admin.variant]?.priorityData;
		const scale = priorityData
			? priority_scale(priorityData, lowmedhigh_scale.range()) as ((v: number) => string) | null
			: null;
		currentBucket = bucketOf(view.analysisValue, scale);
	} else {
		currentBucket = bucketOf(view.analysisValue, lowmedhigh_scale);
	}

	const current: IndexEntry = hasDatasetsFor(STATE.index)
		? { "value": view.analysisValue, "bucket": currentBucket }
		: { "value": null, "bucket": null };

	return {
		[STATE.index]: current,
		...Object.fromEntries(otherKeys.map((key, i) => [key, extract(results[i]?.raster ?? [])])),
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
	// the pending state but renders no card.
	const entries = (pending.admin == null && pending.rasterIndex == null)
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
	const rangeIndex = bucket == null ? -1 : lowmedhigh_scale.range().indexOf(bucket);
	const formatted = (rangeIndex === -1 ? undefined : getScaleLabels(window.LOCALE)[rangeIndex]) ?? bucket ?? '—';

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
