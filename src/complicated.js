import DS from './ds.js';

import {
	intersect,
} from './rasters.js';

import {
	list as controls_list,
} from './controls.js';

import {
	colorscale,
	extent_contained,
} from './utils.js';

import {
	analysis,
} from './analysis.js';

export function context(rc, f) {
	const dict = [];
	const props = {};

	if (!rc) return [dict, props];

	const controls = controls_list();

	const x = rc.index;
	const in0 = STATE.datasets[0];

	function rows(d) {
		if (typeof d === "string") {
			dict.push(null, [d, `<strong style="font-size: 1.1em;">${d.toUpperCase()}</strong>`]);
			return;
		}

		let v = d.raster.data[x];
		let k = d.id;

		if (v === d.raster.nodata) return;

		if ((v + "").match('[0-9]\\.[0-9]{3}'))
			v = v.toFixed(2);

		if (maybe(d, 'csv', 'key')) {
			k = d.id + "_csv_" + d.csv.key;
			v = d.csv.table[v];
		}

		if (d.category.unit) {
			dict.push([k, d.name]);
			props[k] = `<code>${v} ${d.category.unit}</code>`;
		}

		else if (and(Number.isFinite(v), d.vectors)) {
			const l = v === 0 ? "< 1" : v;

			dict.push([k, d.name]);
			props[k] = `<code>${l} km (proximity to)</code>`;
		}

		if (d.vectors) {
			if ((f && f.source) === d.id) {
				if (maybe(d.config, 'attributes_map', 'length')) {
					Object.assign(props, f.properties);

					const a = d.config.attributes_map.map(e => [e.dataset, e.target]);
					if (a.length) {
						dict.unshift(
							["_" + d.id, `<strong style="font-size: 1.1em;">${d.name.toUpperCase()}</strong>`],
							...a,
						);
					}
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

	(function tier_rows() {
		const g = GEOGRAPHY.divisions.slice(0);

		const a = g
			.filter(d => maybe(d, 'raster', 'data'))
			.filter(d => maybe(d, 'csv', 'table', d.raster.data[x]))
			.map(d => {
				props["_" + d.name] = d.csv.table[d.raster.data[x]];
				return ["_" + d.name, d.name];
			});

		if (dict.length) a.unshift(null);

		dict.push(...a);
	})();

	dict.forEach((d,i) => {
		if (!d) return;

		if (d[0] === in0) {
			dict.splice(i,1);
			dict.unshift(d, null);
		}
	});

	return [dict,props];
};

let analysis_count = 0;
export async function analysis_to_dataset(t) {
	const category = await API.get("categories", { "select": "*", "name": "eq.analysis" }, { "one": true });

	category.colorstops = colorscale.stops;

	analysis_count++;

	const a = await analysis(t);

	const url = URL.createObjectURL(new Blob([a.tiff], { "type": "application/octet-stream;charset=utf-8" }));

	const d = new DS({
		"name":            `analysis-${t}-` + analysis_count,
		"name_long":       `Analysis ${t.toUpperCase()} - ` + analysis_count,
		"type":            "raster",
		"category":        category,
		"processed_files": [{
			"func":     "raster",
			"endpoint": url,
		}],
		"source_files": [],
		"metadata":     {},
	});

	d.metadata.inputs = STATE.datasets.map(d => d.id);

	await d.active(true, true);

	STATE.view = 'data';

	await until(_ => d.card);

	qs('#cards #cards-list').prepend(d.card);

	await until(_ => maybe(d, 'raster', 'data'));

	d['summary'] = {
		'intersections': {},
	};

	for (const i of d.metadata.inputs) {
		const ds = DST.get(i);
		const x = analysis_dataset_intersect.call(ds, d.raster);

		if (x) d['summary']['intersections'][ds.id] = x;
	}

	d['summary']['analysis'] = a.analysis;

	d.opacity(1);

	COMMIT("datasets");
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
	for (const p of this.vectors.geojson.features) {
		const x = fn(p);
		p.properties['__visible'] = x;

		if (x) count += 1;
	}

	MAPBOX.getSource(this.id).setData(DST.get(this.id).vectors.geojson);

	return count;
};
