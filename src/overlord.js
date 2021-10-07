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
	context as analysis_context,
} from './analysis.js';

import * as mapbox from './mapbox.js';

import * as indexes from './indexes.js';

import * as cards from './cards.js';

import * as views from './views.js';

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

				timeline_lines_update();
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
				"data": OUTLINE.vectors.features
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
					"fill-opacity": [ "case", [ "boolean", [ "get", "__hidden" ], false ], 0, 1 ]
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

	function feature_info(et) {
		let r = {
			dict: [],
			props: et.properties,
		};

		if (this.config.csv_columns) {
			r.dict.push(["_" + this.config.csv_columns.id, this.name]);

			if (this.category.name === 'boundaries')
				r.props["_" + this.config.csv_columns.id] = this.csv.data[et.properties[this.vectors.key]][this.config.csv_columns.value];
			else
				r.props["_" + this.config.csv_columns.id] = this.csv.table[et.properties[this.vectors.key]] + " " + this.category.unit;

			r.dict.push(null);
		}

		if (this.config.attributes_map)
			this.config.attributes_map.forEach(e => r.dict.push([e.dataset, e.target]));

		return r;
	};

	function tier_rows(v, dict, props) {
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

		const rc = coordinates_to_raster_pixel([e.lngLat.lng, e.lngLat.lat], t.raster);

		const {dict, props, et} = fn(rc);

		const s = maybe(et, 'source');
		analysis_context(rc, dict, props, (!s || (s === inp)) ? t.id : null);

		tier_rows(rc.index, dict, props);

		const td = table_data(dict, props);

		table_add_lnglat(td, [e.lngLat.lng, e.lngLat.lat]);

		map_pointer(
			td,
			e.originalEvent.pageX,
			e.originalEvent.pageY
		);
	};

	function vectors() {
		const et = MAPBOX.queryRenderedFeatures(e.point)[0];

		let dict = [
			["value", t.name],
		];

		let props = {};

		if (!et || et.source !== inp) {
			props['value'] = "none under these coordinates";
		}

		else if (et.source === inp) {
			const fi = feature_info.call(t, et);
			dict = fi.dict;
			props = fi.props;
		}

		return {dict, props, et};
	};

	function vectors_timeline() {
		// TODO: refactor this to use vectors()
		//
		const et = MAPBOX.queryRenderedFeatures(e.point)[0];

		let dict = [
			["value", t.name],
		];

		let props = {};

		timeline_lines_draw();

		if (maybe(et, 'source') === inp) {
			const fi = feature_info.call(t, et);
			dict = fi.dict;
			props = fi.props;

			dict.push(null);
		}

		return {dict, props, et};
	};

	function raster(rc) {
		let dict = [];
		let props = {};

		if (typeof maybe(rc, 'value') === 'number' &&
        rc.value !== t.raster.nodata) {
			const v = rc.value;

			const vv = (v%1 === 0) ? v : v.toFixed(2);

			dict = dict.concat([
				["value", t.name],
			]);

			props["value"] = `${vv} <code>${t.category.unit || ''}</code>`;
		}

		return {dict, props};
	};

	function analysis(rc) {
		let dict = [];
		let props = {};

		if (typeof maybe(rc, 'value') === 'number') {
			dict = dict.concat([
				["aname", t.name],
				null
			]);

			props = {
				"aname": ea_lowmedhigh_scale(rc.value),
			};
		}

		return {dict, props};
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

	else if (view === "inputs") {
		t  = DST.get(inp);

		if (!t) return;

		if (t.vectors) click(vectors);
		else if (t.raster.data) click(raster);
	}

	else if (view === "timeline") {
		t  = DST.get(inp);

		if (!t) return;

		if (t.vectors) click(vectors_timeline);
		else if (t.raster.data) click(raster);
	}
};
