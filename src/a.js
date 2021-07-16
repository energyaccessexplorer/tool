import * as cards from './cards.js';

import * as controlssearch from './controls-search.js';

import * as geographiessearch from './geographies-search.js';

import * as vectorssearch from './vectors-search.js';

import * as analysissearch from './analysis-search.js';

import * as locationssearch from './locations-search.js';

import * as views from './views.js';

import * as indexes from './indexes.js';

import * as mapbox from './mapbox.js';

import {
	init as timeline_init,
	lines_draw as timeline_lines_draw,
	filter_valued_polygons as timeline_filter_valued_polygons,
} from './timeline.js';

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
	controlssearch.select_tab(qs('#controls-tab-all'), "all");

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
		.then(r => GEOGRAPHY.cca2 = maybe(r, 0, 'cca2'));

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

	MAPBOX = mapbox.init(O);
	MAPBOX.coords = mapbox.fit(GEOGRAPHY.envelope);

	await dsinit(GEOGRAPHY.id, U.inputs, U.pack);

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

	await Promise.all(U.inputs.map(i => {
		const d = DST.get(i);
		return d._active(true, false);
	})).then(_ => {
		cards.update();
		mapbox.change_theme(ea_settings.mapbox_theme, false);
	});

	ea_loading(false);
};

export function toggle_left_panel(t) {
	for (const m of qsa('.nanny-marker')) m.remove();

	for (const e of qsa('#left-pane > div'))
		e.style.display = 'none';

	qs('#drawer').style.display = 'block';

	if (t) {
		const p = document.getElementById(t);
		p.style.display = '';

		const i = p.querySelector('.search-input');
		if (i) i.focus();

		const e = new Event('activate');
		p.dispatchEvent(e);
	}

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
 *
 * returns DS[]
 */

async function dsinit(id, inputs, pack) {
	let select = ["*", "datatype", "category:categories(*)"];

	const divisions = maybe(GEOGRAPHY.configuration, 'divisions');

	await (function fetch_outline() {
		// TODO: this should be more strict divisions 0/outline
		const outline_id = maybe(divisions.find(d => d.dataset_id), 'dataset_id');

		if (!outline_id) {
			const m = `
Failed to get the geography's OUTLINE.
This is fatal. Thanks for all the fish.`;

			ea_super_error("Geography error", m);

			throw Error("No OUTLINE. Ciao.");
		}

		const bp = {
			"id": `eq.${outline_id}`,
			"select": select,
		};

		return ea_api.get("datasets", bp, { one: true })
			.then(async e => {
				const ds = OUTLINE = new DS(e);

				await ds.load('vectors');
				await ds.load('raster');
			});
	})();

	await (function fetch_divisions() {
		return Promise.all(
			divisions.filter(x => x.dataset_id).slice(1).map(x => {
				const dp = {
					"id": `eq.${x.dataset_id}`,
					"select": select,
				};

				return ea_api.get("datasets", dp, { one: true })
					.then(async e => {
						const ds = new DS(e);

						await ds.load('csv');
						await ds.load('vectors');
						await ds.load('raster');
					});
			})
		);
	})();

	await (function fetch_datasets() {
		pack = maybe(pack, 'length') ? pack : 'all';

		const nd = divisions.filter(d => d.dataset_id).map(d => d.dataset_id).concat(OUTLINE.dataset_id);
		const p = {
			"geography_id": `eq.${id}`,
			"select": select,
			"pack": `eq.${pack}`,
			"deployment": `ov.{${ENV}}`,
			"id": `not.in.(${nd})`,
		};

		return ea_api.get("datasets", p)
			.then(r => r.map(e => new DS(e)));
	})();

	U.params.inputs = [...new Set(DS.array.map(e => e.id))];

	// We need all the datasets to be initialised _before_ setting
	// mutant/collection attributes (order is never guaranteed)
	//
	DS.array.filter(d => d.mutant).forEach(d => d.mutant_init());
	DS.array.filter(d => d.items).forEach(d => d.items_init());
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

		mapbox.pointer(
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

export function divisions_rows_tier(r, et) {
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
	controlssearch.select_tab(qs('#controls-tab-census'), "census");
	ea_modal.hide();

	O.view = U.view;

	ea_nanny.start();
};

// TODO: used in an onclick attribute
window.ea_nanny_force_start = nanny_force;

// TODO: the following are used by overlord. delete them.
window.load_view = load_view;
window.map_click = map_click;
