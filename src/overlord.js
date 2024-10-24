import {
	toggle_left_panel,
} from './a.js';

import {
	coordinates_to_raster_pixel,
	table_data,
} from './utils.js';

import DS from './ds.js';

import dscard, {
	update as cards_update,
} from './cards.js';

import {
	intersect,
} from './rasters.js';

import {
	priority,
	analysis,
	analysis_colorscale,
	lowmedhigh_scale,
	plot_active as analysis_plot_active,
} from './analysis.js';

import {
	load_datasets as config_load_datasets,
	generate as config_generate,
} from './config.js';

import {
	vectors_csv as parse_vectors_csv,
	raster_timeline as parse_raster_timeline,
} from './parse.js';

import {
	lines_update as timeline_lines_update,
} from './timeline.js';

import {
	valued_polygons as filtered_valued_polygons,
	colors_array as filtered_colors_array,
} from './filtered.js';

import {
	info_mode_change as mapbox_info_mode_change,
	map_pointer,
	coords_search_pois as mapbox_coords_search_pois,
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
		Promise.all(
			DS.all("on").map(x => x.active(true, ['inputs', 'timeline'].includes(U.view))));
	};

	ds(d, data) {
		if (!(d instanceof DS))
			throw new Error("O.ds: Expected a DS as input:", d);

		let w = Whatever;

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
				w = d.active(v, draw)
					.then(_ => {
						cards_update();
						O.sort();
					});

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

		return w;
	};

	set timeline(t) {
		U.timeline = t;

		DS.array.forEach(async d => {
			if (!d.on) return;

			if (d.datatype.match(/raster-timeline/))
				parse_raster_timeline.call(d);

			else if (d.datatype.match(/(lines|points|polygons)-timeline/))
				parse_vectors_csv.call(d);
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
		const arr = dscard.all.map(d => d.ds.mutant ? d.ds.host : d.ds);

		const layers = [].concat(...arr.map(d => d._layers));
		await Promise.all(layers.map(i => until(_ => MAPBOX.getLayer(i))));

		for (let i = 0; i < layers.length; i++) {
			MAPBOX.moveLayer(
				layers[i],
				(i === 0) ? MAPBOX.first_symbol : layers[i-1],
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

		// this should not be here. waiting for commit().
		//
		timeline_visibility();
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

	set config(c) {
		if (and(!c, sessionStorage['config']))
			c = JSON.parse(sessionStorage['config']);

		if (!c) return;

		config_load_datasets(c);

		const arr = c.datasets.filter(x => DST.get(x.name) || DST.get(x.id));
		arr.forEach(x => (DST.get(x.name) || DST.get(x.id)).active(true, true));

		cards_update();

		toggle_left_panel(c.tab);

		(async function() {
			await until(_ => DS.array.filter(d => d.loading).length === 0)
				.catch(_ => console.warn("Couldn't wait longer for loading datasets...", DS.array.filter(d => d.loading)));

			O.sort();

			if (c.zoom)
				MAPBOX.zoomTo(c.zoom);

			if (c.center?.length === 2)
				MAPBOX.setCenter(c.center);
		})();
	};

	get config() {
		return config_generate();
	}

	store_config() {
		sessionStorage.setItem('config', JSON.stringify(config_generate()));
	}

	get datasets() {
		return qsa('ds-card', qs('#cards-list'), true).map(c => c.ds);
	}
};

const output_preview = qs('#output-preview');

function timeline_visibility() {
	const timeline = qs('#timeline');

	if (!timeline) return;

	let v = '';

	const d = O.datasets[0];

	if (maybe(d, 'timeline')) ;
	else v = 'none';

	timeline.style.display = v;
};

function load_view() {
	const timeline = qs('#timeline');

	const {view, output} = U;

	(function special_layers() {
		if (!MAPBOX.getSource('output-source')) {
			MAPBOX.addSource('output-source', {
				"type":        'canvas',
				"canvas":      'output',
				"animate":     false,
				"coordinates": MAPBOX.coords,
			});
		}

		if (!MAPBOX.getLayer('output-layer')) {
			MAPBOX.addLayer({
				"id":     'output-layer',
				"source": 'output-source',
				"type":   'raster',
				"layout": {
					"visibility": "none",
				},
				"paint": {
					"raster-resampling": "nearest",
				},
			}, MAPBOX.first_symbol);
		}

		GEOGRAPHY.divisions.forEach((d,i) => {
			if (!MAPBOX.getSource(`filtered-source-${i}`)) {
				MAPBOX.addSource(`filtered-source-${i}`, {
					"type": 'geojson',
					"data": d.vectors.geojson,
				});
			}

			if (!MAPBOX.getLayer(`filtered-layer-${i}`)) {
				MAPBOX.addLayer({
					"id":     `filtered-layer-${i}`,
					"source": `filtered-source-${i}`,
					"type":   'fill',
					"layout": {
						"visibility": "none",
					},
					"paint": {
						"fill-color":         filtered_colors_array[i],
						"fill-outline-color": "black",
						"fill-opacity":       [ "case", [ "boolean", [ "get", "__visible" ], true ], 0.5, 0 ],
					},
				}, MAPBOX.first_symbol);
			}

			if (!MAPBOX.getSource(`priority-source-${i}`)) {
				if (i === 0) return;

				MAPBOX.addSource(`priority-source-${i}`, {
					"type": 'geojson',
					"data": json_clone(d.vectors.geojson),
				});
			}

			if (!MAPBOX.getLayer(`priority-layer-${i}`)) {
				if (i === 0) return;

				MAPBOX.addLayer({
					"id":     `priority-layer-${i}`,
					"source": `priority-source-${i}`,
					"type":   'fill',
					"layout": {
						"visibility": "none",
					},
					"paint": {
						"fill-color":         [ "get", "__fill" ],
						"fill-outline-color": "black",
						"fill-opacity":       1,
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

	function priority_visibility_pick() {
		const x = U.variant !== "raster";

		GEOGRAPHY.divisions.forEach((d,i) => {
			const t = +U.variant;

			if (MAPBOX.getLayer(`priority-layer-${i}`))
				MAPBOX.setLayoutProperty(`priority-layer-${i}`, 'visibility', x && (t === i) ? "visible" : "none");
		});
	};

	switch (view) {
	case "outputs": {
		indexes_list();

		analysis_plot_active(output, true)
			.then(a => {
				if (timeline) timeline.style.display = 'none';

				filtered_visibility('none');

				output_visibility(U.variant === 'raster' ? 'visible' : 'none');

				const t = U.variant;

				if (GEOGRAPHY.divisions[t])
					priority(GEOGRAPHY.divisions[t], a, t);

				priority_visibility_pick();
			});

		views_right_pane();

		output_preview.style.display = 'none';

		break;
	}

	case "inputs": {
		filtered_visibility('none');

		output_visibility('none');

		priority_visibility_pick();

		O.sort();

		analysis_plot_active(output, true);

		output_preview.style.display = '';

		views_right_pane();

		if (timeline) timeline_lines_update();

		break;
	}

	case "filtered": {
		if (timeline) timeline.style.display = 'none';

		filtered_visibility('visible');

		output_visibility('none');

		priority_visibility_pick();

		analysis_plot_active(output, true);

		filtered_valued_polygons();

		output_preview.style.display = '';

		views_right_pane();

		break;
	}

	default: {
		throw new Error(`Overlord: Could not set/find the view '${view}'`);
	}
	}

	cards_update();

	views_buttons();
};

function mapclick(e) {
	if (!INFOMODE) return;

	const et = MAPBOX.queryRenderedFeatures(e.point)[0];

	const ll = [e.lngLat.lng, e.lngLat.lat];
	const rc = coordinates_to_raster_pixel(ll, OUTLINE.raster);

	const [dict, props] = context(rc, et);

	COORDINATES.unshift({ "c": ll });

	qs('#points.search-panel').dispatchEvent(new Event('activate'));

	if (U.view === "outputs") {
		const ac = coordinates_to_raster_pixel(ll, {
			"data":   MAPBOX.getSource('output-source').raster,
			"nodata": -1,
		});

		if (Number.isFinite(maybe(ac, 'value'))) {
			dict.unshift(["_analysis_name", EAE['indexes'][U.output]['name']], null);
			props["_analysis_name"] = lowmedhigh_scale(ac.value);
		}
	}

	const td = table_data(dict, props, ll);

	mapbox_coords_search_pois({ "coords": ll, "limit": 1 })
		.then(r => {
			if (!r.length) return "";

			const pois = ce('div', null, { "id": "pois" });
			pois.append(ce('h5', "Points of interest"));

			r.forEach(f => pois.append(ce('div', f.name, { "class": "small" })));

			return pois;
		})
		.then(p => {
			const c = {
				"x": maybe(e, 'originalEvent', 'pageX'),
				"y": maybe(e, 'originalEvent', 'pageY'),
			};

			map_pointer(c, td, p);
		});
};

export function context(rc, f) {
	const dict = [];
	const props = {};

	if (!rc) return [dict, props];

	const controls = controls_list();

	const x = rc.index;
	const in0 = DS.all("on")[0];

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

function reset_features_visibility() {
	const fs = maybe(this, 'vectors', 'geojson');
	if (!fs) return;

	fs.features.forEach(f => f.properties['__visible'] = true);

	qsa('input[type="checkbox"]', this.card).forEach(c => c.checked = true);

	const source = MAPBOX.getSource(this.id);
	if (source) source.setData(fs);
	else console.debug("reset_features_visibility: could not find source '%s'. First load? -> OK.", this.id);
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
	switch (this.datatype) {
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

let analysis_count = 0;
export async function analysis_to_dataset(t) {
	const category = await API.get("categories", { "select": "*", "name": "eq.analysis" }, { "one": true });

	category.colorstops = analysis_colorscale.stops;

	analysis_count++;

	const a = await analysis(t);

	const url = URL.createObjectURL(new Blob([a.tiff], { "type": "application/octet-stream;charset=utf-8" }));

	const d = new DS({
		"name":            `analysis-${t}-` + analysis_count,
		"name_long":       `Analysis ${t.toUpperCase()} - ` + analysis_count,
		"datatype":        "raster",
		"category":        category,
		"processed_files": [{
			"func":     "raster",
			"endpoint": url,
		}],
		"source_files": [],
		"metadata":     {},
	});

	d.metadata.inputs = DS.all("on").map(d => d.id);

	await d._active(true, true);

	O.view = 'inputs';

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

	O.sort();

	cards_update();
};
