import DS from './ds.js';

import {
	intersect,
} from './rasters.js';

import {
	analysis,
} from './analysis.js';

import {
	load as config_load,
} from './config.js';

import {
	polygons_csv as parse_polygons_csv,
} from './parse.js';

import {
	update as cards_update,
} from './cards.js';

import {
	lines_update as timeline_lines_update,
} from './timeline.js';

import {
	valued_polygons as filtered_valued_polygons,
	colors_array as filtered_colors_array,
} from './filtered.js';

import {
	snapshot as session_snapshot,
} from './session.js';

import {
	plot_active as analysis_plot_active,
} from './analysis.js';

import {
	info_mode_change as mapbox_info_mode_change,
} from './mapbox.js';

import {
	list as indexes_list,
} from './indexes.js';

import {
	buttons as views_buttons,
	right_pane as views_right_pane,
} from './views.js';

import {
	list as controls_list,
} from './controls.js';

export default class Overlord {
	layers() {
		Promise.all(U.inputs.map(id => DST.get(id).active(true, ['inputs', 'timeline'].includes(U.view))));
	};

	ds(d, data) {
		if (!(d instanceof DS))
			throw new Error("O.ds: Expected a DS as input:", d);

		for (const [k, v] of Object.entries(data)) {
			switch (k) {
			case "domain": {
				d._domain = Object.assign(d._domain, v);
				break;
			}

			case "weight": {
				d.weight = v;
				break;
			}

			case "active": {
				const draw = ['inputs', 'timeline'].includes(U.view);
				d.active(v, draw);

				let arr = U.inputs;
				if (d.on) arr.unshift(d.id);
				else arr.splice(arr.indexOf(d.id), 1);

				O.inputs = arr;

				if (d.summary) {
					for (const i in d.summary)
						reset_features_visibility.call(DST.get(i));
				}

				break;
			}

			case "mutate": {
				this.layers();
				break;
			}

			case "disable": {
				DST.delete(d.id);
				return;
			}

			default: {
				console.warn(`O.ds: Ignoring garbage argument '${k}' for`, d);
				break;
			}
			}
		}

		load_view();
	};

	set inputs(arr) {
		U.inputs = arr;
		O.sort();
	};

	set timeline(t) {
		U.timeline = t;

		DS.array.forEach(async d => {
			if (d.on && d.datatype === 'polygons-timeline')
				parse_polygons_csv.call(d, t);
		});
	};

	set index(t) {
		U.output = t;
		analysis_plot_active(t, true);
	};

	set view(t) {
		U.view = t;
		O.layers();
		load_view();

		window.dispatchEvent(new Event('resize'));
	};

	context() {
		return context(arguments);
	};

	map(interaction, event) {
		const et = MAPBOX.queryRenderedFeatures(event.point).find(i => DST.get(i.source));
		const ds = DST.get(maybe(et, 'source'));

		switch (interaction) {
		case "click": {
			mapclick.call(ds, event);
			break;
		}

		default:
			break;
		}
	};

	async sort() {
		const arr = U.inputs.map(i => {
			const d = DST.get(i);
			return d.mutant ? d.host : d;
		});

		const layers = [].concat(...arr.map(d => d._layers));
		await Promise.all(layers.map(i => until(_ => MAPBOX.getLayer(i))));

		for (let i = 0; i < layers.length; i++) {
			MAPBOX.moveLayer(
				layers[i],
				(i === 0) ? MAPBOX.first_symbol : layers[i-1]
			);
		}

		const a = arr[0];
		for (const d of arr) {
			if (!a.summary) {
				reset_features_visibility.call(d);
				continue;
			}

			analysis_dataset_intersect.call(d, a.raster);
		};
	};

	info_mode() {
		mapbox_info_mode_change();
		return INFOMODE;
	}

	async theme_changed() {
		await until(_ => MAPBOX.isStyleLoaded());

		await DS.array
			.filter(d => d.source_config)
			.forEach(d => {
				d.loaded = false;
				d.loadall();
			});

		O.view = U.view;
	};

	load_config(c = JSON.parse(localStorage.getItem('config'))) {
		config_load(c);

		const arr = c.datasets.filter(x => DST.get(x.name));

		arr.forEach(i => {
			const ds = DST.get(i.name);
			if (ds) ds.active(true, true);
		});

		U.inputs = arr.map(i => i.name);

		load_view();
		cards_update();

		return c;
	};
};

function load_view() {
	const timeline = qs('#timeline');

	const {view, output, inputs} = U;

	(function special_layers() {
		if (!MAPBOX.getSource('output-source')) {
			MAPBOX.addSource('output-source', {
				"type": 'canvas',
				"canvas": 'output',
				"animate": false,
				"coordinates": MAPBOX.coords
			});
		}

		if (!MAPBOX.getLayer('output-layer')) {
			MAPBOX.addLayer({
				"id": 'output-layer',
				"source": 'output-source',
				"type": 'raster',
				"layout": {
					"visibility": "none",
				},
				"paint": {
					"raster-resampling": "nearest",
				}
			}, MAPBOX.first_symbol);
		}

		GEOGRAPHY.divisions.forEach((d,i) => {
			if (!MAPBOX.getSource(`filtered-source-${i}`)) {
				MAPBOX.addSource(`filtered-source-${i}`, {
					"type": 'geojson',
					"data": d.vectors.features
				});
			}

			if (!MAPBOX.getLayer(`filtered-layer-${i}`)) {
				MAPBOX.addLayer({
					"id": `filtered-layer-${i}`,
					"source": `filtered-source-${i}`,
					"type": 'fill',
					"layout": {
						"visibility": "none",
					},
					"paint": {
						"fill-color": filtered_colors_array[i],
						"fill-outline-color": "black",
						"fill-opacity": [ "case", [ "boolean", [ "get", "__visible" ], true ], 0.5, 0 ]
					},
				}, MAPBOX.first_symbol);
			}
		});
	})();

	function filtered_visibility(v) {
		const a = DS.array.filter(d => d.on).map(d => maybe(d, 'config', 'divisions_tier'));

		GEOGRAPHY.divisions.forEach((_,i) => {
			let y = (a.indexOf(i) < 0) ? 'none' : v;

			if (MAPBOX.getLayer(`filtered-layer-${i}`))
				MAPBOX.setLayoutProperty(`filtered-layer-${i}`, 'visibility', y);
		});
	};

	function output_visibility(v) {
		if (MAPBOX.getLayer('output-layer'))
			MAPBOX.setLayoutProperty('output-layer', 'visibility', v);
	};

	switch (view) {
	case "outputs": {
		indexes_list();

		analysis_plot_active(output, true)
			.then(_ => {
				if (timeline) timeline.style.display = 'none';

				filtered_visibility('none');

				output_visibility('visible');
			});
		break;
	}

	case "inputs": {
		filtered_visibility('none');

		output_visibility('none');

		cards_update(inputs);
		O.sort();

		analysis_plot_active(output, false);

		break;
	}

	case "filtered": {
		if (timeline) timeline.style.display = 'none';

		filtered_visibility('visible');

		output_visibility('none');

		analysis_plot_active(output, true);

		filtered_valued_polygons();
		break;
	}

	case "timeline": {
		if (timeline) timeline.style.display = '';

		filtered_visibility('none');

		output_visibility('none');

		timeline_lines_update();

		cards_update(inputs);
		O.sort();

		break;
	}

	default: {
		throw new Error(`Overlord: Could not set/find the view '${view}'`);
	}
	}

	views_buttons();
	views_right_pane();

	session_snapshot();
};

function mapclick(e) {
	if (!INFOMODE) return;

	const et = MAPBOX.queryRenderedFeatures(e.point)[0];

	const ll = [e.lngLat.lng, e.lngLat.lat];
	const rc = coordinates_to_raster_pixel(ll, DST.get('outline').raster);

	const [dict, props] = context(rc, et);

	if (U.view === "outputs") {
		const ac = coordinates_to_raster_pixel(ll, {
			data: MAPBOX.getSource('output-source').raster,
			nodata: -1
		});

		if (Number.isFinite(maybe(ac, 'value'))) {
			dict.unshift(["_analysis_name", ea_indexes[U.output]['name']], null);
			props["_analysis_name"] = ea_lowmedhigh_scale(ac.value);
		}
	}

	const td = table_data(dict, props, ll);

	map_pointer(
		td,
		maybe(e, 'originalEvent', 'pageX') || 0,
		maybe(e, 'originalEvent', 'pageY') || 0
	);
};

function context(rc, f) {
	const dict = [];
	const props = {};

	if (!rc) return [dict, props];

	const controls = controls_list();

	const x = rc.index;
	const in0 = maybe(U.inputs, 0);

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

		if (maybe(d, 'csv', 'key')) { // (!d.category.name.match(/^(timeline-)?indicator/))
			k = d.id + "_csv_" + d.csv.key;
			v = d.csv.table[v];
		}

		if (d.category.unit) {
			dict.push([k, d.name]);
			props[k] = `<code>${v} ${d.category.unit}</code>`;
		}

		else if (and(v, d.vectors)) {
			dict.push([k, d.name]);
			props[k] = `<code>${v} km (proximity to)</code>`;
		}

		if (and(d.vectors, d.id === in0)) {
			if (v === 0) {
				dict.push([k, d.name]);
				props[k] = `<code>&lt; 1 km (proximity to)</code>`;
			}

			if ((f && f.source) === d.id) {
				if (maybe(d.config, 'attributes_map', 'length')) {
					Object.assign(props, f.properties);
					const a = d.config.attributes_map.map(e => [e.dataset, e.target]);
					if (a.length) dict.unshift(...a, null);
				}
			}
		}
	};

	const p = DS.array
		.filter(d => and(d.on,
		                 d.category.name !== 'boundaries',
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
		.forEach(d => rows(d));

	(function tier_rows() {
		const g = GEOGRAPHY.divisions.slice(0);

		const a = g
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

function reset_features_visibility() {
	const fs = maybe(this, 'vectors', 'features');
	if (!fs) return;

	fs.features.forEach(f => f.properties.__visible = true);

	qsa('input[type="checkbox"]', this.card).forEach(c => c.checked = true);

	MAPBOX.getSource(this.id).setData(fs);
};

function extent_contained(extent, raster) {
	const [left,bottom,right,top] = extent;

	const f = (x,y) => {
		const v = maybe(coordinates_to_raster_pixel([x,y], raster), 'value');
		return and(v, v !== raster.nodata);
	};

	return or(f(left, top),
	          f(left, bottom),
	          f(right, top),
	          f(right, bottom),
	          f((right - left) / 2, (top - bottom) / 2));
};

function analysis_dataset_intersect(raster) {
	const { data, nodata } = raster;

	if (this.datatype === 'raster') return;

	let fn;
	if (this.datatype === 'polygons')
		fn = p => extent_contained(p.properties['__extent'], raster);
	else if (this.datatype === 'lines')
		fn = p => intersect(p.properties['__rasterindexes'], raster);
	else if (this.datatype === 'points')
		fn = p => (data[p.properties['__rasterindex']] !== nodata);
	else
		fn = _ => true;

	let count = 0;
	for (const p of this.vectors.features.features) {
		const x = fn(p);
		p.properties['__visible'] = x;

		if (x) count += 1;
	}

	MAPBOX.getSource(this.id).setData(DST.get(this.id).vectors.features);

	return count;
};

let analysis_count = 0;
export async function analysis_to_dataset(t) {
	const category = await API.get("categories", { "select": "*", "name": "eq.analysis" }, { one: true });

	category.colorstops = ea_analysis_colorscale.stops;

	analysis_count++;

	const a = await analysis(t);

	const url = URL.createObjectURL(new Blob([a.tiff], { type: "application/octet-stream;charset=utf-8" }));

	const d = new DS({
		"name": `analysis-${t}-` + analysis_count,
		"name_long": `Analysis ${t.toUpperCase()} - ` + analysis_count,
		"datatype": "raster",
		"category": category,
		"processed_files": [{
			"func": "raster",
			"endpoint": url
		}],
		"source_files": [],
		"metadata": {},
	});

	d.metadata.inputs = U.inputs;

	d._active(true, true);

	PARAMS.inputs.push(d.id);

	U.inputs = [d.id].concat(U.inputs);
	O.view = 'inputs';

	qs('#cards-pane #cards-list').prepend(d.card);

	await until(_ => maybe(d, 'raster', 'data'));

	d['summary'] = {
		'intersections': {}
	};

	for (const i of d.metadata.inputs) {
		const ds = DST.get(i);
		const x = analysis_dataset_intersect.call(ds, d.raster);

		if (x) d['summary']['intersections'][ds.id] = x;
	}

	d['summary']['analysis'] = a.analysis;

	d.opacity(0.5);
};
