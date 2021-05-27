import * as cards from './cards.js';

import * as controls from './controls.js';

import * as controlssearch from './controls-search.js';

import * as geographiessearch from './geographies-search.js';

import * as vectorssearch from './vectors-search.js';

import * as analysissearch from './analysis-search.js';

import * as locationssearch from './locations-search.js';

import * as views from './views.js';

import * as indexes from './indexes.js';

import {
	init as timeline_init,
	lines_draw as timeline_lines_draw,
	filter_valued_polygons as timeline_filter_valued_polygons,
} from './timeline.js';

import {
	fit as mapbox_fit,
	init as mapbox_init,
	change_theme as mapbox_change_theme,
	pointer as mapbox_pointer,
	zoomend as mapbox_zoomend,
	dblclick as mapbox_dblclick,
} from './mapbox.js';

import {
	context as analysis_context,
	plot_active as analysis_plot_active,
} from './analysis.js';

import DS from './ds.js';

import Overlord from './overlord.js';

const UProxyHandler = {
	get: function(o,p) {
		const i = o.url.searchParams.get(p);

		let v;
		switch (p) {
		case "params": {
			v = o.params;
			break;
		}

		case "inputs": {
			if (!i || i === "") v = [];
			else v = i.split(',').filter(e => o.params.inputs.indexOf(e) > -1);
			break;
		}

		case "subgeo": {
			const x = parseInt(i);
			v = (isNaN(x)) ? null : x;
			break;
		}

		default: {
			v = (i === "" ? null : i);
			break;
		}
		}

		return v;
	},

	set: function(o,t,v) {
		switch (t) {
		case "output":
		case "view": {
			if (!o.params[t].includes(v)) v = o.params[t][0];
			o.url.searchParams.set(t,v);
			break;
		}

		case "timeline": {
			o.url.searchParams.set(t, v || GEOGRAPHY.timeline_dates.slice(-1)[0]);
			break;
		}

		case "subgeo":
		case "subgeoname":
		case "pack": {
			o.url.searchParams.set(t,v);
			break;
		}

		case "inputs": {
			o.url.searchParams.set(t, [...new Set(v)]);
			break;
		}

		case "params": {
			for (let p in v) {
				if (!o.params[p].includes(v[p])) continue;
				o.url.searchParams.set(p, v[p]);
			}
			break;
		}

		default: {
			throw TypeError(`U: I'm not allowed to set '${t}'`);
		}
		}

		history.replaceState(null, null, o.url);

		return true;
	}
};

function layout() {
	if (maybe(GEOGRAPHY, 'timeline'))
		qs('#visual').append(ce('div', null, { id: 'timeline' }));

	const n = qs('nav');
	const p = qs('#playground');
	const w = qs('#mobile-switcher');

	const m = qs('#maparea', p);
	const b = qs('#mapbox-container', m);
	const v = qs('#views', m);
	const t = qs('#timeline');

	const l = qs('#left-pane', p);
	const d = qs('#drawer', p);
	const g = qs('#geographies', p);

	const r = qs('#right-pane', p);

	function set_heights() {
		const h = window.innerHeight - n.clientHeight - (MOBILE ? w.clientHeight : 0);

		p.style['height'] =
      l.style['height'] =
      g.style['height'] =
      m.style['height'] =
      b.style['height'] =
      d.style['height'] =
      r.style['height'] = h + "px";

		b.style['height'] = (h - (MOBILE ? v.clientHeight : 0)) + "px";

		if (t) b.style['height'] = m.style['height'] = h - t.clientHeight + "px";
	};

	if (MOBILE) m.style['width'] = screen.width + "px";

	const oc = tmpl('#bottom-right-container-output-template');
	const gc = tmpl('#bottom-right-container-graphs-template');

	if (GEOGRAPHY.timeline) {
		qs('#filtered-pane').append(oc);
		qs('#cards-pane').append(gc);
	} else {
		qs('#cards-pane').append(oc);
	}

	document.body.onresize = set_heights;
	set_heights();
};

function mobile() {
	controls.select_tab(qs('#controls-tab-all'), "all");

	for (let el of qsa('.controls-subbranch')) {
		elem_collapse(qs('.controls-container', el), el);
	}

	const switcher = qs('#mobile-switcher');

	const svgcontrols = ce('div', font_icon('list-task'), { bind: 'controls', ripple: "" });
	const map = ce('div', font_icon('globe'), { bind: 'map', ripple: "" });
	const inputs = ce('div', font_icon('layers-fill'), { bind: 'inputs', ripple: "" });
	const outputs = ce('div', font_icon('pie-chart-fill'), { bind: 'outputs', ripple: "" });

	const tabs = [svgcontrols, map, inputs, outputs];

	function mobile_switch(v) {
		switch (v) {
		case 'controls':{
			for (let e of ['#left-pane'])
				qs(e).style.display = '';

			for (let e of ['#right-pane', '#views'])
				qs(e).style.display = 'none';

			break;
		}

		case 'right': {
			for (let e of ['#left-pane'])
				qs(e).style.display = 'none';

			for (let e of ['#right-pane'])
				qs(e).style.display = '';

			break;
		}

		case 'outputs':
		case 'inputs': {
			for (let e of ['#left-pane'])
				qs(e).style.display = 'none';

			for (let e of ['#right-pane'])
				qs(e).style.display = '';

			U.view = v;

			views.right_pane();
			views.buttons();
			break;
		}

		case 'map':
		default: {
			for (let e of ['#right-pane', '#left-pane', '#views'])
				qs(e).style.display = 'none';

			for (let e of ['#views'])
				qs(e).style.display = '';

			break;
		}
		}
	};

	for (let e of tabs) {
		e.onclick = function(_) {
			for (let t of tabs) t.classList.remove('active');

			mobile_switch(this.getAttribute('bind'));
			e.classList.add('active');
		};

		switcher.append(e);
	}

	map.click();
};

export async function init() {
	const url = new URL(location);
	const id = url.searchParams.get('id');

	GEOGRAPHY = await ea_api.get("geographies", { "id": `eq.${id}` }, { one: true });
	GEOGRAPHY.timeline = maybe(GEOGRAPHY, 'configuration', 'timeline');
	GEOGRAPHY.timeline_dates = maybe(GEOGRAPHY, 'configuration', 'timeline_dates');

	fetch(`https://world.energyaccessexplorer.org/countries?select=cca2&cca3=eq.${GEOGRAPHY.cca3}`)
		.then(r => r.json())
		.then(r => GEOGRAPHY.cca2 = r[0]['cca2']);

	if (location.hostname.match(/^www/))
		ENV = "production";
	else if (location.hostname.match(/^staging/))
		ENV = "staging";
	else if (location.hostname.match(/localhost/))
		ENV = ["production", "staging"];

	let params = 'default';

	if (GEOGRAPHY.timeline)
		params = 'timeline';

	MOBILE = screen.width < 1152;
	layout();

	U = new Proxy({ url: url, params: ea_params[params] }, UProxyHandler);
	O = new Overlord();

	MAPBOX = mapbox_init(O, U);

	await dsinit(GEOGRAPHY.id, U.inputs, U.pack, bounds => {
		MAPBOX.coords = mapbox_fit(bounds);
		mapbox_change_theme(ea_settings.mapbox_theme);
	});

	O.index = U.output;

	cards.init();
	controlssearch.init();
	geographiessearch.init();
	vectorssearch.init();
	analysissearch.init();
	locationssearch.init();

	if (MOBILE) mobile();

	views.init();
	indexes.init();

	drawer_init();
	toggle_left_panel();

	if (GEOGRAPHY.timeline) timeline_init();

	if (!MOBILE && !GEOGRAPHY.timeline) nanny_init();

	ea_loading(false);
};

export function toggle_left_panel(t) {
	for (const m of qsa('.nanny-marker')) m.remove();

	for (const e of qsa('#left-pane > div'))
		e.style.display = 'none';

	qs('#drawer').style.display = 'block';

	if (t) document.getElementById(t).style.display = '';
	document.querySelector('#left-pane').style['min-width'] = t ? '40em' : '';

	window.dispatchEvent(new Event('resize'));
};

function drawer_init() {
	const as = qsa('#drawer a');

	for (const a of as)
		a.onclick = function() {
			for (const x of as) if (x !== this) x.classList.remove('active');

			if (this.classList.contains('active')) {
				this.classList.remove('active');
				toggle_left_panel();
			} else {
				toggle_left_panel(this.getAttribute('for'));
				this.classList.add('active');
			}
		};

	toggle_left_panel();
};

/*
 * dsinit
 *
 * 1. fetch the datasets list from the API
 * 2. generate DS objects
 * 3. initialise mutants and collections
 *
 * @param "id" uuid
 * @param "inputs" string[] with DS.id's
 * @param "pack" string ("all" ...)
 * @param "callback" function to run with the boundaries
 *
 * returns DS[]
 */

async function dsinit(id, inputs, pack, callback) {
	let select = ["*", "category:categories(*)", "df:_datasets_files(*,file:files(*))"];

	let bounds;
	let boundaries_id;

	await ea_api.get("geography_boundaries", { "geography_id": `eq.${id}` }, { one: true })
		.catch(_ => {
		const m = `
Failed to get the geography's BOUNDARIES.
This is fatal. Thanks for all the fish.`;

		ea_super_error("Geography error", m);

			throw Error("No 'boundaries' dataset. Ciao.");
		})
		.then(r => boundaries_id = r.id);

	const bp = {
		"id": `eq.${boundaries_id}`,
		"select": select,
		"df.active": "eq.true"
	};

	await ea_api.get("datasets", bp, { one: true })
		.then(async e => {
			const ds = new DS(e, false);
			BOUNDARIES = ds;

			await ds.load('csv');
			await ds.load('vectors');
			await ds.load('raster');

			if (!(bounds = ds.vectors.bounds))
				throw `'BOUNDARIES' has no vectors.bounds`;

			const c = ds.config;
			if (c.column_name) {
				GEOGRAPHY.boundaries = {};

				for (const r of ds.csv.data)
					GEOGRAPHY.boundaries[r[c.column]] = r[c.column_name];
			}
		});

	pack = maybe(pack, 'length') ? pack : 'all';

	const p = {
		"geography_id": `eq.${id}`,
		"select": select,
		"pack": `eq.${pack}`,
		"df.active": "eq.true",
		"envs": `ov.{${ENV}}`,
	};

	await ea_api.get("datasets", p)
		.then(r => r.filter(d => d.id !== BOUNDARIES.dataset_id))
		.then(r => r.map(e => new DS(e, inputs.includes(e.category.name))));

	U.params.inputs = [...new Set(DS.array.map(e => e.id))];

	// We need all the datasets to be initialised _before_ setting
	// mutant/collection attributes (order is never guaranteed)
	//
	DS.array.filter(d => d.mutant).forEach(d => d.mutant_init());
	DS.array.filter(d => d.items).forEach(d => d.items_init());

	const [left, bottom, right, top] = bounds;
	GEOGRAPHY.bounds = { left, bottom, right, top };

	const r = BOUNDARIES.raster;
	const w = d3.scaleLinear().domain([0,r.width]).range([left,right]);
	const h = d3.scaleLinear().domain([0,r.height]).range([top,bottom]);

	GEOGRAPHY.raster_coords = (x,y) => [w(x), h(y)];

	callback(bounds);
};

function load_view() {
	const timeline = qs('#timeline');

	const {view, output, inputs} = U;

	function special_layers() {
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
				"data": BOUNDARIES.vectors.features
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

			mapbox_dblclick('filtered-layer');
			mapbox_zoomend('filtered-layer');
		}
	};

	special_layers();

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

	const i = maybe(inputs, 0);

	let t;

	function feature_info(et) {
		let r = {
			dict: [],
			props: et.properties,
		};

		if (this.category.name === 'boundaries' ||
				this.category.name.match(/^(timeline-)?indicator/)) {
			r.dict.push(["_boundaries_name", GEOGRAPHY.configuration.boundaries_name || "Geography Name"]);
			r.props["_boundaries_name"] = GEOGRAPHY.boundaries[et.properties[this.vectors.key]];
		}

		if (this.config.column && this.category.name !== 'boundaries') {
			r.dict.push(["_" + this.config.column, this.name]);
			r.props["_" + this.config.column] = this.csv.table[et.properties[this.vectors.key]];
		}

		if (this.config.attributes_map) {
			r.dict = r.dict.concat(this.config.attributes_map.map(e => [e.dataset, e.target]));
		}

		return r;
	};

	function click(fn) {
		const b = BOUNDARIES;

		const rc = ea_coordinates_in_raster(
			[e.lngLat.lng, e.lngLat.lat],
			GEOGRAPHY.bounds,
			{
				data: t.raster.data,
				width: t.raster.width,
				height: t.raster.height,
				nodata: b.raster.nodata
			}
		);

		let f = fn(rc);
		if (!f) return;

		const {dict, props, et} = f;

		const s = maybe(et, 'source');
		analysis_context(rc, dict, props, (!s || (s === i)) ? t.id : null);

		const td = table_data(dict, props);

		table_add_lnglat(td, [e.lngLat.lng, e.lngLat.lat]);

		mapbox_pointer(
			td,
			e.originalEvent.pageX,
			e.originalEvent.pageY
		);
	};

	function vectors() {
		if (!INFOMODE) return;

		const et = MAPBOX.queryRenderedFeatures(e.point)[0];

		let dict = [
			["value", t.name],
			["_empty", null]
		];

		let props = null;

		if (!et || et.source !== i) {
			props = {
				"value": `none under these coordinates`,
				"_empty": ""
			};
		}

		else if (et.source === i) {
			const fi = feature_info.call(t, et);
			dict = fi.dict;
			props = fi.props;

			dict.push(["_empty", null]);
			props["_empty"] = "";
		}

		return {dict, props, et};
	};

	function vectors_timeline() {
		// TODO: refactor this to use vectors()
		//
		const et = MAPBOX.queryRenderedFeatures(e.point)[0];

		let dict = [
			["value", t.name],
			["_empty", null]
		];

		let props = null;

		if (maybe(et, 'properties', 'District'))
			U.subgeoname = et.properties['District'];

		timeline_lines_draw();

		if (maybe(et, 'source') === i) {
			const fi = feature_info.call(t, et);
			dict = fi.dict;
			props = fi.props;

			dict.push(["_empty", null]);
			props["_empty"] = "";
		}

		return {dict, props, et};
	};

	function raster(rc) {
		if (!INFOMODE) return;

		let dict, props;

		if (typeof maybe(rc, 'value') === 'number' &&
        rc.value !== t.raster.nodata) {
			const v = rc.value;

			const vv = (v%1 === 0) ? v : v.toFixed(2);

			dict = [
				["value", t.name],
				["_empty", null]
			];

			props = {
				"value": `${vv} <code>${t.category.unit || ''}</code>`,
				"_empty": ""
			};
		}
		else {
			console.log("No value (or nodata value) on raster.", rc);
		}

		return {dict, props};
	};

	function analysis_click() {
		const b = BOUNDARIES;

		const rc = ea_coordinates_in_raster(
			[e.lngLat.lng, e.lngLat.lat],
			GEOGRAPHY.bounds,
			{
				data: t.raster.data,
				width: b.raster.width,
				height: b.raster.height,
				nodata: -1
			}
		);

		if (typeof maybe(rc, 'value') === 'number') {
			const dict = [
				["aname", t.name],
				["_empty", null]
			];

			const props = {
				"aname": ea_lowmedhigh_scale(rc.value),
				"_empty": ""
			};

			analysis_context(rc, dict, props);

			const td = table_data(dict, props);

			table_add_lnglat(td, [e.lngLat.lng, e.lngLat.lat]);

			mapbox_pointer(
				td,
				e.originalEvent.pageX,
				e.originalEvent.pageY
			);
		}

		else {
			console.log("No value on raster.", rc);
		}
	};

	if (view === "outputs") {
		if (!INFOMODE) return;

		t = {
			raster: {
				data: MAPBOX.getSource('output-source').raster
			},
			category: {},
			name: ea_indexes[output]['name']
		};

		analysis_click();
	}

	else if (view === "inputs") {
		t  = DST.get(i);

		if (!t) return;

		if (t.vectors) click(vectors);
		else if (t.raster.data) click(raster);
	}

	else if (view === "timeline") {
		t  = DST.get(i);

		if (!t) return;

		if (t.vectors) click(vectors_timeline);
		else if (t.raster.data) click(raster);
	}
};

function nanny_init() {
	window.ea_nanny = new nanny(ea_nanny_steps);

	if (![null, "inputs"].includes(U.view)) return;
	if (U.inputs.length > 0) return;

	const w = localStorage.getItem('needs-nanny');
	if (!w || !w.match(/false/)) ea_nanny.start();
};

function nanny_force() {
	U.params = {
		inputs: [],
		output: 'eai',
		view: 'inputs'
	};

	DS.array.filter(d => d.on).forEach(d => d.active(false, false));

	O.view = 'inputs';
	controls.select_tab(qs('#controls-tab-census'), "census");
	ea_modal.hide();

	O.view = U.view;

	ea_nanny.start();
};

// TODO: used in an onclick attribute
window.ea_nanny_force_start = nanny_force;

// TODO: the following are used by overlord. delete them.
window.load_view = load_view;
window.map_click = map_click;
