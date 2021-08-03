import DS from './ds.js';

import * as plot from './plot.js';

import {
	list as controls_list,
} from './controls.js';

import {
	graphs as indexes_graphs,
	updated_plot as indexes_updated_plot,
} from './indexes.js';

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

	// There's nothing interesting about an analysis with only filters. Also,
	// filters return 1 so a silly (single-valued) analysis would be plotted.
	//
	if (list.every(d => ea_filters.includes(d.analysis_scale(type)))) return { raster: it };

	// Add up how much non-compound indexes datasets will account for. Then, just
	// below, these values will be split into equal proportions of the total
	// analysis.
	//
	const singles = {};
	for (let i in ea_indexes) if (!ea_indexes[i].compound) singles[i] = 0;

	const tots = list.reduce((a,d) => {
		if (ea_filters.indexOf(d.analysis_scale(type)) > -1) ;
		else if (d.index) a[d.index] += d.weight;

		return a;
	}, singles);

	for (let s in singles) if (singles[s] === 0) delete singles[s];

	const weights = {};
	list.forEach(d => {
		if (ea_filters.indexOf(d.analysis_scale(type)) > -1) weights[d.id] = 0;
		else {
			switch (type) {
			case "ani":
				weights[d.id] = d.index ? d.weight / Object.keys(tots).reduce((a,c) => tots[c] + a, 0) : 0;
				break;

			default:
				weights[d.id] = d.index ? d.weight / (tots[d.index] * Object.keys(singles).length) : 0;
				break;
			}
		}
	});

	// If the total weight is 0, ciao.
	//
	if (Object.keys(weights).reduce((a,c) => (weights[c] || 0) + a, 0) === 0)
		return { raster: it };

	// Each dataset has a different scaling function. We cache these to optimise
	// the huge loop we are about to do.
	//
	const afns = list.map(d => d._afn(type));

	// The values will be normalised. Initialise the values:
	//
	let min = 1;
	let max = 0;

	// NOTICE: if there is only one dataset which has no weight in calculations
	// (boundaries with key-delta scale function, for example), we do NOT want an
	// fully black raster to show as the result. We return the transparent raster.
	// instead.
	//
	const full_weight = list
		.reduce((a,c) => ((c.analysis_scale(type) === "key-delta") ? a : c.weight + a), 0);

	if (list.find(l => !maybe(l, 'raster', 'data')))
		await until(_ => list.filter(d => and(d.on, d.raster, d.analysis, !d.raster.data)).length === 0);

	if (list.length === 1 && full_weight === 0) return { raster: it };

	for (let i = 0; i < it.length; i += 1) {
		let a = 0;

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
		raster: it,
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

export function datasets(type) {
	const s = U.subdiv;

	return DS.array
		.filter(d => and(d.on, d.raster, d.analysis))
		.map(d => {
			if (!(d.category.name === "indicator"))
				return d;

			if (d.config.divisions_tier === U.divtier) {
				d._domain = s === null ?
					Object.assign({}, d.domain) :
					{ min: s, max: s };
			} else {
				d._domain = Object.assign({}, d.domain);
			}

			return d;
		})
		.filter(d => {
			// Discard datasets which have no analysis_fn (eg. outline).
			//
			if (typeof d.analysis_fn(type) !== 'function')
				d._afn = _ => x => (x < d._domain.min || x > d._domain.max) ? -1 : 1;
			else
				d._afn = d.analysis_fn;

			if (!and(d.domain, d._domain)) {
				console.log(`Discarding '${d.id}'. Domain is not set yet...`);
				return false;
			}

			// Discard datasets which are filters and use the entire domain (useless).
			//
			if (and(ea_filters.includes(d.analysis_scale(type)),
			        and(d._domain.min === d.domain.min,
			            d._domain.max === d.domain.max)))
				return false;

			return true;
		})
		.sort((x,_) => {
			// Place the filters first. They will return -1's sooner and make our
			// loops faster.
			//
			return (ea_filters.includes(x.analysis_scale(type))) ? 1 : -1;
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
	plot.outputcanvas(a.raster);

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

export async function raster_to_tiff(type) {
	const b = OUTLINE;
	const env = GEOGRAPHY.envelope;

	const a = await run(type);
	const r = a.raster;

	if (!r.length) return;

	const scale = d3.scaleLinear().domain([0,1]).range([0,254]);
	const fn = function(x) {
		if (x === -1) return 255;
		return scale(x);
	};

	const arr = new Uint8Array(r.length).fill(255);
	for (let i = 0; i < r.length; i += 1)
		arr[i] = fn(r[i]);

	const metadata = {
		ImageWidth: b.raster.width,
		ImageLength: b.raster.height,
		ResolutionUnit: "1",
		XPosition: env[0],
		YPosition: env[1],
		ModelTiepoint: [ 0, 0, 0, env[0], env[3], 0 ],
		XResolution: "1",
		YResolution: "1",
		GDAL_NODATA: "255",
		ModelPixelScale: [(env[2] - env[0]) / b.raster.width, (env[3] - env[1]) / b.raster.height, 0]
	};

	return GeoTIFF.writeArrayBuffer(arr, metadata);
};

export function context(rc, dict, props, skip = null) {
	if (!rc) return [];

	const controls = controls_list();

	DS.array
		.filter(d => d.on && d.category.name !== 'boundaries' && d.id !== skip)
		.sort((a,b) => {
			const bi = controls.indexOf(b.id);
			const ai = controls.indexOf(a.id);

			if (ai > bi) return 1;
			else if (ai < bi) return -1;
			else return 0;
		})
		.forEach(d => {
			let v = d.raster.data[rc.index];
			let p = d.id;

			if (v === d.raster.nodata) return;

			if (d.config.csv_columns) { // (!d.category.name.match(/^(timeline-)?indicator/))
				p = "_analysis_" + p + "_" + d.config.csv_columns.id;
				v = d.csv.table[v];
			}

			dict.push([p, d.name]);
			props[p] = v + " " + (d.category.unit || "km (proximity to)");
		});
};
