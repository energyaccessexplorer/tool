import {
	svg_pie,
	opacity_control,
} from './utils.js';

import modal from '../lib/modal.js';

import summary_analyse from './summary.js';

import bubblemessage from '../lib/bubblemessage.js';

import {
	extract as user_extract,
	register_login,
} from './user.js';

import {
	enough_datasets,
	analysis,
	analysis_colorscale,
} from './analysis.js';

import {
	analysis_to_dataset,
} from './overlord.js';

import {
	snapshot,
} from  './session.js';

const PIES = {};

const bubble = (v,e) => new bubblemessage({ "message": v + "%", "position": "C", "close": false, "noevents": true }, e);

function radio(init, callback) {
	const size = 20;

	const svg = d3.create("svg")
		.attr('class', 'svg-radio');

	const g = svg.append('g');
	const gutter = g.append('circle');
	const center = g.append('circle');

	let status = init || false;

	const active = getComputedStyle(document.body).getPropertyValue('--the-yellow');

	svg
		.attr('width', size)
		.attr('height', size)
		.style('cursor', 'pointer');

	gutter
		.attr('stroke', '#ccc')
		.attr('fill', 'white')
		.attr('r', (size/2) - 2)
		.attr('cx', (size/2))
		.attr('cy', (size/2));

	center
		.attr('r', (size/2) * (3/5))
		.attr('cx', (size/2))
		.attr('cy', (size/2));

	function change(s,i) {
		center
			.style('fill', (s ? active : 'white'))
			.style('stroke', (s ? active : 'white'));

		if (typeof callback === 'function' && !i) callback(s);
	};

	svg.on('click', _ => {
		if (status) return;
		else change(status = true);
	});

	svg.on('select', _ => change((status = true)));
	svg.on('unselect', _ => change((status = false)));

	change(status, init);

	return svg.node();
};

export async function graphs(raster) {
	const t = await summary_analyse(raster);

	const e = (1000/GEOGRAPHY.resolution)**2;

	let g = maybe(t, 'population-density'); if (g) {
		g['distribution'].forEach((x,i) => PIES['population']['data'][i].push(x));

		PIES['population'].change(1);

		qs('#population-number').innerHTML = Math.round(g['total'] / e).toLocaleString() + "&nbsp;" + "people";

		g['distribution'].forEach((x,i) => PIES['population']['data'][i].shift());
	} else {
		const pn = qs('#population-number');
		if (pn) pn.closest('.index-graphs-group').remove();
	}

	g = maybe(t, 'area'); if (g) {
		g['distribution'].forEach((x,i) => PIES['area']['data'][i].push(x));

		PIES['area'].change(1);

		qs('#area-number').innerHTML = Math.round(g['total'] / e).toLocaleString() + "&nbsp;" + "km<sup>2</sup>";

		g['distribution'].forEach((x,i) => PIES['area']['data'][i].shift());
	} else {
		const an = qs('#area-number');
		if (an) an.closest('.index-graphs-group').remove();
	}
};

export function init() {
	PIES["population"] = svg_pie([[0], [0], [0], [0], [0]], 70, 0, analysis_colorscale.stops, null, null, bubble);
	PIES["area"]       = svg_pie([[0], [0], [0], [0], [0]], 70, 0, analysis_colorscale.stops, null, null, bubble);

	const user_id = user_extract('id');

	const url = new URL(location);

	const r = tmpl('#ramp');

	qs('.ramp', r).append(
		ce('div', "Low"),
		ce('div', "Medium"),
		ce('div', "High"),
	);

	const scale = ce('div', null, { "class": 'index-graphs-scale' });
	scale.append(analysis_colorscale.svg, r);

	const cos = qs('#canvas-output-select');
	for (let i in EAE['indexes'])
		cos.append(ce('option', EAE['indexes'][i]['name'], { "value": i }));

	cos.value = U.output;
	cos.onchange = x => { O.index = x.target.value; };

	const toolbox = qs('#index-layer-toolbox');
	const tools = {
		"index-graphs-opacity":  "Change opacity of the analysis layer",
		"index-graphs-info":     "Info about different indexes",
		"index-graphs-download": "Download TIFF image of the current analysis",
	};

	for (const i in tools)
		toolbox.append(ce('a', null, { "id": i, "title": tools[i] }));

	const snap = qs('#snapshot-button');
	snap.onclick = snapshot;

	const opacity = qs('#index-graphs-opacity');
	opacity.append(opacity_control({
		"fn": x => MAPBOX.setPaintProperty('output-layer', 'raster-opacity', x),
	}));

	// eventually do something about this...
	//
	const c = qs('.opacity-box', opacity);
	c.style['right'] = 'unset';
	c.style['left'] = '-2px';

	const info = qs('#index-graphs-info');
	info.append(font_icon('info-circle'));
	info.onclick = open_modal;

	const download = qs('#index-graphs-download');
	download.append(font_icon('image'));
	download.onclick = async _ => {
		if (!user_id) {
			register_login();
			return;
		}

		const type = url.searchParams.get('output');
		fake_blob_download((await analysis(type)).tiff, `energyaccessexplorer-${type}.tif`);
	};

	const graphs = tmpl('#index-graphs-container-template');

	qs('.index-graphs-group #area-number', graphs).parentElement.append(PIES['area'].svg);
	qs('.index-graphs-group #population-number', graphs).parentElement.append(PIES['population'].svg);

	const variant_select = qs('#output-variant-select');
	GEOGRAPHY.divisions.forEach((d,i) => {
		if (i === 0) return;
		variant_select.append(ce('option', `Administrative Priority - ${d.name}`, { "value": i }));
	});

	variant_select.value = U.variant;
	variant_select.onchange = function(_) {
		U.variant = this.value;
		O.view = U.view;
	};

	qs('#index-graphs').append(graphs, scale);
};

export function list() {
	const nodes = [];

	const indexes_list = qs('#indexes-list');
	indexes_list.replaceChildren();

	function i_elem(t, v) {
		const d = ce('tr',  null, { "bind": t, "class": 'element' });
		d.append(
			ce('td', [
				ce('span', null, { "class": 'radio' }),
				ce('span', v, { "class": 'name' }),
			], { "ripple": "" }),
			ce('td', font_icon('collection'), { "class": 'analysis-to-dataset' }),
		);

		if (!enough_datasets(t))
			d.setAttribute('disabled', "");

		return d;
	};

	function trigger_this() {
		if (this.hasAttribute('disabled')) return false;

		for (let n of nodes) {
			qs('.radio svg', n).dispatchEvent(new Event((this === n) ? "select" : "unselect"));
		}

		O.index = this.getAttribute('bind');
	};

	for (let t in EAE['indexes']) {
		const node = i_elem(t, EAE['indexes'][t]['name'], EAE['indexes'][t]['description']);

		qs('.radio', node).append(radio(t === U.output));

		node.onclick = trigger_this.bind(node);

		qs('.analysis-to-dataset', node).onclick = analysis_to_dataset.bind(this, t);

		nodes.push(node);
	}

	indexes_list.append(...nodes);
};

function open_modal() {
	const c = ce('div');

	for (let i in EAE['indexes']) {
		c.append(
			ce('h3', EAE['indexes'][i]['name']),
			ce('p', EAE['indexes'][i]['info']),
		);
	}

	new modal({
		"id":      'indexes-modal',
		"header":  "Indexes Descriptions",
		"content": c,
		"footer":  ce('a', "See technical note for more detailed methodology", {
			"style": "text-align: right; display: block;",
			"href":  "https://www.wri.org/publication/energy-access-explorer-data-and-methods",
		}),
		"destroy": true,
	}).show();
};

export function updated_plot(type, index) {
	qs('#canvas-output-select').value = type;
	qs('#index-graphs-title').innerText = index['name'];
	qs('#index-graphs-description').innerText = index['description'];
};
