import {
	svg_pie,
	opacity_control,
	bi_icon,
} from './utils.js';

import {
	analysis_to_dataset,
} from './complicated.js';

import bind from '../lib/bind.js';

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

	const outline_raster = DST.get('outline').raster;
	const outline_cover = outline_raster.data.filter(x => x != outline_raster.nodata).length;
	const f = GEOGRAPHY.area ? (GEOGRAPHY.area / outline_cover) : (1/e);

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

		qs('#area-number').innerHTML = Math.round(g['total'] * f).toLocaleString() + "&nbsp;" + "km<sup>2</sup>";

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

	cos.value = STATE.index;
	cos.onchange = x => { STATE.index = x.target.value; };

	const toolbox = qs('#index-layer-toolbox');
	const tools = {
		"index-graphs-opacity":  "Change opacity of the analysis layer",
		"index-graphs-info":     "Info about different indexes",
		"index-graphs-download": "Download TIFF image of the current analysis",
	};

	for (const i in tools)
		toolbox.append(ce('a', null, { "id": i, "title": tools[i] }));

	const snap = qs('#save-snapshot-button');

	const suid = maybe(SNAPSHOT, 'user_id');

	if (and(suid, suid !== SELF.id))
		qs('span', snap).innerText = "Duplicate Analysis";
	else if (and(suid, suid === SELF.id))
		qs('span', snap).innerText = "Update Analysis";

	snap.onclick = _ => {
		if (snapshot())
			qs('span', snap).innerText = "Update Analysis";
	};

	const share = qs('#share-snapshot-button');
	share.onclick = _ => {
		const u = new URL(location);

		if (u.searchParams.get('snapshot')) {
			share_url();
			return;

		}
		if (snapshot(share_url))
			qs('span', snap).innerText = "Update Analysis";
	};

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
	info.append(bi_icon('info-circle'));
	info.onclick = open_modal;

	const download = qs('#index-graphs-download');
	download.append(bi_icon('card-image'));
	download.onclick = async _ => {
		if (!user_id) {
			register_login();
			return;
		}

		const url = new URL(location);
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

	variant_select.value = STATE.variant;
	variant_select.onchange = _ => {
		STATE.variant = variant_select.value;
		COMMIT("datasets");
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
			ce('td', bi_icon('collection'), { "class": 'analysis-to-dataset' }),
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

		STATE.index = this.getAttribute('bind');
		COMMIT("datasets");
	};

	for (let t in EAE['indexes']) {
		const node = i_elem(t, EAE['indexes'][t]['name'], EAE['indexes'][t]['description']);

		qs('.radio', node).append(radio(t === STATE.index));

		node.onclick = trigger_this.bind(node);

		qs('.analysis-to-dataset', node).onclick = analysis_to_dataset.bind(this, t);

		nodes.push(node);
	}

	indexes_list.append(...nodes);
};

function share_url() {
	const c = tmpl('#share-link-modal-content');

	const u = new URL(location);
	const id = u.searchParams.get('snapshot');
	const url = `${u.protocol}//${u.hostname}${window.BASE}/tool/p?${id}`;

	function copy() {
		if (!navigator.clipboard) {
			FLASH.push({
				"type":    'error',
				"timeout": 2000,
				"title":   "Clipboard functionality not available",
			});

			this.closest('button').remove();

			return;
		}

		navigator.clipboard.writeText(url)
			.then(_ => {
				FLASH.push({
					"type":    'success',
					"timeout": 2000,
					"title":   "Link copied!",
				});
			});
	};

	bind(c, { url, copy });

	new modal({
		"id":      'share-link-modal',
		"header":  "Share link",
		"content": c,
		"destroy": true,
	}).show();
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
