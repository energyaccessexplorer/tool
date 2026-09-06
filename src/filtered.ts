// EAE-306: "Filtered geographies" widget (Timeline tab) and the global
// "only areas that meet all data layer criteria" mask extension.
//
// The widget reuses Prioritization's real "High priority areas"
// list/pagination/table/CSV components (create_paginated_list() factory,
// item._variant tagging) and reads the same global "Analysis Area" selector
// (STATE.variant), so both features share one implementation and stay in
// sync by construction.
//
// Cross-tier coverage (e.g. which Counties a Wind Cluster dataset touches)
// resolves through the app's existing pixel->area-id raster crosswalk
// (GEOGRAPHY.divisions[tier].raster.data, the same structure analysis.js's
// division_averages() reduces over), which naturally extends to raster
// ("Prioritized Areas") mode too.
//
// This module is view-side: it reads the app globals (STATE/GEOGRAPHY) and
// writes DOM. Erasable-syntax only (no namespace/enum).

import { qs } from '../lib/helpers.js';

import { t, translateDivisionName, registerUIUpdater } from './translate.js';

import { raster_outlier_ids } from './utils.js';

import { show as show_modal_table } from './modal-table-high-priority-areas.js';

import { download_high_priority_areas } from './export.js';

import { create_paginated_list } from './right-panel-high-priority-areas.js';

export const colorsArray = ["transparent", "red", "#0059ff", "#d6d600", "green", "#d600c6", "#00cad6", "#6a4801", "black"];

/** The slices of a DS dataset the filtered-coverage computation reads.
 * STATE.datasets is untyped legacy (globals.d.ts); cast at the boundary. */
interface TimelineCsvDataset {
	readonly type?: string;
	readonly on?: boolean;
	readonly csv?: {
		readonly key?: string;
		readonly data?: readonly Record<string, string>[];
	};
	readonly config?: { readonly divisions_tier?: number | string };
}

/** A timeline dataset guaranteed to carry its CSV (post-filter narrowing). */
interface ActiveTimelineDataset extends TimelineCsvDataset {
	readonly csv: {
		readonly key?: string;
		readonly data: readonly Record<string, string>[];
	};
}

/** One admin-tier area with timeline coverage (a division vectors feature). */
export interface FilteredAreaResult {
	readonly id: number;
	readonly name: string;
	readonly feature: { readonly id: string | number };
	readonly _variant: number | string;
}

/** Minimal shape of the shared create_paginated_list() factory product. */
interface PaginatedList {
	setResults(results: readonly FilteredAreaResult[]): void;
	render(): void;
	getResults(): readonly FilteredAreaResult[];
}

interface FilteredWidgetState {
	areaLabel: string | null;
	list: PaginatedList | null;
}

const state: FilteredWidgetState = {
	"areaLabel": null,
	"list":      null,
};

function hasCsvData(ds: TimelineCsvDataset): ds is ActiveTimelineDataset {
	return ds.csv?.data !== undefined;
};

function activeTimelineDatasets(): ActiveTimelineDataset[] {
	return (STATE.datasets as readonly TimelineCsvDataset[])
		.filter(ds => ds.type === 'polygons-timeline' && Boolean(ds.on))
		.filter(hasCsvData);
};

function coveredIds(ds: ActiveTimelineDataset): Set<number> {
	return new Set(ds.csv.data.map(r => Number(r[ds.csv.key ?? ''])).filter(id => !isNaN(id)));
};

// The timeline datasets define their own admin-area tiers; the list is pinned
// to those tiers rather than the global Analysis Area selector.
function timelineTiers(): (number | string)[] {
	return Array.from(new Set(
		activeTimelineDatasets()
			.map(ds => ds.config?.divisions_tier)
			.filter((tier): tier is number | string => tier != null),
	));
};

function getTimelineDivisionResults(tier: number | string): FilteredAreaResult[] {
	const division = GEOGRAPHY.divisions?.[tier];
	if (!division?.vectors?.data) return [];

	const datasets = activeTimelineDatasets().filter(ds => ds.config?.divisions_tier === tier);
	if (!datasets.length) return [];

	const features = division.vectors.data.features ?? [];
	const nameTable = division.csv?.table ?? {};

	const ids = new Set<number>();

	datasets.forEach(ds => {
		coveredIds(ds).forEach(id => ids.add(id));
	});

	return Array.from(ids)
		.map(id => {
			const feature = features.find(f => Number(f.id) === id);
			if (!feature) return null;

			return { id, "name": nameTable[id] || `#${id}`, feature, "_variant": tier };
		})
		.filter((r): r is FilteredAreaResult => r !== null);
};

function filteredTitle(): string {
	return state.areaLabel
		? t(window.LOCALE, 'timeline.filtered_geographies.title_with_name', { "name": state.areaLabel })
		: t(window.LOCALE, 'timeline.filtered_geographies.title');
};

function renderTitle(): void {
	const el = qs('#timeline-filtered-title');
	if (!el) return;

	el.textContent = filteredTitle();
};

function showAllModal(): void {
	show_modal_table(state.list?.getResults() ?? [], {
		"title":              filteredTitle(),
		"subtitle":           state.areaLabel,
		"action_label":       t(window.LOCALE, 'modal.export.download_csv'),
		"column_toggle_hint": t(window.LOCALE, 'modal.export.csv_hint'),
		on_download(results: unknown, visible_headers: unknown) {
			download_high_priority_areas(results, { visible_headers });
		},
	});
};

// Adds active timeline vector datasets' own per-year coverage to a per-pixel criteria mask.
export function compoundMask(criteria: ArrayLike<number>): { readonly data: Int8Array; readonly nodata: number } {
	const data = Int8Array.from(criteria, v => v ? 1 : -1);

	activeTimelineDatasets().forEach(ds => {
		const sourceTier = ds.config?.divisions_tier;
		const raster = sourceTier !== undefined ? GEOGRAPHY.divisions?.[sourceTier]?.raster : undefined;
		if (!raster) return;

		const ids = coveredIds(ds);
		const excluded = raster_outlier_ids(sourceTier);

		for (let i = 0; i < raster.data.length; i++) {
			if (data[i] === -1) continue;

			const id = raster.data[i];
			if (id === undefined || excluded.has(id) || !ids.has(id)) data[i] = -1;
		}
	});

	return { data, "nodata": -1 };
};

// Lists only the admin areas defined by the active timeline datasets, at
// their own native tiers — independent of the global Analysis Area selector.
export function valuedPolygons(): void {
	const noResults = qs('#filtered-no-results') as HTMLElement | null;
	const resultsContainer = qs('#filtered-results') as HTMLElement | null;
	if (!noResults || !resultsContainer) return;

	if (!state.list) {
		state.list = create_paginated_list(qs('#filtered-list', resultsContainer));
		const viewAll = qs('#filtered-view-all', resultsContainer) as HTMLElement | null;
		if (viewAll) viewAll.onclick = showAllModal;
	}

	const tiers = timelineTiers();
	const results = tiers.flatMap(tier => getTimelineDivisionResults(tier));

	const firstTier = tiers.length === 1 ? tiers[0] : undefined;
	state.areaLabel = firstTier !== undefined
		? translateDivisionName(window.LOCALE, GEOGRAPHY.divisions?.[firstTier]?.name)
		: null;

	renderTitle();

	noResults.style.display = results.length ? 'none' : '';
	resultsContainer.style.display = results.length ? '' : 'none';

	if (!results.length) return;

	state.list.setResults(results);
	state.list.render();
};

registerUIUpdater(renderTitle);
