import * as cards from './cards.js';

import * as controlssearch from './controls-search.js';

import * as geographiessearch from './geographies-search.js';

import * as vectorssearch from './vectors-search.js';

import * as analysissearch from './analysis-search.js';

import * as locationssearch from './locations-search.js';

import * as views from './views.js';

import * as indexes from './indexes.js';

import * as mapbox from './mapbox.js';

import * as config from './config.js';

import {
	init as nanny_init,
} from './nanny-steps.js';

import {
	init as timeline_init,
} from './timeline.js';

import {
	analysis,
} from './analysis.js';

import {
	select_tab as controls_select_tab,
} from './controls-search.js';

import {
	intersect,
} from './rasters.js';

import DS from './ds.js';

import Overlord from './overlord.js';

const Uproxy = {
	get: function(url,p) {
		const i = url.searchParams.get(p);

		let v;
		switch (p) {
		case "inputs": {
			if (!i || i === "") v = [];
			else v = i.split(',').filter(e => PARAMS.inputs.indexOf(e) > -1);
			break;
		}

		case "subdiv":
		case "divtier": {
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

	set: function(url,t,v) {
		switch (t) {
		case "output":
		case "view": {
			if (!PARAMS[t].includes(v)) v = PARAMS[t][0];
			url.searchParams.set(t,v);
			break;
		}

		case "timeline": {
			url.searchParams.set(t, v || GEOGRAPHY.timeline_dates.slice(-1)[0]);
			break;
		}

		case "subdiv":
		case "divtier": {
			url.searchParams.set(t, parseInt(v) || 0);
			break;
		}

		case "pack": {
			url.searchParams.set(t,v);
			break;
		}

		case "inputs": {
			url.searchParams.set(t, [...new Set(v)]);
			break;
		}

		default: {
			throw TypeError(`U: I'm not allowed to set '${t}'`);
		}
		}

		history.replaceState(null, null, url);

		return true;
	}
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

	PARAMS = ea_params['default'];

	if (GEOGRAPHY.timeline)
		PARAMS = ea_params['timeline'];

	MOBILE = screen.width < 1152;
	layout();

	U = new Proxy(url, Uproxy);
	O = new Overlord();

	MAPBOX = mapbox.init(O);
	MAPBOX.coords = mapbox.fit(GEOGRAPHY.envelope);

	await dsinit(GEOGRAPHY.id, U.pack);

	const conf = localStorage.getItem('config');
	if (conf) {
		config.load(JSON.parse(conf));
		localStorage.removeItem('config');
	}

	U.inputs = U.inputs.slice(0); // cleanup non-existent ids

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

async function dsinit(id, pack) {
	let select = ["*", "datatype", "category:categories(*)"];

	const divisions = maybe(GEOGRAPHY.configuration, 'divisions').filter(d => d.dataset_id !== null);

	function exists(e) {
		return !!coalesce(DST.get(e.name));
	};

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
				if (exists(e)) return;

				const ds = OUTLINE = new DS(e);

				await ds.load('vectors');
				await ds.load('raster');

				ds.vectors.features.features[0].id = 0;
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
						if (exists(e)) return;

						const ds = new DS(e);

						await ds.load('csv');
						await ds.load('vectors');
						await ds.load('raster');
					});
			})
		);
	})();

	GEOGRAPHY.divisions = divisions.map(d => DS.array.find(t => t.dataset_id === d.dataset_id));

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
			.then(r => r.map(e => {
				if (exists(e)) return;

				new DS(e);
			}));
	})();

	PARAMS.inputs = [...new Set(DS.array.map(e => e.id))];

	// We need all the datasets to be initialised _before_ setting
	// mutant/collection attributes (order is never guaranteed)
	//
	DS.array.filter(d => d.mutant).forEach(d => d.mutant_init());
	DS.array.filter(d => d.items).forEach(d => d.items_init());
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

	document.body.onresize = function() {
		set_heights();
		if (t) t.dispatchEvent(new Event('resize'));
	};

	set_heights();
};

function mobile() {
	controls_select_tab(qs('#controls-tab-all'), "all");

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

export function toggle_left_panel(t) {
	for (let m of qsa('.bubblearrow-marker')) m.remove();

	for (let e of qsa('#left-pane > div'))
		e.style.display = 'none';

	qs('#drawer').style.display = 'block';

	if (t) {
		const p = document.getElementById(t);
		p.style.display = '';

		const i = qs('.search-input', p);
		if (i) i.focus();

		const e = new Event('activate');
		p.dispatchEvent(e);
	}

	qs('#left-pane').style['min-width'] = t ? '40em' : '';

	const rs = new Event('resize');

	window.dispatchEvent(rs);

	const tl = qs('#timeline');
	if (tl) tl.dispatchEvent(rs);
};

function drawer_init() {
	const as = qsa('#drawer a');

	let p;

	for (let a of as) {
		a.onclick = function() {
			for (let x of as) if (x !== this) x.classList.remove('active');

			if (this.classList.contains('active')) {
				this.classList.remove('active');
				toggle_left_panel();
			} else {
				toggle_left_panel(this.getAttribute('for'));
				this.classList.add('active');
			}
		};

		a.onmouseenter = function() {
			if (p) p.remove();

			p = bubblearrow(a, {
				position: "E",
				message: this.getAttribute('description'),
				close: false
			});
		};

		a.onmouseleave = function() {
			if (p) p.remove();
		};
	}

	toggle_left_panel();
};

let analysis_count = 0;

export async function analysis_to_dataset(t) {
	const category = await ea_api.get("categories", { "select": "*", "name": "eq.analysis" }, { one: true });

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
