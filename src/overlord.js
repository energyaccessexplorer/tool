import DS from './ds.js';

import {
	polygons_csv as parse_polygons_csv,
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

	dataset(_ds, arg, data) {
		let ds;

		switch (_ds.constructor.name) {
		case "DS":
			ds = _ds;
			break;

		case "String":
			ds = DST.get(_ds);
			break;

		default:
			console.error("O.dataset: Do not know what to do with", _ds);
			throw Error("O.dataset: ArgumentError.");
		}

		if (!ds) throw Error("ds was never set...");

		switch (arg) {
		case "domain": {
			ds._domain = data;
			break;
		}

		case "weight": {
			ds.weight = data;
			break;
		}

		case "active": {
			ds.active(data, ['inputs', 'timeline'].includes(U.view));

			let arr = U.inputs;
			if (ds.on) arr.unshift(ds.id);
			else arr.splice(arr.indexOf(ds.id), 1);

			O.datasets = arr;

			timeline_lines_update();
			break;
		}

		case "mutate": {
			this.layers();
			break;
		}

		case "disable":
		default:
			break;
		}

		load_view();
	};

	set datasets(arr) {
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

	map(interaction, event, id) {
		const ds = DST.get(id);

		switch (interaction) {
		case "click":
			map_click.call(ds, event);
			break;

		case "dblclick":
			map_dblclick.call(ds, event);
			break;

		case "zoomend":
			map_zoomend.call(ds, event);
			break;

		default:
			break;
		}
	};

	sort() {
		const ds = U.inputs.map(i => {
			const d = DST.get(i);
			return d.mutant ? d.host.id : d.id;
		});

		Promise.all(ds.map(d => until(_ => DST.get(d).layer)))
			.then(_ => {
				for (let i = 0; i < ds.length; i++)
					MAPBOX.moveLayer(ds[i], ds[i-1] || MAPBOX.first_symbol);
			});
	};

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

			mapbox.dblclick('filtered-layer');
			mapbox.zoomend('filtered-layer');
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
		delay(1).then(O.sort); // TODO: remove/revisit this hack

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
		delay(1).then(O.sort); // TODO: remove/revisit this hack

		break;
	}

	default: {
		throw `Argument Error: Overlord: Could not set/find the view '${view}'.`;
	}
	}

	views.buttons();
	views.right_pane();
};

function map_click(e) {
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

		divisions_rows_tier.call(this, r, et);

		if (this.config.attributes_map)
			this.config.attributes_map.forEach(e => r.dict.push([e.dataset, e.target]));

		return r;
	};

	function click(fn) {
		if (!INFOMODE) return;

		const rc = coordinates_to_raster_pixel([e.lngLat.lng, e.lngLat.lat], t.raster);

		const {dict, props, et} = fn(rc);

		const s = maybe(et, 'source');
		analysis_context(rc, dict, props, (!s || (s === inp)) ? t.id : null);

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

		if (maybe(et, 'properties', 'District'))
			U.subgeoname = et.properties['District'];

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

function map_dblclick(e) {
	if (INFOMODE) return;

	if (e.features.length > 0) {
		mapbox.fit(geojsonExtent(e.features[0]), true);

		const s = U.subgeo = e.features[0].id;

		this._domain = s === null ?
			Object.assign({}, this.domain) :
			{ min: s, max: s };

		O.view = U.view;
	}
};

function map_zoomend(_) {
	if (same(this._domain, this.domain)) return;

	this._domain = Object.assign({}, this.domain);
	U.subgeo = '';
	O.view = U.view;
};

function divisions_rows_tier(r, et) {
	GEOGRAPHY.configuration.divisions
		.filter((b,i) => (i !== 0) && i === maybe(this.config, 'divisions_tier'))
		.forEach(b => {
			const ds = DS.array.find(d => d.dataset_id === b.dataset_id);

			if (!maybe(ds, 'csv', 'data')) return;

			const t = ds.csv.data.find(e => +e[ds.config.csv_columns.id] === +et.properties[this.vectors.key]);
			if (!t) return;

			r.dict.push(["_" + b.name, b.name]);
			r.props["_" + b.name] = t[ds.config.csv_columns.value];
		});
};
