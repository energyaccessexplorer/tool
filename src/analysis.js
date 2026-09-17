import {
	uniform_split,
	colorscale,
	colorscale_svg,
	coordinates_to_raster_pixel,
	raster_pixel_to_coordinates,
	resolve_raster_value,
} from './utils.js';

import {
	outputcanvas as plot_outputcanvas,
} from './plot.js';

import {
	and,
	json_clone,
	maybe,
	until,
} from '../lib/helpers.js';

const filter_types = ["key-delta", "exclusion-buffer", "inclusion-buffer"];

const inclusion_filters = ["key-delta", "inclusion-buffer"];

const analysis_low = 0.167;

export const analysis_colorscale = colorscale({
	"stops":  uniform_split(5).map(x => d3.interpolateMagma(analysis_low + (x * (1 - analysis_low)))),
	"domain": { "min": 0, "max": 1 },
});

export const analysis_colorscale_svg = colorscale_svg(analysis_colorscale.stops);

export const lowmedhigh_scale = d3.scaleQuantize()
	.domain([0,1])
	.range(["Low", "Low-Medium", "Medium", "Medium-High", "High"]);

export function priority_scale(priorityData, range) {
	const averages = Object.values(priorityData)
		.map(d => d.average)
		.filter(v => v !== -1 && Number.isFinite(v));
	if (averages.length === 0) return null;
	return d3.scaleQuantile()
		.domain([Math.min(...averages), Math.max(...averages)])
		.range(range);
}

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

	const dt = STATE.divtier;
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
	for (const i in EAE['indexes']) {
		const compound = EAE['indexes'][i].compound;
		if (compound.length < 2) singles[i] = 0;
	}

	const tots = list.reduce((a,d) => {
		if (filter_types.indexOf(d.analysis_scale(type)) > -1) ;
		else if (d.index) a[d.index] += d.weight;

		return a;
	}, singles);

	for (const s in singles) if (singles[s] === 0) delete singles[s];

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
		await until((_ => list.filter(d => d.on && d.raster && d.analysis && !d.raster.data).length === 0), Infinity);

	if (list.length === 1 && full_weight === 0) return { "raster": it };

	const sd = STATE.subdiv;
	const subdiv = and(typeof sd === 'number', divraster);

	for (let i = 0; i < it.length; i += 1) {
		let a = 0;

		if (subdiv && divraster.data[i] !== sd) a = -1;

		for (let j = 0; j < list.length; j += 1) {
			const c = list[j];

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

	console.info("Finished analysis.run in:", performance.now() - t0, weights, tots);

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
	return STATE.datasets
		.filter(d => and(d.raster, d.analysis))
		.filter(d => {
			if (d.type === 'polygons-boundaries') return false;

			if (!and(d.domain, d._domain)) {
				console.debug(`Discarding '${d.id}'. Domain is not set yet.`);
				return false;
			}

			if (d._domain_select?.length)
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

export async function plot_active(type) {
	const a = await run(type);
	plot_outputcanvas(a.raster);

	const index = EAE['indexes'][type];

	if (!type || !index) {
		console.warn("plot_active: Too early...",
		             "This is an initialisation bug.",
		             "Index type:", type);

		return a;
	}

	// 'animate' is set to false on mapbox's configuration, since we don't want
	// mapbox eating the CPU at 60FPS for nothing.
	//
	const canvas_source = MAPBOX.getSource('output-source');
	if (canvas_source) {
		canvas_source.raster = a.raster;

		canvas_source.play();
		canvas_source.pause();
	}

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
		arr[i] = (r[i] === -1) ? 255 : Math.round(r[i] * 254);

	const metadata = {
		"ImageWidth":      b.raster.width,
		"ImageLength":     b.raster.height,
		"ResolutionUnit":  "1",
		"XPosition":       env[0],
		"YPosition":       env[1],
		"ModelTiepoint":   [ 0, 0, 0, env[0], env[3], 0 ],
		"XResolution":     "1",
		"YResolution":     "1",
		"GDAL_NODATA":     "255",
		"ModelPixelScale": [(env[2] - env[0]) / b.raster.width, (env[3] - env[1]) / b.raster.height, 0],
	};

	return {
		"tiff":     await GeoTIFF.writeArrayBuffer(arr, metadata),
		"analysis": a,
	};
};

// Compute average analysis value per division area.
// Returns { [area_id]: { average } }
export function division_averages(analysis_raster, division_data) {
	return Object.fromEntries(
		Object.entries(
			Array.from(analysis_raster).reduce((acc, value, i) => {
				const id = division_data[i];
				// skip nodata pixels
				if (id === -1 || value === -1) {
					return acc;
				} else {
					return Object.assign(acc, {
						[id]: {
							"sum":   (acc[id]?.sum || 0) + value,
							"count": (acc[id]?.count || 0) + 1,
						},
					});
				}
			}, {}),
		).map(([id, { sum, count }]) => [id, { "average": sum / count }]),
	);
}

export async function priority(division, analysis, tier) {
	const source = MAPBOX.getSource(`priority-source-${tier}`);

	if (source) {
		const areas = division_averages(analysis.raster, division.raster.data);

		source._data.features.forEach(f => f.properties['__fill'] = "transparent");

		const scale = priority_scale(areas, analysis_colorscale.stops);

		for (const area_id in areas) {
			const feature = source._data.features.find(f => f.id === +area_id);

			if (areas[area_id]['average'] === -1) {
				feature.properties['__fill'] = "transparent";
			} else {
				feature.properties['__fill'] = scale(areas[area_id]['average']);
			}
		}

		source.setData(json_clone(source._data));

		division.priorityData = areas;

		// The cards for a selected area aggregate the same cells as the
		// country-level cards: cells that have a priority score, restricted to this
		// area. priorityData above is untouched — it still drives the map colours
		// and the Priority areas listing.
		const analysis_raster = analysis.raster;
		const analysis_mask = {
			"raster": { "data": division.raster.data.map((v, i) => (v === -1 || !has_priority_score(analysis_raster[i])) ? -1 : v) },
		};
		division.layerData = await aggregate_layer_values(analysis_mask);
	} else {
		console.debug(`priority-source-${tier}: not yet...`);
	}
};

function valid_layer_datasets() {
	return STATE.datasets
		.filter(d => d.raster?.data)
		.filter(d => d.category.name !== 'boundaries' && d.category.name !== 'outline');
}

function dataset_layer_entry(dataset, areas, is_point_layer) {
	return {
		"name":           dataset.name,
		"unit":           dataset.category.unit,
		"is_point_layer": is_point_layer,
		"aggregation":    is_point_layer ? 'SUM' : (dataset.category.analysis?.aggregation ?? 'AVG'),
		areas,
	};
}

export async function aggregate_layer_values(division) {
	const divisions = division.raster.data;
	const area_ids = [...new Set(divisions.filter(e => e !== -1))];

	const entries = await Promise.all(
		valid_layer_datasets().map(async dataset => {
			const is_point_layer = dataset.vectors?.shape_type === 'points';
			const areas = is_point_layer
				? aggregate_point_values(divisions, dataset, area_ids)
				: aggregate_scalar_values(divisions, dataset, area_ids);

			return [dataset.id, dataset_layer_entry(dataset, areas, is_point_layer)];
		}),
	);

	return Object.fromEntries(entries);
}

function aggregate_point_values(division_raster, dataset, area_ids) {
	const features = maybe(dataset, 'vectors', 'data', 'features') || [];
	const counts = Object.fromEntries(area_ids.map(id => [id, 0]));

	for (const feature of features) {
		const coords = maybe(feature, 'geometry', 'coordinates');
		if (!coords) continue;

		const pixel = coordinates_to_raster_pixel(coords, OUTLINE.raster);
		if (!pixel) continue;

		const area_id = division_raster[pixel.index];
		if (area_id === -1) continue;
		if (!(area_id in counts)) continue;

		counts[area_id]++;
	}

	return Object.fromEntries(
		area_ids.map(id => [id, {
			"result": { "type": 'points', "value": counts[id] },
		}]),
	);
}

function aggregate(values, fn) {
	const sum = values.reduce((a, b) => a + b, 0);

	switch (fn) {
	case "SUM":
		return sum;

	case "AVG":
	default:
		return sum / values.length;
	}
}

// A cell or area HAS A PRIORITY SCORE when the analysis gave it a positive
// index. This is the single definition for every consumer:
//   - the aggregation mask the Data-tab cards use (graphs() in right-panel.js
//     and priority() below), so the cards average exactly the cells that carry
//     a score;
//   - the priority-cell list the CSV export is built from (all_points() in
//     right-panel-high-priority-areas.js), which is what writes the
//     "Priority score" / index columns;
//   - the Priority areas listing and its pagination (get_division_results()).
// Change the rule here and the cells the cards average over and the rows that
// carry a priority score move together. Note the index is rescaled into a
// Float32Array, so its minimum can land a hair below zero (≈ -1.6e-8); the
// strict comparison keeps those bottom-band cells out, which is what the export
// has always done.
export function has_priority_score(value) {
	return Number.isFinite(value) && value > 0;
}

// The band used for a dataset's scalar aggregation. SUM reads the area-weighted
// sum band, AVG reads the area-weighted average band, and categorical datasets
// (csv lookup) keep the near band since their values are category codes.
// The parser has already folded legacy single-band rasters into every band.
export function aggregation_band(dataset) {
	const agg_fn = dataset.category.analysis?.aggregation ?? 'AVG';

	if (dataset.csv?.key != null) return dataset.raster.data;
	if (agg_fn === 'SUM') return dataset.raster.sum;
	return dataset.raster.average;
}

function aggregate_scalar_values(division_raster, dataset, area_ids) {
	const agg_fn = dataset.category.analysis?.aggregation ?? 'AVG';
	const values_by_area = collect_values(dataset, division_raster, area_ids);

	const has_csv_lookup = dataset.csv?.key != null;

	return area_results(values_by_area, area_ids, dataset, agg_fn, has_csv_lookup);
}

// Collect the values of a dataset's aggregation band for each division area,
// skipping nodata cells.
function collect_values(dataset, division_raster, area_ids) {
	const band = aggregation_band(dataset);
	const nodata = dataset.raster.nodata;
	const result = Object.fromEntries(area_ids.map(id => [id, []]));

	division_raster.forEach((area_id, i) => {
		if (area_id !== -1 && band[i] !== nodata && area_id in result)
			result[area_id].push(band[i]);
	});

	return result;
}

// Turn per-area value lists into the aggregate result objects the layer-data
// consumers expect, resolving csv lookups for categorical datasets.
function area_results(values_by_area, area_ids, dataset, agg_fn, has_csv_lookup) {
	return Object.fromEntries(
		area_ids.map(id => {
			let values = values_by_area[id];

			if (has_csv_lookup) {
				values = values.map(v => resolve_raster_value(dataset, v)).filter(v => typeof v === 'number' && Number.isFinite(v));
			}

			return [id, {
				"result": (values.length || agg_fn === 'SUM')
					? { "type": 'scalar', "value": values.length ? aggregate(values, agg_fn) : 0 }
					: null,
			}];
		}),
	);
}

export function dataset_feeds_index(d, index) {
	if (!d.analysis) return false;
	if (d.index === index) return true;

	const indexes = maybe(d, 'analysis', 'indexes');
	return Array.isArray(indexes) && indexes.some(i => i.index === index);
};

export function enough_datasets_for_index(t) {
	if (STATE.datasets.some(d => dataset_feeds_index(d, t))) return true;

	if (["eai", "ani"].includes(t)) {
		const required = EAE['indexes'][t].compound;
		return required.every(r => STATE.datasets.some(d => dataset_feeds_index(d, r)));
	}

	return false;
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
	const a = await plot_active(STATE.index);

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
