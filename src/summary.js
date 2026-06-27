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
} from './utils.js';

import {
	outputcanvas as plot_outputcanvas,
} from './plot.js';

import {
	ce,
	qs,
} from '../lib/helpers.js';

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

		const ppie = svg_pie(SUMMARY[idxn]['population-density']['distribution'].map(x => [x]), 75, 0, analysis_colorscale.stops, null, bubble);
		const apie = svg_pie(SUMMARY[idxn]['area']['distribution'].map(x => [x]), 75, 0, analysis_colorscale.stops, null, bubble);

		ppie.change(0);
		apie.change(0);

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

	const population_groups = [0, 0, 0, 0, 0];
	const area_groups = [0, 0, 0, 0, 0];
	let covered = 0;

	for (let i = 0; i < a.length; i += 1) {
		const x = a[i];
		const v = p[i];
		let t = 0;

		if (v == nodata) continue;

		if (x >= 0   && x < 0.2) t = 0;
		else if (x >= 0.2 && x < 0.4) t = 1;
		else if (x >= 0.4 && x < 0.6) t = 2;
		else if (x >= 0.6 && x < 0.8) t = 3;
		else if (x >= 0.8 && x <= 1)  t = 4;

		if (x !== -1) {
			covered += 1;
			area_groups[t] += 1;
			population_groups[t] += v;
		}
	}

	const c = OUTLINE.raster.data.filter(x => x !== OUTLINE.raster.nodata).length;

	const raw_ptotal = population_groups.reduce((a,b) => a + b, 0);
	const atotal = area_groups.reduce((a,b) => a + b, 0);

	// Get the correct population total from layer_data aggregated over analysis-valid pixels
	// (unscaled raster via aggregate_layer_values, avoids overcounting from oversampled display raster).
	// When layer_data is not provided (e.g. PPTX summary data), compute it now from the analysis mask.
	// Distribution proportions from the display raster above are still correct (overcounting cancels).
	if (!layer_data) {
		const mask = { "raster": { "data": raster.map(v => v === -1 ? -1 : 0) } };
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

