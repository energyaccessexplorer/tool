import DS from './ds.js';

import {
	polygons_csv as parse_polygons_csv,
	reset_features_visibility,
} from './parse.js';

import {
	lines_update as timeline_lines_update,
	lines_draw as timeline_lines_draw,
	filter_valued_polygons as timeline_filter_valued_polygons,
} from './timeline.js';

import {
	plot_active as analysis_plot_active,
} from './analysis.js';

import * as mapbox from './mapbox.js';

import * as indexes from './indexes.js';

import * as cards from './cards.js';

import * as views from './views.js';

import {
	list as controls_list,
} from './controls.js';

export default class Overlord {
	layers() {
		Promise.all(U.inputs.map(id => DST.get(id).active(true, ['inputs', 'timeline'].includes(U.view))));
	};

	ds(d, data) {
		if (!(d instanceof DS))
			throw Error("O.ds: Expected a DS as input:", d);

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

			case "disable":
				break;

			default:
				console.warn(`O.ds: Ignoring garbage argument '${k}' for`, d);
				break;
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

		case "dblclick": {
			if (INFOMODE) break;

			mapbox.fit(geojsonExtent(et));

			U.subdiv = et.id;
			U.divtier = coalesce(maybe(ds, 'config', 'divisions_tier'), 0);
			O.view = U.view;

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

		await Promise.all(arr.map(d => until(_ => d.layer)));

		for (let i = 0; i < arr.length; i++) {
			MAPBOX.moveLayer(
				arr[i].id,
				(i === 0) ? MAPBOX.first_symbol : arr[i-1].id
			);
		}
	};

	info_mode() {
		mapbox.info_mode_change();
	}

	async theme_changed() {
		await until(_ => MAPBOX.isStyleLoaded());

		await DS.array
			.filter(d => d.on)
			.forEach(d => {
				d.loaded = false;
				d.loadall();
			});

		O.view = U.view;
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

		if (!GEOGRAPHY.timeline) return;

		if (!MAPBOX.getSource('filtered-source')) {
			MAPBOX.addSource('filtered-source', {
				"type": 'geojson',
				"data": GEOGRAPHY.divisions[1].vectors.features
			});
		}

		if (!MAPBOX.getLayer('filtered-layer')) {
			MAPBOX.addLayer({
				"id": 'filtered-layer',
				"source": 'filtered-source',
				"type": 'fill',
				"layout": {
					"visibility": "none",
				},
				"paint": {
					"fill-color": "#0571B0",
					"fill-outline-color": "black",
					"fill-opacity": [ "case", [ "boolean", [ "get", "__visible" ], true ], 1, 0 ]
				},
			}, MAPBOX.first_symbol);
		}
	})();

	switch (view) {
	case "outputs": {
		indexes.list();

		analysis_plot_active(output, true)
			.then(_ => {
				if (timeline) timeline.style.display = 'none';

				if (MAPBOX.getLayer('filtered-layer'))
					MAPBOX.setLayoutProperty('filtered-layer', 'visibility', 'none');

				MAPBOX.setLayoutProperty('output-layer', 'visibility', 'visible');
			});
		break;
	}

	case "inputs": {
		if (MAPBOX.getLayer('output-layer'))
			MAPBOX.setLayoutProperty('output-layer', 'visibility', 'none');

		cards.update(inputs);
		O.sort();

		analysis_plot_active(output, false);

		break;
	}

	case "filtered": {
		if (timeline) timeline.style.display = 'none';

		MAPBOX.setLayoutProperty('filtered-layer', 'visibility', 'visible');
		MAPBOX.setLayoutProperty('output-layer', 'visibility', 'none');

		analysis_plot_active(output, true);

		timeline_filter_valued_polygons();
		break;
	}

	case "timeline": {
		if (timeline) timeline.style.display = '';

		MAPBOX.setLayoutProperty('filtered-layer', 'visibility', 'none');
		MAPBOX.setLayoutProperty('output-layer', 'visibility', 'none');

		timeline_lines_update();

		cards.update(inputs);
		O.sort();

		break;
	}

	default: {
		throw `Argument Error: Overlord: Could not set/find the view '${view}'.`;
	}
	}

	views.buttons();
	views.right_pane();
};

function mapclick(e) {
	const {view, inputs, output} = U;

	const inp = maybe(inputs, 0);

	let t;

	let dict = [];
	let props = {};

	function tier_rows(v) {
		if (GEOGRAPHY.divisions.length < 2) return;

		dict.push(null);

		GEOGRAPHY
			.divisions
			.map((d,i) => {
				if (i === 0) return;

				const t = d.csv.table[d.raster.data[v]];
				if (!t) return;

				dict.push(["_" + d.name, d.name]);
				props["_" + d.name] = t;
			});
	};

	function click(fn) {
		if (!INFOMODE) return;

		const et = MAPBOX.queryRenderedFeatures(e.point)[0];

		const rc = coordinates_to_raster_pixel([e.lngLat.lng, e.lngLat.lat], t.raster);

		fn(rc, et);

		const s = maybe(et, 'source');
		context(rc, dict, props, (!s || (s === inp)) ? t.id : null);

		tier_rows(rc.index);

		const td = table_data(dict, props);

		table_add_lnglat(td, [e.lngLat.lng, e.lngLat.lat]);

		map_pointer(
			td,
			e.originalEvent.pageX,
			e.originalEvent.pageY
		);
	};

	function vectors(_, et) {
		if (et) Object.assign(props, et.properties);

		timeline_lines_draw();

		if (maybe(et, 'source') === inp) {
			if (and(maybe(t, 'csv', 'key'), t.category.name !== 'boundaries')) {
				const v = t.csv.table[et.properties[t.vectors.key]];

				if (v ?? false) {
					dict.push(["_" + t.csv.key, t.name]);
					props["_" + t.csv.key] = v + " " + (t.category.unit || "km (proximity to)");
				} else return;
			}

			if (maybe(t.config, 'attributes_map', 'length'))
				t.config.attributes_map.forEach(e => dict.push([e.dataset, e.target]));
		} else {
			dict.push(["value", t.name]);
			props['value'] = "none under these coordinates";
		}

		dict.push(null);
	};

	function raster(rc, _) {
		if (typeof maybe(rc, 'value') === 'number' &&
        rc.value !== t.raster.nodata) {
			const v = rc.value;

			const vv = (v%1 === 0) ? v : v.toFixed(2);

			dict.push(["value", t.name]);
			props["value"] = `${vv} <code>${t.category.unit || ''}</code>`;
		}
	};

	function analysis(rc, _) {
		if (typeof maybe(rc, 'value') === 'number') {
			dict = dict.concat([
				["aname", t.name],
				null
			]);

			props = {
				"aname": ea_lowmedhigh_scale(rc.value),
			};
		}
	};

	if (view === "outputs") {
		if (!INFOMODE) return;

		t = {
			raster: {
				data: MAPBOX.getSource('output-source').raster,
				nodata: -1,
			},
			category: {},
			name: ea_indexes[output]['name']
		};

		click(analysis);
	}

	else if (or(view === "timeline",
	            view === "inputs")) {
		t = DST.get(inp);

		if (!t) return;

		if (t.vectors) click(vectors);
		else if (t.raster.data) click(raster);
	}
};

function context(rc, dict, props, skip = null) {
	if (!rc) return [];

	const controls = controls_list();

	DS.array
		.filter(d => and(d.on,
		                 d.category.name !== 'outline',
		                 d.category.name !== 'boundaries',
		                 d.id !== skip))
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

			if ((v + "").match('[0-9]\\.[0-9]{3}'))
				v = v.toFixed(2);

			if (v === d.raster.nodata) return;

			if (maybe(d, 'csv', 'key')) { // (!d.category.name.match(/^(timeline-)?indicator/))
				p = "_analysis_" + p + "_" + d.csv.key;
				v = d.csv.table[v];
			}

			if (v ?? false) {
				dict.push([p, d.name]);
				props[p] = v + " " + (d.category.unit || "km (proximity to)");
			}
		});
};
