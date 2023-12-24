import DS from './ds.js';

import {
	outputcanvas as plot_outputcanvas,
} from './plot.js';

import {
	graphs as indexes_graphs,
	updated_plot as indexes_updated_plot,
} from './indexes.js';

const filter_types = ["key-delta", "exclusion-buffer", "inclusion-buffer"];

const inclusion_filters = ["key-delta", "inclusion-buffer"];

/*
 * run
 *
 * @param "type" string. That can be one of:
 *   - ID of a dataset
 *   - index name
 *
 * returns an object {min, max, raster (FloatArray)}
 */

export default async function run(type) {
	const t0 = performance.now();

	const list = datasets(type);

	const it = new Float32Array(OUTLINE.raster.data.length).fill(-1);

	const dt = U.divtier;
	let divraster;
	if (dt > 0)
		divraster = maybe(GEOGRAPHY.divisions, dt, 'raster');

	// There's nothing interesting about an analysis with only filters. Also,
	// filters return 1 so a silly (single-valued) analysis would be plotted.
	//
	if (list.every(d => filter_types.includes(d.analysis_scale(type)))) return { "raster": it };

	// Add up how much non-compound indexes datasets will account for. Then, just
	// below, these values will be split into equal proportions of the total
	// analysis.
	//
	const singles = {};
	for (let i in ea_indexes) {
		const compound = ea_indexes[i].compound;
		if (compound.length < 2) singles[i] = 0;
	}

	const tots = list.reduce((a,d) => {
		if (filter_types.indexOf(d.analysis_scale(type)) > -1) ;
		else if (d.index) a[d.index] += d.weight;

		return a;
	}, singles);

	for (let s in singles) if (singles[s] === 0) delete singles[s];

	const weights = {};
	list.forEach(d => {
		if (filter_types.indexOf(d.analysis_scale(type)) > -1) weights[d.id] = 0;
		else {
			switch (type) {
			case "ani": {
				weights[d.id] = d.index ? d.weight / Object.keys(tots).reduce((a,c) => tots[c] + a, 0) : 0;
				break;
			}

			default: {
				weights[d.id] = d.index ? d.weight / (tots[d.index] * Object.keys(singles).length) : 0;
				break;
			}
			}
		}
	});

	// If the total weight is 0, ciao.
	//
	if (Object.keys(weights).reduce((a,c) => (weights[c] || 0) + a, 0) === 0)
		return { "raster": it };

	// Each dataset has a different scaling function. We cache these to optimise
	// the huge loop we are about to do.
	//
	const afns = list.map(d => d._afn(type));

	// The values will be normalised. Initialise the values:
	//
	let min = 1;
	let max = 0;

	let avg_sum = 0;
	let avg_count = 0;

	// NOTICE: if there is only one dataset which has no weight in calculations
	// (boundaries with key-delta scale function, for example), we do NOT want an
	// fully black raster to show as the result. We return the transparent raster.
	// instead.
	//
	const full_weight = list
		.reduce((a,c) => ((c.analysis_scale(type) === "key-delta") ? a : c.weight + a), 0);

	if (list.find(l => !maybe(l, 'raster', 'data')))
		await until((_ => list.filter(d => and(d.on, d.raster, d.analysis, !d.raster.data)).length === 0), Infinity);

	if (list.length === 1 && full_weight === 0) return { "raster": it };

	const sd = U.subdiv;
	const subdiv = and(typeof sd === 'number', divraster);

	for (let i = 0; i < it.length; i += 1) {
		let a = 0;

		if (subdiv && divraster.data[i] !== sd) a = -1;

		for (let j = 0; j < list.length; j += 1) {
			let c = list[j];

			// For the rest of the datasets, we 'annihilate' points that are already
			// as -1 (or nodata) since we wouldn't know what value to assign for the
			// analysis. In other words, if a dataset has a point has nodata, that
			// point is useless for the analysis as it is incomparable with other
			// datasets.
			//
			// We assume they have been clipped out.
			//
			if (a === -1) continue;

			const v = c.raster.data[i];
			if (v === c.raster.nodata) {
				a = -1; continue;
			}

			const sv = afns[j](v);

			// Three options: within domain/range, clipping or clamping. This is where
			// the clipping happens. The clamping was done by the scaling function
			// above.
			//
			// If the scaling function clamped, the following will not happen. But if
			// the value falls outside our analysis domain, we clip it (-1 nodata).
			//
			if (sv < 0 || sv > 1) {
				a = -1; continue;
			}

			const w = weights[c.id];
			a = w ? (sv * w) + a : a;
		}

		// Record the new min/max values:
		//
		if (a !== -1) {
			if (a > max) max = a;
			if (a < min) min = a;

			avg_sum += a;
			avg_count++;
		}

		it[i] = a;
	}

	const f = d3.scaleLinear().domain([min,max]).range([0,1]);

	for (let i = 0; i < it.length; i += 1) {
		const r = it[i];
		it[i] = (r === -1) ? -1 : f(r);
	}

	console.log("Finished analysis.run in:", performance.now() - t0, weights, tots);

	return {
		min,
		max,
		"avg":      avg_sum / avg_count,
		"raster":   it,
		"datasets": list,
		"totals":   tots,
		weights,
	};
};

/*
 * datasets
 *
 * Select from DS collection datasets that are elegible for being part of an
 * analysis. Then, sort them to minimise calculation time.
 *
 * @param "type" string. That can be:
 *   - ID of a dataset, or
 *   - an index name
 *
 * returns DS to be plotted onto a canvas
 */

function datasets(type) {
	return DS.array
		.filter(d => and(d.on, d.raster, d.analysis))
		.filter(d => {
			if (d.datatype === 'polygons-boundaries') return false;

			if (!and(d.domain, d._domain)) {
				console.debug(`Discarding '${d.id}'. Domain is not set yet.`);
				return false;
			}

			if (d._domain_select)
				d._afn = _ => x => (d._domain_select.indexOf(x) > -1) ? 1 : -1;
			else if (typeof d.analysis_fn(type) !== 'function')
				d._afn = _ => x => (x < d._domain.min || x > d._domain.max) ? -1 : 1;
			else
				d._afn = d.analysis_fn;

			// Discard datasets which are inclusive filters and use the entire domain
			// (i.e., do nothing)
			//
			if (and(inclusion_filters.includes(d.analysis_scale(type)),
			        and(d._domain.min === d.domain.min,
			            d._domain.max === d.domain.max)))
				return false;

			return true;
		})
		.sort((x,_) => {
			// Place the filters first. They will return -1's sooner and make our
			// loops faster.
			//
			return (filter_types.includes(x.analysis_scale(type))) ? 1 : -1;
		});
};

/*
 * plot_active
 *
 * Utility.
 *
 * @param "type" string. That can be:
 *   - ID of a dataset, or
 *   - an index name
 */

export async function plot_active(type, doindexes) {
	const a = await run(type);
	plot_outputcanvas(a.raster);

	const index = ea_indexes[type];

	if (!type || !index) {
		console.warn("plot_active: Too early...",
		             "This is an initialisation bug.",
		             "Index type:", type);

		return a;
	}

	indexes_updated_plot(type, index);

	// 'animate' is set to false on mapbox's configuration, since we don't want
	// mapbox eating the CPU at 60FPS for nothing.
	//
	const canvas_source = MAPBOX.getSource('output-source');
	if (canvas_source) {
		canvas_source.raster = a.raster;

		canvas_source.play();
		canvas_source.pause();
	}

	if (doindexes) indexes_graphs(a.raster);

	return a;
};

export async function analysis(type) {
	const b = OUTLINE;
	const env = GEOGRAPHY.envelope;

	const a = await run(type);
	const r = a.raster;

	if (!r.length) return;

	const arr = new Uint8Array(r.length).fill(-1);
	for (let i = 0; i < r.length; i += 1)
		arr[i] = (r[i] === -1) ? 0 : Math.floor(r[i] * 100);

	const metadata = {
		"ImageWidth":      b.raster.width,
		"ImageLength":     b.raster.height,
		"ResolutionUnit":  "1",
		"XPosition":       env[0],
		"YPosition":       env[1],
		"ModelTiepoint":   [ 0, 0, 0, env[0], env[3], 0 ],
		"XResolution":     "1",
		"YResolution":     "1",
		"GDAL_NODATA":     "0",
		"ModelPixelScale": [(env[2] - env[0]) / b.raster.width, (env[3] - env[1]) / b.raster.height, 0],
	};

	return {
		"tiff":     await GeoTIFF.writeArrayBuffer(arr, metadata),
		"analysis": a,
	};
};

export function priority(d, a, i) {
	const source = MAPBOX.getSource(`priority-source-${i}`);
	if (!source) {
		console.debug(`priority-source-${i}: not yet...`);
		return;
	}

	const g = d.raster.data;

	const o = {};

	const u = [];
	for (const e of g) if (u.indexOf(e) === -1) u.push(e);
	for (const e of u.sort()) {
		if (e === -1) continue;

		o[e] = {
			"values":  [],
			"average": 0,
		};
	}

	for (let i = 0; i < a.raster.length; i += 1)
		if (g[i] > -1) o[g[i]]['values'].push(a.raster[i]);

	for (const e in o) {
		o[e]['average'] = o[e]['values'].reduce((a,b) => a+b, 0) / o[e]['values'].length;
	}

	const actives = Object.keys(o).filter(k => o[k]['average'] !== -1);
	const averages = actives.map(k => o[k]['average']);

	const s = d3.scaleQuantile().domain([Math.min(...averages),Math.max(...averages)]).range(ea_analysis_colorscale.stops);

	for (const e in o) {
		if (o[e]['average'] === -1) {
			source._data.features.find(f => f.id === +e).properties['__color'] = "transparent";
			continue;
		}

		source._data.features.find(f => f.id === +e).properties['__color'] = s(o[e]['average']);
	}

	source.setData(jsonclone(source._data));

	return o;
};

export function enough_datasets(t) {
	if (["eai", "ani"].includes(t)) {
		const required = ea_indexes[t].compound;

		for (const r of required)
			if (!DS.array.find(d => and(d.on, d.analysis, d.index === r))) return false;

		return true;
	}

	else
		return DS.array.filter(d => and(d.on, d.analysis, d.index === t)).length > 0;
};

export function medhigh_point_count(d, a) {
	let count = 0;

	for (let i = 0; i < d.length; i++) {
		if ((d[i] === 0) && (a[i] > 0.6))
			count += 1;
	}

	return count;
};

export async function getpoints(n = 0) {
	const a = await plot_active(U.output, false);

	const threshold = a.raster.slice(0)
		.sort((a,b) => a > b ? -1 : 1)
		.slice(0,n)[n-1];

	const points = a.raster.reduce((t,v,i) => {
		if (v > 0 && v >= threshold)
			t.push({i,v});

		return t;
	}, []);

	return points
		.sort((a,b) => a.v > b.v ? -1 : 1)
		.map(t => ({ "v": t.v, "i": t.i, "c": raster_pixel_to_coordinates(t.i) }));
};
