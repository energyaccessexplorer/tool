import bubblemessage from '../lib/bubblemessage.js';

import analysis_run, {
	analysis_colorscale,
	division_averages,
	priority_scale,
	aggregate_layer_values,
} from './analysis.js';

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

// The share cards cover the whole geography, but the prioritization index only
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

function variant_raster(raster) {
	const division = (STATE.variant !== "raster") ? GEOGRAPHY.divisions[STATE.variant] : null;
	const areas = division?.raster?.data ? division_averages(raster, division.raster.data) : null;
	const n = analysis_colorscale.stops.length;
	const scale = areas ? priority_scale(areas, analysis_colorscale.stops.map((_, i) => i / (n - 1))) : null;

	if (scale) {
		return Float32Array.from(raster, (_, i) => {
			const id = division.raster.data[i];
			if (id !== -1 && id in areas) {
				return scale(areas[id].average);
			} else {
				return -1;
			}
		});
	} else {
		return raster;
	}
}

export async function generate_summary_data() {
	const pop = DST.get('population-density');
	await pop.load('raster');

	SUMMARY = {};

	const bubble = (v,e) => new bubblemessage({ "message": v + "%", "position": "C", "close": false, "noevents": true }, e);

	async function get_summary(idxn) {
		const raster = (await analysis_run(idxn)).raster;

		SUMMARY[idxn] = await analyse(raster);
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

		plot_outputcanvas(variant_raster(raster), c);

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

export default async function analyse(raster, layer_data = null) {
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

	// Both cards are scoped to the whole geography, the same universe the
	// Data-tab cards aggregate over, so their totals agree with the cards. Every
	// valid outline cell counts as area; only cells that carry population data
	// contribute people.
	const outline = OUTLINE.raster.data;
	const onodata = OUTLINE.raster.nodata;

	for (let i = 0; i < a.length; i += 1) {
		if (outline[i] === onodata) continue;

		const bucket = bucket_index(a[i]);
		area_groups[bucket] += 1;

		const v = p[i];
		if (v != nodata) population_groups[bucket] += v;
	}

	const covered = area_groups.reduce((x, y) => x + y, 0);

	const c = OUTLINE.raster.data.filter(x => x !== OUTLINE.raster.nodata).length;

	const raw_ptotal = population_groups.reduce((a,b) => a + b, 0);
	const atotal = area_groups.reduce((a,b) => a + b, 0);

	// Get the correct population total from layer_data aggregated over the same
	// whole-geography mask the cards use (unscaled raster via
	// aggregate_layer_values, avoids overcounting from the oversampled display
	// raster). When layer_data is not provided (e.g. PPTX summary data), compute
	// it now. Distribution proportions from the display raster above are still
	// correct (overcounting cancels).
	if (!layer_data) {
		const mask = { "raster": { "data": outline.map(v => v === onodata ? -1 : 0) } };
		layer_data = await aggregate_layer_values(mask);
	}
	const pop_result = layer_data?.['population-density']?.areas?.[0]?.result;
	const ptotal = pop_result?.value ?? raw_ptotal;

	const s = STATE.divtier ?
		x => x / pixels_per_km2 :
		d3.scaleLinear()
			.domain([0, c])
			.range([0, (GEOGRAPHY.area || c/pixels_per_km2)])
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

