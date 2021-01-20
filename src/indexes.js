import summary_analyse from './summary.js';

import * as config from './config.js';

import {
	datasets as analysis_datasets,
	raster_to_tiff,
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

	const ramp = tmpl("#ramp");
	ramp.append(
		ce('div', "Low"),
		ce('div', "Medium"),
		ce('div', "High")
	);

	const scale = ce('div', null, { class: 'index-graphs-scale' });
	scale.append(ea_analysis_colorscale.svg, ramp);

	const cos = qs('#canvas-output-select');
	for (let i in ea_indexes)
		cos.append(ce('option', ea_indexes[i]['name'], { value: i }));

	cos.value = U.output;
	cos.onchange = x => { O.index = x.target.value; };

	const info = qs('#index-graphs-info');
	info.append(tmpl('#svg-info'));
	info.onclick = _ => modal();

	const download = qs('#index-graphs-download');
	download.append(tmpl('#svg-download'));
	download.onclick = async _ => {
		const type = url.searchParams.get('output');
		fake_blob_download((await raster_to_tiff(type)), `energyaccessexplorer-${type}.tif`);
	};

	const code = qs('#index-graphs-code');
	code.append(tmpl('#svg-code'));
	code.onclick = _ => {
		const conf = config.generate();
		fake_blob_download(JSON.stringify(conf), `energyaccessexplorer-config-${conf.id}.json`);
	};

	qs('#index-graphs').append(el_tree(
		[ ce('div', null, { class: 'index-graphs-container' }), [
			[ ce('div', ce('div', "Area share"), { class: 'index-graphs-group' }),
				[
					ce('div', null, { id: 'area-number', class: 'indexes-pie-label' }),
					PIES['area'].svg
				]
			],
			[ ce('div', ce('div', "Population share"), { class: 'index-graphs-group' }),
				[
					ce('div', null, { id: 'population-number', class: 'indexes-pie-label' }),
					PIES['population'].svg
				]
			]
		]]
	), scale);
};

export function list() {
	const nodes = [];

	const indexes_list = qs('#indexes-list');
	elem_empty(indexes_list);

	function i_elem(t, v) {
		const d = ce('li',  null, { bind: t, class: 'element', ripple: "" });
		d.append(
			ce('div', null, { class: 'radio' }),
			ce('span', v)
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
		let node = i_elem(t, ea_indexes[t]['name'], ea_indexes[t]['description']);

		let ler = qs('.radio', node);
		ler.append(radio(t === U.output));

		node.addEventListener('mouseup', _ => setTimeout(_ => trigger_this.call(node), 10));

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
		footer: elem(`
<a style="text-align: right; display: block;" href="https://www.wri.org/publication/energy-access-explorer-data-and-methods">
  See technical note for more detailed methodology
</a>
`)
	}).show();
};
