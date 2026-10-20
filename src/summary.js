import bubblemessage from '../lib/bubblemessage.js';

import {
	active_area_mask,
	aggregate_layer_values,
	analysis_cells,
	analysis_colorscale,
	analysis_result,
	lowmedhigh_scale,
} from './analysis.ts';

import {
	default_colorscale,
} from './ds.js';

import {
	svg_pie,
	svg_pie_labels,
} from './utils.js';

import {
	outputcanvas as plot_outputcanvas,
} from './plot.js';

import {
	ce,
	qs,
} from '../lib/helpers.js';

import { t, getScaleLabels } from './translate.js';

// The share cards cover the selected area, but the prioritization index only
// exists inside the analysis window — run() fills the raster with -1 everywhere
// else. Cells outside it cannot be placed in any of the five index buckets, so
// they get a sixth of their own; without it the card's rows would not sum to
// its total. Deliberately local to the share cards: the five-bucket
// analysis_colorscale still drives the map legend, the dataset cards and the
// plots, which have no notion of an unanalysed cell.
export const OUTSIDE_BUCKET = 5;
export const OUTSIDE_COLOR = '#cfcfcf';
const OUTSIDE_LABEL = 'right_panel.prioritization.graphs.outside_label';

export function share_scale_labels(locale) {
	return [...getScaleLabels(locale), t(locale, OUTSIDE_LABEL)];
}

export function share_scale_colors() {
	return [...analysis_colorscale.stops, OUTSIDE_COLOR];
}

// The legend's reading order: High down to Low, then the out-of-analysis residual.
export function share_scale_order() {
	return [...analysis_colorscale.stops.keys()].reverse().concat([OUTSIDE_BUCKET]);
}

// Index value -> bucket. x === -1 is "no analysis here", everything else maps to
// Low..High exactly as the five-colour scale does.
function bucket_index(x) {
	if (x === -1) return OUTSIDE_BUCKET;
	if (x >= 0   && x < 0.2) return 0;
	if (x >= 0.2 && x < 0.4) return 1;
	if (x >= 0.4 && x < 0.6) return 2;
	if (x >= 0.6 && x < 0.8) return 3;
	if (x >= 0.8 && x <= 1)  return 4;
	return OUTSIDE_BUCKET;
}

// The tier the summary's analysis results hang off (notes §4: keyed
// (index, tier, subdiv)). The natural key is the analysis level's own
// division — variant_raster() paints exactly those areas — while at the
// pixel level ('raster') there are no areas to paint and only the
// tier-independent national entry is read, which just needs some result to
// hang off: the first division carrying a raster stands in.
function summary_result_tier() {
	const divisions = GEOGRAPHY.divisions || [];
	const variant = STATE.variant;

	if (variant !== 'raster' && divisions[variant]?.raster?.data) return variant;

	for (let i = 0; i < divisions.length; i += 1)
		if (divisions[i]?.raster?.data) return i;

	return null;
}

// Paint the deck's per-index choropleth FROM the analysis result (EAE-521):
// this used to recompute the per-area averages and its
// own copy of the area scale over the raster. The result's
// bucket is that same one area scale's Low..High label, and the label's slot
// in lowmedhigh_scale.range() is the same quantile slot the old positional
// scale returned — slot / (n - 1) is exactly the position
// analysis_colorscale.stops.map((_, i) => i / (n - 1)) passed as its range,
// so every painted value is bit-identical to the legacy one.
function variant_raster(raster, result) {
	const division = (STATE.variant !== "raster") ? GEOGRAPHY.divisions[STATE.variant] : null;
	if (!division?.raster?.data) return raster;

	const areas = result.areas;
	const n = analysis_colorscale.stops.length;
	const range = lowmedhigh_scale.range();

	// The old area scale returned null exactly when no area carries a usable
	// average (every area in the record carries one — the fold averages
	// scored cells only), and then the raw raster was painted. No
	// bucket anywhere is the same case.
	let painted = false;
	for (const id in areas) {
		if (areas[id].bucket !== null) { painted = true; break; }
	}
	if (!painted) return raster;

	return Float32Array.from(raster, (_, i) => {
		const id = division.raster.data[i];
		const area = (id !== -1) ? areas[id] : null;

		if (area && area.bucket !== null) {
			return range.indexOf(area.bucket) / (n - 1);
		} else {
			return -1;
		}
	});
}

// The whole-geography aggregate (EAE-514): the analysis result's first-class
// national entry (notes §6.3) — { [dataset]: { type, value } }, aggregated
// over the full outline with no analysis mask. Right-panel.js computes the
// very same aggregate for the Data cards and still hands analyse() the
// legacy aggregate_layer_values shape ({ [dataset]: { areas: { 0: { result
// } } } }) while plan §5 step 4 migrates in parallel — both read here. The
// fake "area 0" mask this module used to build for itself is gone.
function national_value(national, dataset_id) {
	const entry = national?.values?.[dataset_id] ?? national?.[dataset_id];
	if (!entry) return null;

	return entry.value ?? entry.areas?.['0']?.result?.value ?? null;
}

export async function generate_summary_data() {
	const pop = DST.get('population-density');
	await pop.load('raster');

	SUMMARY = {};

	const bubble = (v,e) => new bubblemessage({ "message": v + "%", "position": "C", "close": false, "noevents": true }, e);

	// EAE-521: one memoised analysis result per index (plan §5 step 4)
	// replaces this loop's private analysis_run() call — the cells it paints
	// and stores, variant_raster()'s per-area scores and analyse()'s
	// whole-geography aggregate all come from the same request.
	const tier = summary_result_tier();

	async function get_summary(idxn) {
		// A geography without any division raster cannot publish a result at
		// all (the score phase aggregates per division area); fall back to the
		// memoised cells and no national entry (analyse() drops to its raw
		// display-raster total).
		const result = (tier === null) ? null : await analysis_result(idxn, tier);
		const raster = result ? result.cells : (await analysis_cells(idxn)).raster;

		SUMMARY[idxn] = await analyse(raster, result?.national.values ?? null);
		SUMMARY[idxn]['raw_raster'] = raster;

		const order = share_scale_order();
		const colors = share_scale_colors();

		const pshare = order.map(i => SUMMARY[idxn]['population-density']['distribution'][i]);
		const ashare = order.map(i => SUMMARY[idxn]['area']['distribution'][i]);

		const ppie = svg_pie(pshare.map(x => [x]), 75, 0, order.map(i => colors[i]), null, bubble);
		const apie = svg_pie(ashare.map(x => [x]), 75, 0, order.map(i => colors[i]), null, bubble);

		ppie.change(0);
		apie.change(0);

		svg_pie_labels(ppie.svg, pshare, 75);
		svg_pie_labels(apie.svg, ashare, 75);

		const c = qs('#canvas-' + idxn) || ce('canvas', null, { "id": 'canvas-' + idxn});
		c.style.display = 'none';
		document.body.append(c);

		plot_outputcanvas(variant_raster(raster, result), c);

		SUMMARY[idxn]['canvas'] = c;
		SUMMARY[idxn]['population-density']['pie'] = ppie;
		SUMMARY[idxn]['area']['pie'] = apie;
	}

	await Promise.all(Object.keys(EAE['indexes']).map(i => get_summary(i)));

	return SUMMARY;
}

export function compute_share_amounts(data) {
	const total = Math.round(data['total']);
	return {
		total,
		"amounts": data['distribution'].map(x => Math.round(x * total)),
	};
}

export default async function analyse(raster, national = null) {
	const pixels_per_km2 = (1000/GEOGRAPHY.resolution)**2;

	let ds = DST.get('population-density');

	if (!ds) {
		console.info("No 'population-density' dataset present... Will use boundaries");
		ds = OUTLINE;
	}

	await ds.load('raster');
	const p = ds.raster.data;
	const nodata = ds.raster.nodata;

	const a = new Float32Array(raster.length).fill(-1);

	const fn = d3.scaleQuantize()
		.domain([0,1])
		.range(default_colorscale.intervals);

	for (let i = 0; i < raster.length; i += 1) {
		const r = raster[i];
		a[i] = (r === -1) ? -1 : fn(r);
	}

	const population_groups = new Array(OUTSIDE_BUCKET + 1).fill(0);
	const area_groups = new Array(OUTSIDE_BUCKET + 1).fill(0);

	// Both cards are scoped to the selected area — the sub-geography picked in
	// "Change geography", or the whole geography when none is picked. That is the
	// same universe the Data-tab cards aggregate over, so their totals agree with
	// the cards. Every valid cell of it counts as area; only cells that carry
	// population data contribute people.
	const { "data": area_data, "nodata": area_nodata, "id": area_id } = active_area_mask();
	const in_area = i => area_data[i] !== area_nodata
		&& (area_id === undefined || area_data[i] === area_id);

	for (let i = 0; i < a.length; i += 1) {
		if (!in_area(i)) continue;

		const bucket = bucket_index(a[i]);
		area_groups[bucket] += 1;

		const v = p[i];
		if (v != nodata) population_groups[bucket] += v;
	}

	const covered = area_groups.reduce((x, y) => x + y, 0);

	const raw_ptotal = population_groups.reduce((a,b) => a + b, 0);
	const atotal = area_groups.reduce((a,b) => a + b, 0);

	// The population total is the unscaled aggregate over the same area the
	// counts above cover — not the display raster's sum, which is oversampled.
	// With no sub-geography selected that aggregate is the analysis result's
	// national entry (EAE-521; the pass this module used to make itself is
	// gone), and with one selected the national entry is the parent's, so the
	// area's own aggregate is computed instead.
	let ptotal;
	if (area_id === undefined) {
		ptotal = national_value(national, 'population-density') ?? raw_ptotal;
	} else {
		const mask = { "raster": { "data": Float32Array.from(a, (_, i) => in_area(i) ? 0 : -1) } };
		const area_layer_data = await aggregate_layer_values(mask);
		ptotal = area_layer_data?.['population-density']?.areas?.[0]?.result?.value ?? raw_ptotal;
	}

	const s = STATE.divtier ?
		x => x / pixels_per_km2 :
		d3.scaleLinear()
			.domain([0, covered])
			.range([0, (GEOGRAPHY.area || covered/pixels_per_km2)])
			.clamp(true);

	const o = {};
	if (ds.id === 'population-density')
		o['population-density'] = {
			"total":        ptotal,
			"amounts":      population_groups,
			"distribution": population_groups.reduce((a,b) => { a.push(b/raw_ptotal); return a; }, []),
		};

	o['area'] = {
		"total":        s(covered),
		"amounts":      area_groups.map(x => s(x)),
		"distribution": area_groups.reduce((a,b) => { a.push(b/atotal); return a; }, []),
	};

	o['raster'] = a;

	return o;
};

