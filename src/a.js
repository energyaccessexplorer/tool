import {
	vectors_csv as parse_vectors_csv,
	raster_timeline as parse_raster_timeline,
} from './parse.js';

import {
	loading,
	elem_collapse,
	super_error,
	bi_icon,
	self,
} from './utils.js';

import {
	analysis_dataset_intersect,
} from './complicated.js';

import {
	recount as controls_recount,
} from './controls.js';

import {
	init as controlssearch_init,
} from './controls-search.js';

import {
	init as geographiessearch_init,
	load as geographiessearch_load,
} from './geographies-search.js';

import {
	init as vectorssearch_init,
} from './vectors-search.js';

import {
	init as analysissearch_init,
} from './analysis-search.js';

import {
	init as locationssearch_init,
} from './locations-search.js';

import {
	init as points_init,
} from './points-loading.js';

import {
	priority,
	plot_active as analysis_plot_active,
} from './analysis.js';

import {
	lines_update as timeline_lines_update,
} from './timeline.js';

import {
	valued_polygons as filtered_valued_polygons,
	colors_array as filtered_colors_array,
} from './filtered.js';

import {
	buttons as views_buttons,
	init as views_init,
	right_pane as views_right_pane,
} from './views.js';

import {
	init as mapbox_init,
} from './mapbox.js';

import {
	init as cards_init,
	update as cards_update,
} from './cards.js';

import {
	init as indexes_init,
	list as indexes_list,
} from './indexes.js';

import {
	init as timeline_init,
} from './timeline.js';

import {
	run as qa_run,
} from './qa.js';

import {
	sort as mapbox_sort,
	fit as mapbox_fit,
} from './mapbox.js';

import DS from './ds.js';

import admintiers from './admin-tiers.js';

import bubblemessage from '../lib/bubblemessage.js';

COMMIT = debounce(function() {
	if (DEBUG || ENV.includes("test")) console.trace("commit!", ...arguments);

	if (!OUTLINE.raster.data) {
		console.warn("waiting for OUTLINE...");
		COMMIT();

		return;
	}

	reload(...arguments);

	window.dispatchEvent(new Event('resize'));
}, 300);

function state_get(conf, p) {
	switch (p) {
	case "tab":
	case "subdiv":
	case "divtier":
	case "index":
	case "variant":
	case "center":
	case "zoom":
	case "timeline":
	case "view": {
		return conf[p];
	}

	case "config": {
		return conf;
	}

	case "datasets": {
		return conf.datasets.map(d => DST.get(d.id));
	}

	default: {
		throw new Error(`Unknown attribute '${p}'`);
	}
	}
};

function state_set(conf, p, v) {
	switch (p) {
	case "tab": {
		if (!['controls', 'cards', 'vectors', 'analysis', 'geographies', 'locations', 'points', 'config'].includes(v))
			return false;

		break;
	}

	case "subdiv": {
		if (v >= 0) break;
		return false;
	}

	case "divtier": {
		if (and(v >= 0, v < 10)) break;
		return false;
	}

	case "variant": {
		if (v === "raster") break;
		if ([1, 2, 3, 4, 5, 6, 7, 8, 9].includes(+v)) {
			v = +v;
			break;
		}

		return false;
	}

	case "index": {
		if (['eai', 'ani', 'demand', 'supply'].includes(v)) break;
		return false;
	}

	case "view": {
		if (['data', 'filtered', 'analysis'].includes(v)) break;
		return false;
	}

	case "datasets": {
		if (v.every(d => d instanceof DS)) {
			v = unique(v);
			break;
		}
		return false;
	}

	case "zoom": {
		if (and(v >= 0, v <= 20)) break;
		return false;
	}

	case "center": {
		if (v.hasOwnProperty('lng') && v.hasOwnProperty('lat')) break;
		return false;
	}

	case "timeline": {
		if (!isNaN(new Date(v))) break;
		return false;
	}

	default: {
		throw new Error(`Unknown attribute '${p}'`);
	}
	}

	conf[p] = v;
	COMMIT(p,v);

	return true;
};

export function init() {
	self();

	Whatever
		.then(init_1)
		.then(init_2)
		.then(init_3)
		.then(init_4);
};

async function init_1() {
	const url = new URL(location);
	const id = url.searchParams.get('id');

	let conf = sessionStorage.getItem('config');
	if (conf) conf = JSON.parse(conf);

	const s = url.searchParams.get('snapshot');
	if (s) {
		loading("Fetching snapshot...");

		sessionStorage.removeItem('config');

		conf = await API.get('rpc/snapshot', { "_time": s }, { "one": true })
			.catch(_ => {})
			.then(r => SNAPSHOT = r)
			.then(r => r['config']);
	}

	conf = conf ?? {
		"index":    "eai",
		"view":     "data",
		"variant":  "raster",
		"tab":      "controls",
		"datasets": [],
	};

	STATE = new Proxy(conf, { "get": state_get, "set": state_set });

	drawer_init();
	cards_init();

	loading("Fetching geography...");

	GEOGRAPHY = await API.get("geographies", {
		"id":     `eq.${id}`,
		"select": ['*', 'parent_sort_branches', 'parent_sort_subbranches', 'parent_sort_datasets'],
	}, { "one": true });

	views_init();

	MOBILE = screen.width < 1152;

	GEOGRAPHY.timeline = maybe(GEOGRAPHY, 'configuration', 'timeline');
	GEOGRAPHY.timeline_dates = maybe(GEOGRAPHY, 'configuration', 'timeline_dates');

	layout();

	const mac = navigator.userAgent.indexOf('Mac') > -1;

	if (!MOBILE && window.devicePixelRatio !== 1) alert(`
Energy Access Explorer is optimised for display settings that differ from yours.

If the layout feels cramped, try zooming out to ${Math.round(1/window.devicePixelRatio * 100)}%.

On your OS, you can do this by pressing (${mac ? "⌘" : "ctrl"} −) a couple times.
`);

	loading("Initialising mapbox...");

	mapbox_init();

	if (MOBILE) mobile();

	return conf;
};

async function init_2(conf) {
	let select = ["*", "type", "category:categories(*)"];

	const divisions = maybe(GEOGRAPHY.configuration, 'divisions').filter(d => d.dataset_id !== null);

	GEOGRAPHY.divisions = [];

	loading("Fetching datasets...");

	const ALL = await API.get("datasets", {
		"geography_id": `eq.${GEOGRAPHY.id}`,
		"select":       select,
		"deployment":   `ov.{${ENV}}`,
		"flagged":      "is.false",
	});

	await (async function outline() {
		const json = ALL.find(d => d.id === divisions[0].dataset_id);
		if (!json) {
			const m = `
Failed to get the geography's OUTLINE.
This is fatal. Thanks for all the fish.`;

			super_error("Geography error", m);

			throw new Error("No OUTLINE");
		}

		OUTLINE = new DS(json);

		await OUTLINE.load('vectors');
		await OUTLINE.load('raster');

		OUTLINE.vectors.geojson.features[0].id = 0;
	})();

	await (function fetch_divisions() {
		loading("Fetching divisions...");

		const divisions_ids = divisions.slice(1).map(d => d.dataset_id);

		return Promise.all(
			ALL
				.filter(x => divisions_ids.includes(x.id))
				.map(async e => {
					const ds = new DS(e);

					return ds.load('csv')
						.then(_ => ds.load('vectors'))
						.then(_ => ds.load('raster'))
						.catch(err => console.error(err));
				}),
		);
	})();

	(async function fetch_admintiers() {
		let o = ALL.find(x => x.category.name === 'admin-tiers');

		loading("Fetching administrative tiers...");

		if (!o) {
			const pid = maybe(
				await API.get(
					'geographies_tree_up',
					{ "id": `eq.${GEOGRAPHY.id}` },
					{ "one": true },
				), 'path', 0,
			);

			o = await API.get("datasets", {
				"geography_id":  `eq.${pid}`,
				"select":        select,
				"category_name": "eq.admin-tiers",
			}, { "one": true });
		}

		admintiers(o);
	})();

	loading("Setting up datasets...");

	GEOGRAPHY.divisions = divisions
		.map(d => DS.array.find(t => t.dataset_id === d.dataset_id))
		.filter((d,i) => {
			if (!d) {
				console.error({
					"title":   "Geography Divisions configuration error",
					"message": `Divisions ${i} not found. Other datasets might fail to load...`,
				});

				return false;
			}

			return true;
		});

	ALL
		.filter(d => !divisions.map(i => i.dataset_id).includes(d.id))
		.filter(d => d.category.name !== 'admin-tiers')
		.forEach(e => new DS(e));

	// We need all the datasets to be initialised _before_ setting
	// mutant attributes (order is never guaranteed)
	//
	DS.array.filter(d => d.hosts).forEach(d => d.mutant_init());

	await load_datasets(conf.datasets);
};

async function init_3() {
	loading("Setting up UI elements...");

	indexes_init();
	controlssearch_init();
	geographiessearch_init();
	vectorssearch_init();
	analysissearch_init();
	locationssearch_init();
	points_init();
	timeline_init();
	qa_run();
};

async function init_4() {
	left_panel("controls");
	qs('#left-pane').style.display = '';
	qs('#left-pane input[id="controls-search"]').focus();

	qs('#right-pane').style.display = '';

	COMMIT("datasets");
	delay(0.3).then(_ => mapbox_fit(GEOGRAPHY.envelope));

	loading(false);
};

async function reload(k,v) {
	if (k === "center") {
		MAPBOX.setCenter(v, false);
		return;
	}

	if (k === "zoom") {
		MAPBOX.setZoom(v, false);
		return;
	}

	if (k === "tab") {
		left_panel(v);
		return;
	}

	if (or(k === "subdiv", k === "divtier"))
		geographiessearch_load(STATE.divtier, STATE.subdiv);

	const timeline = qs('#timeline');
	const output_preview = qs('#output-preview');

	const {view, index} = STATE;

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
		const a = STATE.datasets.map(d => maybe(d, 'config', 'divisions_tier'));

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
		const x = STATE.variant !== "raster";

		GEOGRAPHY.divisions.forEach((d,i) => {
			const t = STATE.variant;

			if (MAPBOX.getLayer(`priority-layer-${i}`))
				MAPBOX.setLayoutProperty(`priority-layer-${i}`, 'visibility', x && (t === i) ? "visible" : "none");
		});
	};

	function datasets_visibility(v) {
		return Promise.all(STATE.datasets.map(x => x.active(true, v)));
	};

	if (k === "datasets") {
		controls_recount();

		const a = await analysis_plot_active(index, true);

		const t = STATE.variant;

		if (GEOGRAPHY.divisions[t])
			priority(GEOGRAPHY.divisions[t], a, t);
	}

	switch (view) {
	case "analysis": {
		indexes_list();

		await datasets_visibility(false);

		if (timeline) timeline.style.display = 'none';

		filtered_visibility('none');

		output_visibility(STATE.variant === 'raster' ? 'visible' : 'none');

		priority_visibility_pick();

		views_right_pane();

		output_preview.style.display = 'none';

		break;
	}

	case "data": {
		filtered_visibility('none');

		output_visibility('none');

		priority_visibility_pick();

		output_preview.style.display = '';

		views_right_pane();

		await datasets_visibility(true);

		if (timeline) timeline_lines_update();

		break;
	}

	case "filtered": {
		if (timeline) timeline.style.display = 'none';

		await datasets_visibility(false);

		filtered_visibility('visible');

		output_visibility('none');

		priority_visibility_pick();

		filtered_valued_polygons();

		output_preview.style.display = '';

		views_right_pane();

		break;
	}

	default: {
		throw new Error(`Invalid view '${view}'`);
	}
	}

	if (k === "datasets") {
		cards_update();
		mapbox_sort();

		STATE.datasets.forEach(async d => {
			if (d.type.match(/raster-timeline/))
				parse_raster_timeline.call(d);

			else if (d.type.match(/(lines|points|polygons)-timeline/))
				parse_vectors_csv.call(d);
		});
	}

	views_buttons(view);

	timeline_visibility();
};

export function clean() {
	STATE.index = 'eai';
	STATE.view = 'data';

	STATE.datasets.forEach(d => d.active(false, false));

	COMMIT("datasets");

	DS.array.forEach(d => {
		d._domain = json_clone(d.domain);

		if (maybe(d, 'controls', 'weight_group'))
			d.controls.weight_group.change({ "min": 0, "max": maybe(d.category, 'analysis', 'weight') });
	});

	qs('input#controls-search').value = "";
	qs('input#controls-search').dispatchEvent(new Event('input'));

	for (let e of qsa('.controls-subbranch'))
		elem_collapse(qs('.controls-container', e), e);
};

function layout() {
	const n = qs('nav');
	const p = qs('#playground');
	const w = qs('#mobile-switcher');
	const t = qs('#timeline');

	function set_heights() {
		p.style['height'] = window.innerHeight - n.clientHeight - (MOBILE ? w.clientHeight : 0) + "px";
	};

	if (GEOGRAPHY.timeline)
		console.warn("TODO #timeline-graphs", qs('#timeline-graphs'));

	document.body.onresize = function() {
		set_heights();
		if (t) t.dispatchEvent(new Event('resize'));
	};

	set_heights();
};

function mobile() {
	const switcher = qs('#mobile-switcher');

	const map = ce('div', bi_icon('map'), { "bind": 'map', "ripple": "" });
	const outputs = ce('div', bi_icon('pie-chart'), { "bind": 'outputs', "ripple": "" });

	const tabs = [map, outputs];

	function mobile_switch(v) {
		switch (v) {
		case 'controls':{
			for (let e of ['#left-pane'])
				qs(e).style.display = '';

			for (let e of ['#right-pane', '#views'])
				qs(e).style.display = 'none';

			break;
		}

		case 'outputs': {
			for (let e of ['#left-pane', '#views'])
				qs(e).style.display = 'none';

			for (let e of ['#right-pane'])
				qs(e).style.display = '';

			STATE.view = v;

			views_right_pane();

			break;
		}

		case 'map':
		default: {
			for (let e of ['#right-pane', '#views'])
				qs(e).style.display = 'none';

			for (let e of ['#left-pane', '#views'])
				qs(e).style.display = '';

			break;
		}
		}
	};

	for (let e of tabs) {
		e.onclick = function() {
			for (let t of tabs) t.classList.remove('active');

			mobile_switch(this.getAttribute('bind'));
			e.classList.add('active');
		};

		switcher.append(e);
	}

	map.click();
};

export function left_panel(t) {
	for (let m of qsa('bubble-message')) m.remove();

	for (let e of qsa('#left-pane > div'))
		e.style.display = 'none';

	const as = qsa('#drawer a');

	for (let a of as) {
		if (a.getAttribute('for') === t) a.classList.add('active');
		else a.classList.remove('active');
	}

	if (t) {
		const p = document.getElementById(t);
		p.style.display = '';

		const i = qs('.search-input', p);
		if (i) i.focus();

		p.dispatchEvent(new Event('activate'));
	}

	const l = qs('#left-pane');
	if (t) l.setAttribute('open', '');
	else l.removeAttribute('open');

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
			if (!this.classList.contains('active'))
				STATE.tab = this.getAttribute('for');
		};

		a.onmouseenter = function() {
			if (p) p.remove();

			p = new bubblemessage({
				"position": "E",
				"message":  this.getAttribute('description'),
				"close":    false,
			}, a);
		};

		a.onmouseleave = function() {
			if (p) p.remove();
		};
	}
};

export async function sort(ordered) {
	if (ordered) STATE.datasets = ordered;

	await mapbox_sort();

	const a = ordered[0];
	if (!a.summary) return;

	for (const d of ordered) {
		if (!a.summary) {
			reset_features_visibility.call(d);
			continue;
		}

		analysis_dataset_intersect.call(d, a.raster);
	};
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

function timeline_visibility() {
	const timeline = qs('#timeline');

	if (!timeline) return;

	let v = '';

	const d = qsa('ds-card', qs('#cards-list'), true).map(c => c.ds)[0];

	if (maybe(d, 'timeline')) ;
	else v = 'none';

	timeline.style.display = v;
};

function load_datasets(array) {
	return Promise.all(array.map(d => {
		const ds = DS.array.find(t => t.id === d.name || t.name === d.id || t.id === d.id);

		if (!ds) {
			console.warn("config load: No such dataset on this geography:", d);
			return;
		}

		if (ds._domain) {
			if (typeof d.domain.min === 'number') ds._domain.min = d._domain?.min || d.domain.min;
			if (typeof d.domain.max === 'number') ds._domain.max = d._domain?.max || d.domain.max;
		} else
			console.warn(`Could not initialise domain for '${ds.id}' - ${ds.type}.`);

		ds.selection = d.selection;

		if (and(maybe(d.selection, 0), ds.hosts))
			ds.mutate(DST.get(d.selection[0]));

		if (typeof d.weight === 'number') ds.weight = d.weight;

		return ds.turn(true);
	}));
};
