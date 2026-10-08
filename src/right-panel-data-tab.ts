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
	activeDatasets,
} from './right-panel-shared.ts';

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
	LegacyDataset,
} from './right-panel-shared.ts';

import type {
	AggregatedLayer,
	AggregatedLayerData,
	DataState,
	LayerEntry,
} from './right-panel-data-state.ts';

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

/**
 * Which kind of statistic a card sentence describes. It decides the wording
 * of the whole-geography clause appended to that sentence (EAE-514):
 *   - 'total'   a sum over the area → compare with the geography's total;
 *   - 'average' a mean over the area's cells → with the geography's mean;
 *   - 'share'   a percentage/rate of the area → with the geography's;
 *   - 'none'    no meaningful whole-geography counterpart (a nearest
 *               distance), so no clause is ever appended.
 */
export type DescriptionFamily = 'total' | 'average' | 'share' | 'none';

// Percentages and rates: the second figure is neither a total nor an average,
// so the shared wording says neither.
const SHARE_KEYS = new Set([
	'right_panel.data.descriptions.raster.pct',
	'right_panel.data.descriptions.raster.coverage_pct',
	'right_panel.data.descriptions.raster.lt2usd',
	'right_panel.data.descriptions.raster.per100k',
]);

/**
 * The i18n key for a card sentence and the family it belongs to. One source
 * of truth: describe() only renders the key, and the whole-geography clause
 * derives its wording from the same family, so a unit added to one of the
 * tables below picks up both automatically.
 */
export function describe_spec(datatype: string | undefined, unit: string | undefined, aggregation: string | null | undefined): { readonly key: string; readonly family: DescriptionFamily } {
	if (datatype === 'points') {
		const key = (unit ? POINTS_KEYS[unit] : undefined) ?? 'right_panel.data.descriptions.points.count';

		// "The nearest <name> is <value> from the analysed area": a minimum,
		// not an aggregate — the whole geography has no counterpart figure.
		return { key, "family": key === 'right_panel.data.descriptions.points.distance' ? 'none' : 'total' };
	}

	if (datatype === 'lines')
		return { "key": 'right_panel.data.descriptions.lines', "family": 'total' };

	if (datatype?.startsWith('polygons')) {
		// A plain count of polygons in the area; polygon layers carry no raster
		// band, so aggregate_layer_values has nothing to total over the outline.
		return unit
			? { "key": 'right_panel.data.descriptions.polygons_sum', "family": 'total' }
			: { "key": 'right_panel.data.descriptions.polygons_count', "family": 'none' };
	}

	// raster-* datasets and the untyped fallback share the raster tables.
	const sum_key = (aggregation === 'SUM' && unit) ? RASTER_SUM_KEYS[unit] : null;
	if (sum_key) return { "key": sum_key, "family": 'total' };

	const raster_key = unit ? RASTER_KEYS[unit] : null;
	if (raster_key) return { "key": raster_key, "family": SHARE_KEYS.has(raster_key) ? 'share' : 'average' };

	return aggregation === 'SUM'
		? { "key": 'right_panel.data.descriptions.raster_sum.default', "family": 'total' }
		: { "key": 'right_panel.data.descriptions.raster.default', "family": 'average' };
}

// Exported for report.js (the PowerPoint export), which is written against
// the pre-refactor right-panel-data-tab.js API and shares this formatting.
//
// A `total` turns the sentence into the ticket's single sentence (EAE-514):
// the sentence's own full stop is replaced by the clause's leading comma, so
// "... in the analysed area is <strong>729 tons</strong>, out of a total of
// <strong>2,087,149 tons</strong> for Uganda as a whole." zh ends sentences
// with '。' instead of '.', hence the two-way strip. Callers that pass no
// total (the deck) get the sentence unchanged.
export function describe(datatype: string | undefined, unit: string | undefined, name: string, value: string | number, aggregation: string | null | undefined, total: string | null = null): string {
	const sentence = t(window.LOCALE, describe_spec(datatype, unit, aggregation).key, { "name": name.toLowerCase(), value });
	const clause = total_clause(datatype, unit, aggregation, value, total);

	return clause ? sentence.replace(/[.。]\s*$/, '') + clause : sentence;
}

const TOTAL_CLAUSE_KEYS: Record<Exclude<DescriptionFamily, 'none'>, string> = {
	"total":   'right_panel.data.descriptions.total_out_of',
	"average": 'right_panel.data.descriptions.average_vs',
	"share":   'right_panel.data.descriptions.share_vs',
};

/**
 * The whole-geography clause appended to a card sentence (EAE-514), or ''.
 *
 * Dropped when there is no counterpart figure, and when it is the same number
 * as the analysed-area one — then the two scopes hold the same figure and the
 * card would only repeat itself.
 *
 * Whether a counterpart figure is offered at all is the producer's call: see
 * buildNationalEntries() (a single layer's slice IS the geography's figure as
 * far as the reader is concerned) and build_detailed_data().
 *
 * The geography is named because the analysed-area figure alone reads as a
 * property of that area ("The Relative Wealth Index for the analysed area is
 * -0.23") rather than as the mean of the cells inside it, and a reader cannot
 * tell which scope produced it (EAE-514).
 */
function total_clause(datatype: string | undefined, unit: string | undefined, aggregation: string | null | undefined, value: string | number | null, total: string | null | undefined): string {
	if (total == null || value == null || total === value) return '';

	const { family } = describe_spec(datatype, unit, aggregation);
	if (family === 'none') return '';

	return t(window.LOCALE, TOTAL_CLAUSE_KEYS[family], { total, "geography": GEOGRAPHY.name });
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
	const name = translateDatasetName(window.LOCALE, ds);

	const header = ce('div', null, { "class": 'data-card-header' });
	const path0  = ds.category?.controls?.path?.[0];
	const tabEl = path0 && !STANDARD_TABS.has(path0) ? qs('#controls-tab-' + path0) : null;
	const tabLabel = tabEl?.textContent?.trim();
	const title     = ce('span', tabLabel ? `${tabLabel} - ${name}` : name, { "class": 'data-card-title' });
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
			distDesc.innerHTML = t(window.LOCALE, 'right_panel.data.categorical_desc', { "name": name });
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
		// ds.category's unit/aggregation are the fallbacks for entries that do
		// not carry their own (the location view's). entry.total is the
		// whole-geography figure, and only the national view has one.
		desc.innerHTML = describe(
			ds.category?.datatype,
			entry.unit || ds.category?.unit,
			name,
			entry.value,
			entry.aggregation ?? ds.category?.analysis?.aggregation,
			entry.total ?? null,
		);
	} else {
		desc.innerHTML = t(window.LOCALE, 'right_panel.data.no_data', { "name": name });
	}
	body.append(desc);

	about.onclick = () => ds.info_modal();

	card.append(header, body);

	return card;
}

// Blank state retranslates itself on locale switch (data-t attributes,
// see views/a.tmpl) — the view only toggles visibility.
function setBlankState(visible: boolean): void {
	const blank = qs('#data-blank-state');
	if (!blank) return;

	blank.style.display = visible ? 'flex' : 'none';
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
	/** Whole-geography counterpart, formatted with the same unit; absent when
	 * the caller has none to offer. */
	readonly total?: string;
	readonly unit: string;
	readonly datatype: string | undefined;
	readonly aggregation: string | null;
}

/**
 * One layer aggregate as the cards format it: SUM rounds to whole units and
 * everything else keeps two decimals, and the unit resolves from the layer or
 * its dataset. Shared by the analysed-area rows and their whole-geography
 * counterparts so both sides round and label identically.
 */
function aggregate_display(layer: AggregatedLayer, id: string): { readonly value: number | string; readonly unit: string; readonly display: string } | null {
	const areaResult = layer.areas?.[0]?.result;
	if (!areaResult) return null;

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

	return { value, unit, "display": format_value_unit(formatted, displayUnit) };
}

/**
 * Formatted detail rows for a layer-data map, without touching the DOM or
 * the atom. Shared by the national service below and, as a compatibility
 * export, by report.js.
 *
 * `totals` supplies the same layers aggregated over the whole geography, which
 * each row carries as its `total` for the card sentence to compare against
 * (EAE-514). report.js calls this without totals, so its deck cards keep
 * showing a single figure.
 */
export function build_detailed_data(layerData: AggregatedLayerData, totals: AggregatedLayerData | null = null): DetailedRow[] {
	const rows: DetailedRow[] = [];
	for (const [id, layer] of Object.entries(layerData)) {
		const area = aggregate_display(layer, id);
		if (!area) continue;

		const wholeLayer = totals?.[id];
		const whole = wholeLayer ? aggregate_display(wholeLayer, id) : null;
		const datatype = (DST.get(id) as { readonly category?: { readonly datatype?: string } } | undefined)?.category?.datatype;

		rows.push({
			"id":          id,
			"label":       layer.name,
			"value":       area.display,
			"raw_value":   area.value,
			"unit":        area.unit,
			"datatype":    datatype,
			"aggregation": layer.aggregation ?? null,
			...(whole ? { "total": whole.display } : {}),
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
 * The whole-outline aggregation, cached for the recompute cycle. Only needed
 * before the first analysis run lands: afterwards the atom carries the
 * aggregates graphs() computed in the same pass as the summary.
 */
async function outlineLayerData(): Promise<AggregatedLayerData | null> {
	if (cache.nationalLayerData) return cache.nationalLayerData;

	const outline = OUTLINE?.raster;
	if (!outline?.data) return null;

	const nationalRaster = Array.from(outline.data, v => (v === outline.nodata ? -1 : 0));
	return (cache.nationalLayerData = await aggregate_layer_values({ "raster": { "data": nationalRaster } }));
}

/**
 * Legacy update_top_level_geography(), minus the DOM: prefers the
 * analysis-clipped aggregates from the last analysis run, falling back to the
 * whole-outline aggregation (cached per recompute cycle).
 *
 * Each entry also carries its whole-geography figure — but only when another
 * layer can have narrowed the analysis area, and only while the clipped
 * aggregates are the ones on screen. A single layer narrows the mask with the
 * analysis's own bottom band (the cells the index rescale leaves at 0, which
 * has_priority_score() drops), not with anything the ticket calls a constraint:
 * there the card shows one figure, which is what the ticket asks for (EAE-514).
 * The card drops the clause for equal figures on its own.
 */
async function buildNationalEntries(): Promise<LayerEntry[] | null> {
	const clipped = cell().state.analysisLayerData;
	const totals = cell().state.nationalLayerData ?? await outlineLayerData();

	const layerData = clipped ?? totals;
	if (!layerData) return null;

	const compared = clipped && activeDatasets().length > 1 ? totals : null;

	return toLayerEntries(build_detailed_data(layerData, compared));
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

// Legacy i18n bridge: on locale switch, rebuild the national overview
// (legacy behaviour replaced the location cards with the national overview
// too — kept). The blank state needs no updater: its data-t attributes are
// retranslated document-wide by translate.js.
registerUIUpdater(() => actions.backToNational(cell()));
