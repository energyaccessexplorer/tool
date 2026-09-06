// Right-panel Data tab view: renders the atom from right-panel-data-state.ts.
// Impure by design — DOM, i18n/formatting, the national aggregation and the
// module-level caches live here. Producers dispatch actions on the atom; the
// subscription at the bottom re-renders and runs the national service.

import {
	resolve_unit,
} from './area-analysis.js';

import {
	make_title,
} from './right-panel-tabs.js';

import {
	aggregate_layer_values,
} from './analysis.js';

import {
	STANDARD_TABS,
} from './a.js';

import bind from '../lib/bind.js';
import bubblemessage from '../lib/bubblemessage.js';
import { t, translateUnit, translateDatasetName, registerUIUpdater } from './translate.js';

import {
	ce,
	qs,
} from '../lib/helpers.js';

import {
	svg_pie,
	format_value_unit,
} from './utils.js';

import {
	actions,
	cell,
	subscribe,
	indexEntries,
	resolveAdminInfo,
	toLayerEntries,
} from './right-panel-data-state.ts';

import type {
	AdminRef,
	AggregatedLayerData,
	DataState,
	LayerEntry,
} from './right-panel-data-state.ts';

/**
 * Minimal structural type for the legacy dataset objects the view touches
 * (STATE.datasets entries). Full dataset typing is out of scope; grow as
 * more modules are ported.
 */
interface LegacyDataset {
	readonly id: string;
	readonly name: string;
	readonly on: boolean;
	readonly type?: string;
	// matches the legacy DS method name (ds.js) — not renamed
	info_modal(): void;
	readonly category?: {
		readonly name: string;
		readonly datatype?: string;
		readonly unit?: string;
		readonly analysis?: { readonly aggregation?: string };
		readonly controls?: { readonly path?: readonly string[] };
	};
	readonly csv?: {
		readonly data?: ReadonlyArray<Record<string, unknown>>;
		readonly key?: string;
		readonly column?: string;
	};
	readonly raster?: RasterLike;
	readonly colorscale?: { readonly fn: (value: number) => string };
}

interface DistributionSlice {
	readonly value: number;
	readonly name: string;
	readonly color: string;
	readonly percentage: number;
}

const POINTS_KEYS: Record<string, string> = {
	'count':           'right_panel.data.descriptions.points.count',
	'distance in km':  'right_panel.data.descriptions.points.distance',
	'proximity in km': 'right_panel.data.descriptions.points.distance',
	'Kwp':             'right_panel.data.descriptions.points.kwp',
	'kVA':             'right_panel.data.descriptions.points.kva',
	'km':              'right_panel.data.descriptions.points.km',
};

const RASTER_SUM_KEYS: Record<string, string> = {
	'count':         'right_panel.data.descriptions.raster_sum.count',
	'people':        'right_panel.data.descriptions.raster_sum.people',
	'households':    'right_panel.data.descriptions.raster_sum.households',
	'MW':            'right_panel.data.descriptions.raster_sum.mw',
	'GWh':           'right_panel.data.descriptions.raster_sum.gwh',
	'Metric Tonnes': 'right_panel.data.descriptions.raster_sum.metric_tonnes',
	'tCO2eq':        'right_panel.data.descriptions.raster_sum.tco2eq',
	'USD':           'right_panel.data.descriptions.raster_sum.usd',
	'm³/yr':         'right_panel.data.descriptions.raster_sum.m3yr',
};

const RASTER_KEYS: Record<string, string> = {
	'count':                      'right_panel.data.descriptions.raster.count',
	'km (proximity to)':          'right_panel.data.descriptions.raster.km_proximity',
	'kWh/m²':                     'right_panel.data.descriptions.raster.kwh_m2',
	'ppl/km²':                    'right_panel.data.descriptions.raster.ppl_km2',
	'people':                     'right_panel.data.descriptions.raster.people',
	'households':                 'right_panel.data.descriptions.raster.households',
	'%':                          'right_panel.data.descriptions.raster.pct',
	'Coverage (%) per km²':       'right_panel.data.descriptions.raster.coverage_pct',
	'MW':                         'right_panel.data.descriptions.raster.mw',
	'GWh':                        'right_panel.data.descriptions.raster.gwh',
	'kWh/ha/year':                'right_panel.data.descriptions.raster.kwh_ha_year',
	'minutes':                    'right_panel.data.descriptions.raster.minutes',
	'hours':                      'right_panel.data.descriptions.raster.hours',
	'hours/hh.day':               'right_panel.data.descriptions.raster.hours_hh_day',
	'm/s':                        'right_panel.data.descriptions.raster.m_s',
	'degree':                     'right_panel.data.descriptions.raster.degree',
	'degree celcius':             'right_panel.data.descriptions.raster.degree_celcius',
	'mm':                         'right_panel.data.descriptions.raster.mm',
	'm³/yr':                      'right_panel.data.descriptions.raster.m3yr',
	'metre':                      'right_panel.data.descriptions.raster.metre',
	'kg/ha':                      'right_panel.data.descriptions.raster.kg_ha',
	'Metric Tonnes':              'right_panel.data.descriptions.raster.metric_tonnes',
	'Gigajoule per sq km':        'right_panel.data.descriptions.raster.gigajoule',
	'USD':                        'right_panel.data.descriptions.raster.usd',
	'USD/household':              'right_panel.data.descriptions.raster.usd_household',
	'bldgs/km²':                  'right_panel.data.descriptions.raster.bldgs_km2',
	'tCO2eq':                     'right_panel.data.descriptions.raster.tco2eq',
	'tier':                       'right_panel.data.descriptions.raster.tier',
	'year':                       'right_panel.data.descriptions.raster.year',
	'< 2USD/day':                 'right_panel.data.descriptions.raster.lt2usd',
	'RWI':                        'right_panel.data.descriptions.raster.rwi',
	'Aridity Index':              'right_panel.data.descriptions.raster.aridity',
	'calibrated radiance':        'right_panel.data.descriptions.raster.nighttime',
	'People per 100k population': 'right_panel.data.descriptions.raster.per100k',
};

// Exported for report.js (the PowerPoint export), which is written against
// the pre-refactor right-panel-data-tab.js API and shares this formatting.
export function describe(datatype: string | undefined, unit: string | undefined, name: string, value: string | number, aggregation: string | null | undefined): string {
	const locale = window.LOCALE;
	const vars = { "name": name.toLowerCase(), value };

	if (datatype === 'points') {
		const key = (unit && POINTS_KEYS[unit]) ?? POINTS_KEYS['count'];
		return t(locale, key, vars);
	}

	if (datatype === 'lines')
		return t(locale, 'right_panel.data.descriptions.lines', vars);

	if (datatype?.startsWith('raster')) {
		const key = (aggregation === 'SUM' && unit ? RASTER_SUM_KEYS[unit] : null)
			?? (unit ? RASTER_KEYS[unit] : null)
			?? (aggregation === 'SUM' ? 'right_panel.data.descriptions.raster_sum.default' : 'right_panel.data.descriptions.raster.default');
		return t(locale, key, vars);
	}

	if (datatype?.startsWith('polygons')) {
		const key = unit
			? 'right_panel.data.descriptions.polygons_sum'
			: 'right_panel.data.descriptions.polygons_count';
		return t(locale, key, vars);
	}

	const key = (aggregation === 'SUM' && unit ? RASTER_SUM_KEYS[unit] : null)
		?? (unit ? RASTER_KEYS[unit] : null)
		?? (aggregation === 'SUM' ? 'right_panel.data.descriptions.raster_sum.default' : 'right_panel.data.descriptions.raster.default');
	return t(locale, key, vars);
}

// Module-level caches (kept out of the atom for now). geoDist memoises
// categorical distributions per dataset+admin; nationalLayerData memoises
// the whole-outline aggregation.
const cache = {
	"geoDist":            new Map<string, DistributionSlice[]>(),
	"nationalLayerData": null as AggregatedLayerData | null,
};

function countPixels(rasterData: ArrayLike<number>, nodata: number, maskData: ArrayLike<number>, maskNodata: number, maskId: number | undefined, counts: Map<number, number>): number {
	let total = 0;
	for (let i = 0; i < rasterData.length; i++) {
		const mv = maskData[i];
		if (mv === maskNodata || (maskId !== undefined && mv !== maskId)) continue;
		const pv = rasterData[i];
		if (pv === undefined || pv === nodata) continue;
		if (counts.has(pv)) { counts.set(pv, (counts.get(pv) ?? 0) + 1); total++; }
	}
	return total;
}

function computeDistribution(ds: LegacyDataset, adminInfo: AdminRef | null): DistributionSlice[] | null {
	const csv = ds.csv;
	const colorFn = ds.colorscale?.fn;
	if (!csv?.data || !csv.key || !csv.column || !colorFn || !ds.raster) return null;

	const cacheKey = adminInfo ? `${ds.id}:${adminInfo.id}` : ds.id;
	const hit = cache.geoDist.get(cacheKey);
	if (hit) return hit;

	const key = csv.key;
	const column = csv.column;
	const categories = csv.data.map(x => ({
		"value": Number(x[key]),
		"name":  String(x[column]),
		"color": `rgba(${colorFn(Number(x[key]))})`,
	}));

	let maskData: ArrayLike<number>;
	let maskNodata: number;
	let maskId: number | undefined;

	if (adminInfo) {
		const div = GEOGRAPHY.divisions?.[adminInfo.variant];
		if (!div?.raster?.data) return null;
		maskData   = div.raster.data;
		maskNodata = div.raster.nodata;
		maskId     = adminInfo.id;
	} else {
		const outline = OUTLINE?.raster;
		if (!outline?.data) return null;
		maskData   = outline.data;
		maskNodata = outline.nodata;
	}

	const counts = new Map(categories.map(c => [c.value, 0]));
	const total  = countPixels(ds.raster.data, ds.raster.nodata, maskData, maskNodata, maskId, counts);
	if (total === 0) return null;

	const result = categories
		.map(c => ({ ...c, "percentage": (counts.get(c.value) ?? 0) / total * 100 }))
		.filter(c => c.percentage > 0);

	cache.geoDist.set(cacheKey, result);
	return result;
}

function makeDonutChart(distribution: DistributionSlice[], activeName: string | null): HTMLElement {
	const wrap = ce('div', null, { "class": 'data-card-donut' });

	const legend = ce('div', null, { "class": 'data-card-donut-legend' });
	for (const c of distribution) {
		const active = activeName && c.name === activeName;
		const item   = ce('div', null, { "class": `data-card-legend-item${active ? ' active' : ''}` });
		const dot    = ce('span', null, { "class": 'data-card-legend-dot' });
		dot.style.background = c.color;
		const name   = ce('span', c.name, { "class": 'data-card-legend-name' });
		item.append(dot, name);
		legend.append(item);
	}

	const bubble = (v: number, e: HTMLElement) => new bubblemessage({ "message": v + "%", "position": "C", "close": false, "noevents": true }, e);

	const chart = svg_pie(
		distribution.map(c => [c.percentage]),
		66,
		33,
		distribution.map(c => c.color),
		(x: number) => x.toFixed(2),
		bubble,
	);

	wrap.append(legend, chart.svg);
	return wrap;
}

function makeBarChart(distribution: DistributionSlice[], activeName: string | null): HTMLElement {
	const sorted  = [...distribution].sort((a, b) => b.percentage - a.percentage);
	const maxPct = sorted[0]?.percentage || 1;

	const wrap = ce('div', null, { "class": 'data-card-bars' });
	for (const c of sorted) {
		const active  = activeName && c.name === activeName;
		const row     = ce('div', null, { "class": `data-card-bar-row${active ? ' active' : ''}` });
		const content = ce('div', null, { "class": 'data-card-bar-content' });
		const copy    = ce('div', null, { "class": 'data-card-bar-copy' });
		const label   = ce('span', c.name, { "class": 'data-card-bar-label' });
		const value   = ce('span', `${c.percentage.toFixed(1)}%`, { "class": 'data-card-bar-value' });
		copy.append(label, value);

		const track = ce('div', null, { "class": 'data-card-bar-track' });
		const fill  = ce('div', null, { "class": 'data-card-bar-fill' });
		fill.style.width = `${(c.percentage / maxPct) * 100}%`;
		track.append(fill);

		content.append(copy, track);
		row.append(content);
		wrap.append(row);
	}
	return wrap;
}

function makeCard(ds: LegacyDataset, entry: LayerEntry, adminInfo: AdminRef | null): HTMLElement {
	const card = ce('div', null, { "class": 'data-card' });

	const header = ce('div', null, { "class": 'data-card-header' });
	const path0  = ds.category?.controls?.path?.[0];
	const tabEl = path0 && !STANDARD_TABS.has(path0) ? qs('#controls-tab-' + path0) : null;
	const tabLabel = tabEl?.textContent?.trim();
	const title     = ce('span', tabLabel ? `${tabLabel} - ${translateDatasetName(window.LOCALE, ds)}` : translateDatasetName(window.LOCALE, ds), { "class": 'data-card-title' });
	const about  = ce('button', null, { "class": 'button-icon button-info button-about' });
	about.innerHTML = `<span>${t(window.LOCALE, 'left_panel.cards.card.about_button')}</span><i class="bi bi-info-circle"></i>`;
	header.append(title, about);

	const body = ce('div', null, { "class": 'data-card-body' });

	const isCategorical = ds.type === 'raster-valued' || ds.type === 'raster-valued-mutant';
	if (isCategorical) {
		const distribution = computeDistribution(ds, adminInfo);
		if (distribution) {
			const n           = ds.csv?.data?.length ?? 0;
			const activeName = typeof entry.rawValue === 'string' ? entry.rawValue : null;
			const distDesc = ce('p', null, { "class": 'data-card-description' });
			distDesc.innerHTML = t(window.LOCALE, 'right_panel.data.categorical_desc', { "name": translateDatasetName(window.LOCALE, ds) });
			body.append(distDesc, n <= 5
				? makeDonutChart(distribution, activeName)
				: makeBarChart(distribution, activeName));
			about.onclick = () => ds.info_modal();
			card.append(header, body);
			return card;
		}
	}

	const desc = ce('p', null, { "class": 'data-card-description' });
	if (entry.value != null) {
		desc.innerHTML = describe(ds.category?.datatype, entry.unit || ds.category?.unit, translateDatasetName(window.LOCALE, ds), entry.value, entry.aggregation ?? ds.category?.analysis?.aggregation);
	} else {
		desc.innerHTML = t(window.LOCALE, 'right_panel.data.no_data', { "name": translateDatasetName(window.LOCALE, ds) });
	}
	body.append(desc);

	about.onclick = () => ds.info_modal();

	card.append(header, body);

	return card;
}

function rebindBlank(): void {
	const blank = qs('#data-blank-state');
	if (!blank) return;

	bind(blank, {
		"title":    t(window.LOCALE, 'right_panel.prioritization.blank_state.title'),
		"subtitle": t(window.LOCALE, 'right_panel.prioritization.blank_state.subtitle'),
	}, { "final": false });
}

function setBlankState(visible: boolean): void {
	const blank = qs('#data-blank-state');
	if (!blank) return;

	if (visible) rebindBlank();

	blank.style.display = visible ? 'flex' : 'none';
}

function activeDatasets(): LegacyDataset[] {
	return (STATE.datasets as LegacyDataset[]).filter(
		ds => ds.on && ds.category?.name !== 'boundaries' && ds.category?.name !== 'outline',
	);
}

/**
 * Full-component re-render from the atom. Reproduces the legacy update()
 * flow: blank state wins whenever there are no active datasets (regardless
 * of view kind); a pending national view leaves an empty container while
 * the aggregates are computed.
 */
function render(state: DataState): void {
	const container = qs('#data-cards-container');
	if (!container) return;

	const cards = activeDatasets();
	const view = state.view;

	if (view.kind === 'blank' || cards.length === 0) {
		container.innerHTML = '';
		setBlankState(true);
		return;
	}

	if (view.kind === 'national' && view.entries === null) {
		container.innerHTML = '';
		return;
	}

	const entries = view.entries ?? [];
	const admin = view.kind === 'location'
		? resolveAdminInfo(view.admin, view.rasterIndex, STATE.variant, GEOGRAPHY.divisions?.[STATE.variant]?.raster)
		: null;
	const rasterIndex = view.kind === 'location' ? view.rasterIndex : null;

	const byLabel = indexEntries(entries);

	setBlankState(false);
	container.innerHTML = '';
	container.append(make_title(admin, rasterIndex));
	for (const ds of cards) {
		container.append(makeCard(ds, byLabel.get(ds.name) ?? { "label": ds.name, "value": null, "rawValue": null }, admin));
	}
}

/**
 * One formatted detail row for a layer aggregate. Mirrors the legacy
 * detailedData row shape (snake_case raw_value) and carries the extra id and
 * datatype fields report.js's data cards read.
 */
interface DetailedRow {
	readonly id: string;
	readonly label: string;
	readonly value: string;
	readonly raw_value: string | number;
	readonly unit: string;
	readonly datatype: string | undefined;
	readonly aggregation: string | null;
}

/**
 * Formatted detail rows for a layer-data map, without touching the DOM or
 * the atom. Shared by the national service below and, as a compatibility
 * export, by report.js.
 */
export function build_detailed_data(layerData: AggregatedLayerData): DetailedRow[] {
	const rows: DetailedRow[] = [];
	for (const [id, layer] of Object.entries(layerData)) {
		const areaResult = layer.areas?.[0]?.result;
		if (!areaResult) continue;

		let value: number | string;
		let unit: string;
		if (areaResult.type === 'points') {
			value = areaResult.value;
			unit = 'count';
		} else {
			const n = Number(areaResult.value);
			value = layer.aggregation === 'SUM'
				? Math.round(n)
				: parseFloat(n.toFixed(2));
			unit = resolve_unit(layer, DST.get(id), value);
		}

		const num = Number(value);
		const formatted = Number.isFinite(num) ? num.toLocaleString(window.LOCALE) : String(value);
		const displayUnit: string = unit === 'count' ? '' : translateUnit(window.LOCALE, unit);
		const datatype = (DST.get(id) as { readonly category?: { readonly datatype?: string } } | undefined)?.category?.datatype;

		rows.push({
			"id":          id,
			"label":       layer.name,
			"value":       format_value_unit(formatted, displayUnit),
			"raw_value":   value,
			"unit":        unit,
			"datatype":    datatype,
			"aggregation": layer.aggregation ?? null,
		});
	}

	return rows;
}

/**
 * Compatibility export for report.js, which imports the legacy snake_case
 * name from the pre-refactor module.
 */
export function compute_distribution(ds: LegacyDataset, adminInfo: AdminRef | null): DistributionSlice[] | null {
	return computeDistribution(ds, adminInfo);
}

/**
 * Legacy update_top_level_geography(), minus the DOM: prefers the
 * analysis-clipped aggregates from the last analysis run, falls back to the
 * whole-outline aggregation (cached per recompute cycle).
 */
async function buildNationalEntries(): Promise<LayerEntry[] | null> {
	let layerData: AggregatedLayerData | null = cell().state.analysisLayerData ?? cache.nationalLayerData;

	if (!layerData) {
		const outline = OUTLINE?.raster;
		if (!outline?.data) return null;
		const nationalRaster = Array.from(outline.data, v => (v === outline.nodata ? -1 : 0));
		layerData = cache.nationalLayerData = await aggregate_layer_values({ "raster": { "data": nationalRaster } });
	}

	if (!layerData) return null;

	return toLayerEntries(build_detailed_data(layerData));
}

/**
 * National-overview service: runs when the view is national-and-pending.
 * Resets both caches first (legacy clear() semantics), then computes and
 * dispatches. If the view moved on while awaiting (user opened a map-info,
 * another backToNational landed), the captured view object no longer
 * matches and the result is dropped.
 */
async function computeNational(): Promise<void> {
	const pending = cell().state.view;
	if (pending.kind !== 'national' || pending.entries !== null) return;

	cache.geoDist.clear();
	cache.nationalLayerData = null;

	const entries = activeDatasets().length ? await buildNationalEntries() : null;

	const c = cell();
	if (c.state.view !== pending) return;
	actions.nationalComputed(c, entries ?? []);
}

export function init(): void {
	actions.enterBlank(cell());
}

subscribe(s => {
	render(s);
	if (s.view.kind === 'national' && s.view.entries === null) void computeNational();
});

// Legacy i18n bridge: on locale switch, rebind the blank state if it is
// showing; otherwise rebuild the national overview (legacy behaviour
// replaced the location cards with the national overview too — kept).
registerUIUpdater(() => {
	const blank = qs('#data-blank-state');
	if (blank && blank.style.display !== 'none') { rebindBlank(); return; }

	actions.backToNational(cell());
});
