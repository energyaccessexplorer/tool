import {
	list as controls_list,
} from './controls.js';

import {
	mask_runs,
	coordinates_to_raster_pixel,
	resolve_raster_value,
	format_value_unit,
} from './utils.js';

import {
	division_names,
} from './area-analysis.js';

import {
	and,
	maybe,
} from '../lib/helpers.js';

import { translateDatasetName } from './translate.js';

export function context(raster_pixel, winner = null) {
	const dict = [];
	const props = {};
	const values = {};
	const units = {};

	if (!raster_pixel) return [dict, props, { values, units }];

	const controls = controls_list();

	const x = raster_pixel.index;
	const in0 = STATE.datasets[0];

	const dotState = { "used": false };

	function rows(d) {
		if (typeof d === "string") {
			dict.push(null, [d, `<strong style="font-size: 1.1em;">${d.toUpperCase()}</strong>`]);
			return;
		}

		const raw = d.raster.data[x];
		const k = d.id;

		if (raw === d.raster.nodata) return;

		// Polygon timelines: an empty cell means "no data", not 0% — render "-" instead.
		let missing = false;
		let v;
		if (d.type === 'polygons-timeline') {
			const row = d.csv?.data?.find(r => +r[d.csv.key] === +raw);
			if (!row || row[STATE.timeline] === "" || row[STATE.timeline] == null) missing = true;
		}

		if (!missing) {
			v = resolve_raster_value(d, raw);
			if (v == null || (typeof v === 'number' && !Number.isFinite(v))) missing = true;
		}

		if (d.category.unit) {
			dict.push([k, translateDatasetName(window.LOCALE, d)]);
			props[k] = `<code>${missing ? '-' : format_value_unit(v, d.category.unit)}</code>`;
			values[k] = missing ? null : v;
			units[k] = d.category.unit;
		}

		else if (and(Number.isFinite(v), d.vectors)) {
			dict.push([k, translateDatasetName(window.LOCALE, d)]);
			props[k] = `<code>${v === 0 ? "< 1" : v} km (proximity to)</code>`;
			values[k] = v;
			units[k] = "km (proximity to)";
		}

		if (winner && winner.dataset.id === d.id && !dotState.used) {
			Object.assign(props, winner.feature.properties);

			dict.unshift(
				["_" + d.id, `<strong style="font-size: 1.1em;">${translateDatasetName(window.LOCALE, d).toUpperCase()}</strong>`],
				...d.config.attributes_map.map(e => [e.dataset, e.target]),
			);

			dotState.used = true;
		}
	};

	const p = STATE.datasets
		.filter(d => and(d.category.name !== 'boundaries',
		                 d.category.name !== 'outline'))
		.sort((a,b) => {
			const bi = controls.indexOf(b.id);
			const ai = controls.indexOf(a.id);

			if (ai > bi) return 1;
			else if (ai < bi) return -1;
			else return 0;
		})
		.reduce(function(a,c) {
			const b = c.category.controls.path[0];

			if (!a[b]) a[b] = [];
			a[b].push(c);

			return a;
		}, {});

	Object.keys(p)
		.map(e => [e, p[e]])
		.flat(2)
		.filter(d => maybe(d, 'raster', 'data'))
		.forEach(d => rows(d));

	const names = division_names(x);
	const tier_entries = Object.entries(names).map(([divName, name]) => {
		props["_" + divName] = name;
		return ["_" + divName, divName];
	});

	if (dict.length && tier_entries.length) tier_entries.unshift(null);
	dict.push(...tier_entries);

	dict.forEach((d,i) => {
		if (!d) return;

		if (d[0] === in0) {
			dict.splice(i,1);
			dict.unshift(d, null);
		}
	});

	return [dict, props, { values, units }];
};

// In-mask vertex runs as a MultiLineString, extended one vertex past each end.
function masked_line_geometry(f, raster) {
	const { data, nodata } = raster;

	const parts = (f.geometry.type === 'LineString') ?
		[f.geometry.coordinates] : f.geometry.coordinates;

	const indexparts = maybe(f.properties, '__rasterindexparts') ||
		parts.map(part => part.map(t => maybe(coordinates_to_raster_pixel(t), 'index')));

	const lines = [];

	for (let p = 0; p < parts.length; p++) {
		const coords = parts[p];
		const idxs = indexparts[p] || [];

		const inside = i => (typeof idxs[i] === 'number') && (data[idxs[i]] !== nodata);

		let start = -1;

		const flush = end => {
			const lo = Math.max(0, start - 1);
			const hi = Math.min(coords.length - 1, end + 1);
			if (hi > lo) lines.push(coords.slice(lo, hi + 1));
		};

		for (let i = 0; i < coords.length; i++) {
			if (inside(i)) { if (start < 0) start = i; }
			else if (start >= 0) { flush(i - 1); start = -1; }
		}

		if (start >= 0) flush(coords.length - 1);
	}

	return { "type": 'MultiLineString', "coordinates": lines };
};

// Intersect with the mask runs overlapping the feature's extent; on failure keep whole.
function masked_polygon_geometry(f, runs) {
	const geom = f.geometry;

	const polys = (geom.type === 'Polygon') ? [geom.coordinates] : geom.coordinates;

	const [left, bottom, right, top] = f.properties['__extent'];

	const local = [];
	for (const run of runs) {
		const [rl, rb, rr, rt] = run.bbox;
		if (rr < left || rl > right || rt < bottom || rb > top) continue;
		local.push(run.poly);
	}

	if (!local.length) return { "type": 'MultiPolygon', "coordinates": [] };

	try {
		return { "type": 'MultiPolygon', "coordinates": polygonClipping.intersection(polys, local) };
	} catch (err) {
		console.warn("mask: polygon clip failed, keeping feature whole", err);
		return geom;
	}
};

export function analysis_dataset_intersect(raster) {
	const { data, nodata } = raster;

	if (['raster', 'raster-timeline'].includes(this.type)) return;

	const vector_type = { "polygons": "polygons", "polygons-timeline": "polygons", "polygons-valued": "polygons", "lines": "lines", "lines-timeline": "lines", "points": "points", "points-timeline": "points" }[this.type];

	let fn;
	switch (vector_type) {
	case 'points':
		fn = p => (data[p.properties['__rasterindex']] !== nodata);
		break;

	default:
		fn = _ => true;
		break;
	}

	// Lines/polygons are clipped to the mask via a derived collection; vectors.data stays pristine.
	if (vector_type === 'lines') {
		let count = 0;

		const features = this.vectors.data.features.map(f => {
			const geometry = masked_line_geometry(f, raster);
			const x = geometry.coordinates.length > 0;

			f.properties['__visible'] = x;
			if (x) count += 1;

			return { "type": 'Feature', "properties": f.properties, geometry };
		});

		MAPBOX.getSource(this.id).setData({ "type": 'FeatureCollection', features });

		return count;
	}

	if (vector_type === 'polygons') {
		const runs = mask_runs(raster);

		let count = 0;

		const features = this.vectors.data.features.map(f => {
			const geometry = masked_polygon_geometry(f, runs);
			const x = geometry.coordinates.length > 0;

			f.properties['__visible'] = x;
			if (x) count += 1;

			return { "type": 'Feature', "properties": f.properties, geometry };
		});

		MAPBOX.getSource(this.id).setData({ "type": 'FeatureCollection', features });

		return count;
	}

	let count = 0;
	for (const p of this.vectors.data.features) {
		const x = fn(p);
		p.properties['__visible'] = x;

		if (x) count += 1;
	}

	MAPBOX.getSource(this.id).setData(DST.get(this.id).vectors.data);

	return count;
};
