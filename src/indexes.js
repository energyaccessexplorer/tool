import summary_analyse from './summary.js';

import * as config from './config.js';

import * as user from './user.js';

import {
	datasets as analysis_datasets,
	analysis,
} from './analysis.js';

const PIES = {
	'population': ea_svg_pie([[0], [0], [0], [0], [0]], 70, 0, ea_analysis_colorscale.stops, null),
	'area': ea_svg_pie([[0], [0], [0], [0], [0]], 70, 0, ea_analysis_colorscale.stops, null),
};

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

	let g = maybe(t, 'population-density'); if (g) {
		g['distribution'].forEach((x,i) => PIES['population']['data'][i].push(x));

		PIES['population'].change(1);

		qs('#population-number').innerHTML = g['total'].toLocaleString() + "&nbsp;" + "people";

		g['distribution'].forEach((x,i) => PIES['population']['data'][i].shift());
	} else {
		const pn = qs('#population-number');
		if (pn) pn.closest('.index-graphs-group').remove();
	}

	g = maybe(t, 'area'); if (g) {
		g['distribution'].forEach((x,i) => PIES['area']['data'][i].push(x));

		PIES['area'].change(1);

		qs('#area-number').innerHTML = g['total'].toLocaleString() + "&nbsp;" + "km<sup>2</sup>";

		g['distribution'].forEach((x,i) => PIES['area']['data'][i].shift());
	} else {
		const an = qs('#area-number');
		if (an) an.closest('.index-graphs-group').remove();
	}
};

export function init() {
	const url = new URL(location);

	const r = tmpl("#ramp");
	qs('.ramp', r).append(
		ce('div', "Low"),
		ce('div', "Medium"),
		ce('div', "High")
	);

	const scale = ce('div', null, { class: 'index-graphs-scale' });
	scale.append(ea_analysis_colorscale.svg, r);

	const cos = qs('#canvas-output-select');
	for (let i in ea_indexes)
		cos.append(ce('option', ea_indexes[i]['name'], { value: i }));

	cos.value = U.output;
	cos.onchange = x => { O.index = x.target.value; };

	const toolbox = qs('#index-graphs-toolbox');
	const tools = {
		"index-graphs-opacity": "Change opacity of the analysis layer",
		"index-graphs-info": "Info about different indexes",
	};

	const more_tools = {
		"index-graphs-download": "Download TIFF image of the current analysis",
		"index-graphs-code": "Download JSON file of the current analysis",
	};

	for (const i in tools)
		toolbox.append(ce('a', null, { id: i, title: tools[i] }));

	const opacity = qs('#index-graphs-opacity');
	opacity.append(ea_opacity_control({
		fn: x => MAPBOX.setPaintProperty('output-layer', 'raster-opacity', x),
	}));

	const info = qs('#index-graphs-info');
	info.append(font_icon('info-circle'));
	info.onclick = _ => modal();

	if (user.logged_in()) {
		for (const i in more_tools)
			toolbox.append(ce('a', null, { id: i, title: more_tools[i] }));

		const download = qs('#index-graphs-download');
		download.append(font_icon('image'));
		download.onclick = async _ => {
			const type = url.searchParams.get('output');
			fake_blob_download((await analysis(type)).tiff, `energyaccessexplorer-${type}.tif`);
		};

		const code = qs('#index-graphs-code');
		code.append(font_icon('braces'));
		code.onclick = _ => {
			const conf = config.generate();
			fake_blob_download(JSON.stringify(conf), `energyaccessexplorer-config-${conf.id}.json`);
		};
	}

	const graphs = tmpl('#index-graphs-container-template');

	qs('.index-graphs-group #area-number', graphs).parentElement.append(PIES['area'].svg);
	qs('.index-graphs-group #population-number', graphs).parentElement.append(PIES['population'].svg);

	qs('#index-graphs').append(graphs, scale);
};

export function list() {
	const nodes = [];

	const indexes_list = qs('#indexes-list');
	indexes_list.replaceChildren();

	function i_elem(t, v) {
		const d = ce('li',  null, { bind: t, class: 'element', ripple: "" });
		d.append(
			ce('div', null, { class: 'radio' }),
			ce('span', v, { class: 'name' }),
			ce('span', font_icon('collection'), { class: 'analysis-to-dataset' }),
		);

		if (analysis_datasets(t) < 1)
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

	for (let t in ea_indexes) {
		const node = i_elem(t, ea_indexes[t]['name'], ea_indexes[t]['description']);

		qs('.radio', node).append(radio(t === U.output));

		node.onclick = _ => trigger_this.call(node);

		qs('.analysis-to-dataset', node).onclick = _ => analysis_to_dataset(t);

		indexes_list.append(node);

		nodes.push(node);
	}
};

export function modal() {
	const c = ce('div');

	for (let i in ea_indexes) {
		c.append(
			ce('h3', ea_indexes[i]['name']),
			ce('p', ea_indexes[i]['info'])
		);
	}

	ea_modal.set({
		header: "Energy Access Explorer Indexes",
		content: c,
		footer: ce('a', "See technical note for more detailed methodology", {
			"style": "text-align: right; display: block;",
			"href": "https://www.wri.org/publication/energy-access-explorer-data-and-methods",
		})
	}).show();
};

export function updated_plot(type, index) {
	qs('#canvas-output-select').value = type;
	qs('#index-graphs-title').innerText = index['name'];
	qs('#index-graphs-description').innerText = index['description'];
};
