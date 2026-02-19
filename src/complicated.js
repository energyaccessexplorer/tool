import {
	intersect,
} from './rasters.js';

import {
	list as controls_list,
} from './controls.js';

import {
	extent_contained,
} from './utils.js';

import {
	division_names,
} from './area-analysis.js';

import {
	and,
	maybe,
} from '../lib/helpers.js';

export function context(raster_pixel, features = []) {
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

		let v = d.raster.data[x];
		const k = d.id;

		if (v === d.raster.nodata) return;

		if ((v + "").match('[0-9]\\.[0-9]{3}'))
			v = v.toFixed(2);

		if (maybe(d, 'csv', 'key')) {
			v = d.csv.table[v];
		}

		if (d.category.unit) {
			dict.push([k, d.name]);
			props[k] = `<code>${v} ${d.category.unit}</code>`;
			values[k] = v;
			units[k] = d.category.unit;
		}

		else if (and(Number.isFinite(v), d.vectors)) {
			dict.push([k, d.name]);
			props[k] = `<code>${v === 0 ? "< 1" : v} km (proximity to)</code>`;
			values[k] = v;
			units[k] = "km (proximity to)";
		}

		if (d.vectors && !dotState.used) {
			const match = features.find(feat => feat && feat.source === d.id);
			if (match) {
				if (maybe(d.config, 'attributes_map', 'length')) {
					Object.assign(props, match.properties);

					const a = d.config.attributes_map.map(e => [e.dataset, e.target]);
					if (a.length) {
						dict.unshift(
							["_" + d.id, `<strong style="font-size: 1.1em;">${d.name.toUpperCase()}</strong>`],
							...a,
						);
					}

					dotState.used = true;
				}
			}
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

export function analysis_dataset_intersect(raster) {
	const { data, nodata } = raster;

	if (this.type === 'raster') return;

	let fn;
	switch (this.type) {
	case 'polygons':
		fn = p => extent_contained(p.properties['__extent'], raster);
		break;

	case 'lines':
		fn = p => intersect(p.properties['__rasterindexes'], raster);
		break;

	case 'points':
		fn = p => (data[p.properties['__rasterindex']] !== nodata);
		break;

	default:
		fn = _ => true;
		break;
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
