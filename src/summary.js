import bubblemessage from '../lib/bubblemessage.js';

import {
	active_area_mask,
	aggregate_layer_values,
	analysis_cells,
	analysis_colorscale,
	analysis_result,
} from './analysis.ts';

import {
	score_bucket,
} from './area-scores.ts';

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

// The tier the summary's analysis results hang off: the analysis level's own
// division, which variant_raster() paints, or at the pixel level any division
// that carries a raster, since only the tier-independent national entry is read.
function summary_result_tier() {
	const divisions = GEOGRAPHY.divisions || [];
	const variant = STATE.variant;

	if (variant !== 'raster' && divisions[variant]?.raster?.data) return variant;

	for (let i = 0; i < divisions.length; i += 1)
		if (divisions[i]?.raster?.data) return i;

	return null;
}

// Paint each area at its bucket's stop on the continuous analysis ramp
// (bucket.index / (n - 1)), so the deck uses the map fills' colours.
function variant_raster(raster, result) {
	const division = (STATE.variant !== "raster") ? GEOGRAPHY.divisions[STATE.variant] : null;
	if (!division?.raster?.data) return raster;

	const areas = result.areas;
	const n = analysis_colorscale.stops.length;

	// No bucket anywhere (no scored areas): paint the raw raster unchanged.
	let painted = false;
	for (const id in areas) {
		if (areas[id].bucket !== null) { painted = true; break; }
	}
	if (!painted) return raster;

	return Float32Array.from(raster, (_, i) => {
		const id = division.raster.data[i];
		const area = (id !== -1) ? areas[id] : null;

		if (area && area.bucket !== null) {
			return area.bucket.index / (n - 1);
		} else {
			return -1;
		}
	});
}

// The analysis result's whole-geography national entry, or the
// AggregatedLayerData shape ({ [dataset]: { areas: { 0: { result } } } }) that
// other callers pass.
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

	// One memoised analysis result per index supplies the cells, the per-area
	// scores variant_raster() paints and analyse()'s whole-geography aggregate.
	const tier = summary_result_tier();

	async function get_summary(idxn) {
		// A geography with no division raster cannot publish a result (scores
		// aggregate per division area): fall back to the cells, no national entry.
		const result = (tier === null) ? null : await analysis_result(idxn, tier);
		const raster = result ? result.cells : (await analysis_cells(idxn)).raster;

		SUMMARY[idxn] = await analyse(raster, result?.national.values ?? null);
		SUMMARY[idxn]['raw_raster'] = raster;

		const ppie = svg_pie(SUMMARY[idxn]['population-density']['distribution'].map(x => [x]), 75, 0, share_scale_colors(), null, bubble);
		const apie = svg_pie(SUMMARY[idxn]['area']['distribution'].map(x => [x]), 75, 0, share_scale_colors(), null, bubble);

		ppie.change(0);
		apie.change(0);

		svg_pie_labels(ppie.svg, SUMMARY[idxn]['population-density']['distribution'], 75);
		svg_pie_labels(apie.svg, SUMMARY[idxn]['area']['distribution'], 75);

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

		// One scale for every card (area-scores.ts score_bucket); a cell with
		// no analysis value falls outside every bucket.
		const b = score_bucket(raster[i]);
		const bucket = b ? b.index : OUTSIDE_BUCKET;

		area_groups[bucket] += 1;

		const v = p[i];
		if (v != nodata) population_groups[bucket] += v;
	}

	const covered = area_groups.reduce((x, y) => x + y, 0);

	const raw_ptotal = population_groups.reduce((a,b) => a + b, 0);
	const atotal = area_groups.reduce((a,b) => a + b, 0);

	// The population total is the unscaled aggregate over the same area the
	// counts cover — never the oversampled display raster, nor the parent's
	// national entry for a sub-geography.
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

