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
	change_theme as mapbox_change_theme,
} from './mapbox.js';

import {
	load as config_load,
} from './config.js';

import {
	init as cards_init,
	update as cards_update,
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

import DS from './ds.js';

import Overlord from './overlord.js';

import bubblemessage from '../lib/bubblemessage.js';

const Uproxy = {
	"get": function(url,p) {
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

	"set": function(url,t,v) {
		switch (t) {
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

		case "inputs": {
			url.searchParams.set(t, [...new Set(v)].filter(t => DST.get(t)));
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

export async function init() {
	const url = new URL(location);
	const id = url.searchParams.get('id');

	GEOGRAPHY = await API.get("geographies", {
		"id":     `eq.${id}`,
		"select": ['*', 'parent_sort_branches', 'parent_sort_subbranches', 'parent_sort_datasets'],
	}, { "one": true });
	GEOGRAPHY.timeline = maybe(GEOGRAPHY, 'configuration', 'timeline');
	GEOGRAPHY.timeline_dates = maybe(GEOGRAPHY, 'configuration', 'timeline_dates');

	session_init();

	PARAMS = ea_params['default'];

	if (GEOGRAPHY.timeline)
		PARAMS = ea_params['timeline'];

	MOBILE = screen.width < 1152;
	layout();

	U = new Proxy(url, Uproxy);
	O = new Overlord();

	MAPBOX = mapbox_init();
	MAPBOX.coords = mapbox_fit(GEOGRAPHY.envelope);

	await dsinit(GEOGRAPHY.id);

	const conf = localStorage.getItem('config');
	if (conf) {
		config_load(JSON.parse(conf));
		localStorage.removeItem('config');
	}

	U.inputs = U.inputs.slice(0); // cleanup non-existent ids
	U.variant = U.variant || 'raster';

	O.index = U.output;

	cards_init();
	controlssearch_init();
	geographiessearch_init();
	vectorssearch_init();
	analysissearch_init();
	locationssearch_init();

	if (MOBILE) mobile();

	views_init();
	indexes_init();

	drawer_init();
	toggle_left_panel();

	if (GEOGRAPHY.timeline) timeline_init();

	if (!MOBILE && !GEOGRAPHY.timeline) {
		try {
			help_init();
		} catch(e) {
			console.warn("Disabling the nanny helper.", e);

			qs('#drawer-help').remove();
		}
	}

	await Promise.all(U.inputs.map(i => {
		const d = DST.get(i);
		return d._active(true, false);
	})).then(_ => {
		cards_update();
		mapbox_change_theme(ea_settings.mapbox_theme, false);
	});

	loading(false);
};

export function clean() {
	U.inputs = [];
	U.output = 'eai';
	U.view = 'inputs';

	DS.array.filter(d => d.on).forEach(d => d.active(false, false));

	DS.array.forEach(d => {
		d._domain = jsonclone(d.domain);

		if (maybe(d, 'controls', 'range_group'))
			d.controls.range_group.change(d.domain);

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

	function exists(e) {
		return !!coalesce(DST.get(e.name));
	};

	GEOGRAPHY.divisions = [];

	await (function fetch_outline() {
		// TODO: this should be more strict divisions 0/outline
		const outline_id = maybe(divisions.find(d => d.dataset_id), 'dataset_id');

		if (!outline_id) {
			const m = `
Failed to get the geography's OUTLINE.
This is fatal. Thanks for all the fish.`;

			super_error("Geography error", m);

			throw new Error("No OUTLINE");
		}

		const bp = {
			"id":     `eq.${outline_id}`,
			"select": select,
		};

		return API.get("datasets", bp, { "one": true })
			.then(async e => {
				if (exists(e)) return;

				const ds = OUTLINE = new DS(e);

				await ds.load('vectors');
				await ds.load('raster');

				ds.vectors.geojson.features[0].id = 0;
			});
	})();

	await (function fetch_divisions() {
		return Promise.all(
			divisions.filter(x => x.dataset_id).slice(1).map(x => {
				const dp = {
					"id":     `eq.${x.dataset_id}`,
					"select": select,
				};

				return API.get("datasets", dp, { "one": true })
					.then(async e => {
						if (exists(e)) return;

						const ds = new DS(e);

						await ds.load('csv')
							.then(_ => ds.load('vectors'))
							.then(_ => ds.load('raster'))
							.catch(err => console.error(err));
					});
			}),
		);
	})();

	GEOGRAPHY.divisions = divisions.map(d => DS.array.find(t => t.dataset_id === d.dataset_id));

	await (function fetch_datasets() {
		const nd = divisions.filter(d => d.dataset_id).map(d => d.dataset_id).concat(OUTLINE.dataset_id);
		const p = {
			"geography_id": `eq.${id}`,
			"select":       select,
			"deployment":   `ov.{${ENV}}`,
			"id":           `not.in.(${nd})`,
		};

		return API.get("datasets", p)
			.then(r => r.map(e => {
				if (exists(e)) return;

				new DS(e);
			}));
	})();

	PARAMS.inputs = [...new Set(DS.array.map(e => e.id))];

	// We need all the datasets to be initialised _before_ setting
	// mutant attributes (order is never guaranteed)
	//
	DS.array.filter(d => d.mutant).forEach(d => d.mutant_init());

	GEOGRAPHY.divisions = GEOGRAPHY.divisions.filter(d => d);
};

function layout() {
	if (maybe(GEOGRAPHY, 'timeline'))
		qs('#visual').append(ce('div', null, { "id": 'timeline' }));

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

	const o = tmpl('#analysis-output-template');

	if (GEOGRAPHY.timeline) {
		const g = tmpl('#timeline-graphs-template');
		qs('#cards-pane').append(g);
		qs('#filtered-pane').append(o);
	} else {
		qs('#cards-pane').append(o);
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

	qs('#drawer').style.display = 'block';

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

	toggle_left_panel();
};
