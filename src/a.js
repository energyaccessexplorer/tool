import {
	init as controlssearch_init,
} from './controls-search.js';

import {
	init as geographiessearch_init,
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
	init as views_init,
	buttons as views_buttons,
	right_pane as views_right_pane,
} from './views.js';

import {
	init as mapbox_init,
	fit as mapbox_fit,
	theme_init as mapbox_theme_init,
} from './mapbox.js';

import {
	init as cards_init,
} from './cards.js';

import {
	init as indexes_init,
} from './indexes.js';

import {
	init as help_init,
} from './help.js';

import {
	init as timeline_init,
} from './timeline.js';

import {
	select_tab as controls_select_tab,
} from './controls-search.js';

import {
	init as session_init,
} from './session.js';

import {
	run as qa_run,
} from './qa.js';

import DS from './ds.js';

import admintiers from './admin-tiers.js';

import Overlord from './overlord.js';

import bubblemessage from '../lib/bubblemessage.js';

const Uproxy = {
	"get": function(url,p) {
		const i = url.searchParams.get(p);

		let v;
		switch (p) {
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

	"set": function(url,t,v) {
		switch (t) {
		case "tab":
		case "output":
		case "variant":
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

		default: {
			throw new TypeError(`U: I'm not allowed to set '${t}'`);
		}
		}

		history.replaceState(null, null, url);

		return true;
	},
};

export function init() {
	Whatever
		.then(init_1)
		.then(init_2)
		.then(init_3);
};

async function init_1() {
	const url = new URL(location);
	const id = url.searchParams.get('id');

	GEOGRAPHY = await API.get("geographies", {
		"id":     `eq.${id}`,
		"select": ['*', 'parent_sort_branches', 'parent_sort_subbranches', 'parent_sort_datasets'],
	}, { "one": true });

	MOBILE = screen.width < 1152;
	GEOGRAPHY.timeline = maybe(GEOGRAPHY, 'configuration', 'timeline');
	layout();

	O = new Overlord();

	MAPBOX = mapbox_init();
	MAPBOX.coords = mapbox_fit(GEOGRAPHY.envelope);

	if (MOBILE) mobile();

	mapbox_theme_init(ea_settings.mapbox_theme);

	GEOGRAPHY.timeline_dates = maybe(GEOGRAPHY, 'configuration', 'timeline_dates');

	session_init();

	PARAMS = ea_params['default'];

	if (GEOGRAPHY.timeline)
		PARAMS = ea_params['timeline'];

	U = new Proxy(url, Uproxy);
	U.tab = null;
	U.variant = null;

	drawer_init();
	views_init();
	cards_init();

	loading(false);
};

async function init_2() {
	await dsinit(GEOGRAPHY.id);

	let conf = localStorage.getItem('config');
	if (conf) conf = JSON.parse(conf);

	const url = new URL(location);
	const stamp = url.searchParams.get('snapshot');
	if (stamp) {
		conf = await API.get('snapshots', { "time": `eq.${stamp}` }, { "one": true })
			.catch(_ => {})
			.then(r => r['config']);
	}

	O.load_config(conf);

	O.index = U.output;

	controlssearch_init();
	geographiessearch_init();
	vectorssearch_init();
	analysissearch_init();
	locationssearch_init();

	indexes_init();

	toggle_left_panel(U.tab);

	if (GEOGRAPHY.timeline) timeline_init();

	if (!MOBILE && !GEOGRAPHY.timeline) {
		try {
			help_init();
		} catch(e) {
			console.warn("Disabling the nanny helper.", e);

			qs('#drawer-help').remove();
		}
	}

	await Promise.all(DS.all("on").map(d => d._active(true, false)));

	qa_run();
};

async function init_3() {
	O.view = U.view;
};

export function clean() {
	U.output = 'eai';
	U.view = 'inputs';

	DS.all("on").forEach(d => d.active(false, false));

	DS.array.forEach(d => {
		d._domain = jsonclone(d.domain);

		if (maybe(d, 'controls', 'weight_group'))
			d.controls.weight_group.change({ "min": 0, "max": maybe(d.category, 'analysis', 'weight') });
	});

	qs('input#controls-search').value = "";
	qs('input#controls-search').dispatchEvent(new Event('input'));

	for (let e of qsa('.controls-subbranch'))
		elem_collapse(qs('.controls-container', e), e);

	O.view = 'inputs';
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
 *
 * returns DS[]
 */

async function dsinit(id) {
	let select = ["*", "datatype", "category:categories(*)"];

	const divisions = maybe(GEOGRAPHY.configuration, 'divisions').filter(d => d.dataset_id !== null);

	GEOGRAPHY.divisions = [];

	const ALL = await API.get("datasets", {
		"geography_id": `eq.${id}`,
		"select":       select,
		"deployment":   `ov.{${ENV}}`,
		"flagged":      "is.false",
	});

	await (async function outline() {
		const OUTLINE_JSON = ALL.find(d => d.id === divisions[0].dataset_id);
		if (!OUTLINE_JSON) {
			const m = `
Failed to get the geography's OUTLINE.
This is fatal. Thanks for all the fish.`;

			super_error("Geography error", m);

			throw new Error("No OUTLINE");
		}

		OUTLINE = new DS(OUTLINE_JSON);
		await OUTLINE.load('vectors');
		await OUTLINE.load('raster');

		OUTLINE.vectors.geojson.features[0].id = 0;
	})();

	await (function fetch_divisions() {
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

	GEOGRAPHY.divisions = divisions.map(d => DS.array.find(t => t.dataset_id === d.dataset_id));

	ALL
		.filter(d => !divisions.map(i => i.dataset_id).includes(d.id))
		.filter(d => d.category.name !== 'admin-tiers')
		.forEach(e => new DS(e));

	// We need all the datasets to be initialised _before_ setting
	// mutant attributes (order is never guaranteed)
	//
	DS.array.filter(d => d.mutant).forEach(d => d.mutant_init());
};

function layout() {
	const n = qs('nav');
	const p = qs('#playground');
	const w = qs('#mobile-switcher');

	const m = qs('#maparea', p);
	const t = qs('#timeline');

	function set_heights() {
		p.style['height'] = window.innerHeight - n.clientHeight - (MOBILE ? w.clientHeight : 0) + "px";
	};

	if (MOBILE) m.style['width'] = screen.width + "px";

	if (GEOGRAPHY.timeline)
		console.warn("TODO #timeline-graphs", qs('#timeline-graphs'));

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

	const svgcontrols = ce('div', font_icon('list-task'), { "bind": 'controls', "ripple": "" });
	const map = ce('div', font_icon('globe'), { "bind": 'map', "ripple": "" });
	const inputs = ce('div', font_icon('layers-fill'), { "bind": 'inputs', "ripple": "" });
	const outputs = ce('div', font_icon('pie-chart-fill'), { "bind": 'outputs', "ripple": "" });

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

			views_right_pane();
			views_buttons();
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

	U.tab = t;
};

function drawer_init() {
	const as = qsa('#drawer a');

	let p;

	for (let a of as) {
		a.onclick = function() {
			toggle_left_panel(
				this.classList.contains('active') ? null :
					this.getAttribute('for'),
			);
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

	toggle_left_panel(U.tab);
};
