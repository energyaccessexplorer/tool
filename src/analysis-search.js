import {
	pointer as mapbox_pointer,
} from './mapbox.js';

import {
	plot_active as analysis_plot_active
} from './analysis.js';

let root, ul, maparea, input, resultscontainer, pointer;

let resultsinfo;

async function getpoints(threshold) {
	const raster = await analysis_plot_active(U.output, false);
	const points = raster.reduce(function(a,v,i) { if (v >= threshold) a.push({i,v}); return a; }, []);

	const ref = DST.get('boundaries').raster;

	return points.map(t => ({ v: t.v, i: ea_raster_in_coordinates(t.i, ref, GEOGRAPHY.bounds)}));
};

function pointto(p) {
	const {x,y} = MAPBOX.project(p.i);
	const e = ce('div', null);
	e.style = `background-color: rgb(${ea_analysis_colorscale.fn(p.v)}); width: 1em; height: 1em;`;

	const dict = [[ "v", "" ]];
	const props = { v: e.outerHTML };

	const td = table_data(dict, props);

	const box = maparea.getBoundingClientRect();
	const mbp = mapbox_pointer(td, box.x + x, box.y + y);

	return mbp;
};

function li(p) {
	const c = Math.round((p.v).toFixed(2) * 100) + " " + JSON.stringify((p.i).map(c => +c.toFixed(3)));

	const el = ce('li', `<code>${c}</code>`, {});
	el.onmouseenter = _ => {
		if (pointer) pointer.drop();
		pointer = pointto(p);
	};

	return el;
};

async function trigger(value) {
	elem_empty(ul);

	const results = await getpoints(value/100);

	const count = results.length;

	resultsinfo.innerHTML = `Searching <b>analysis coordinates</b>. ${count} results:`;

	results
		.sort((a,b) => a.v > b.v ? 1 : -1)
		.slice(0, 100)
		.forEach(t => ul.append(li(t)));

	if (count > 100)
		qs('div.search-results-info', resultscontainer).innerHTML = `Searching <b>analysis coordinates</b>. Too many results. Showing first 100 <i>only</i>:`;
};

export function init() {
	maparea = qs('#maparea');

	root = qs('#analysis.search-panel');
	input = ce('input', null, { id: 'analysis-search', autocomplete: 'off', class: 'search-input' });
	input.setAttribute('placeholder', "Analysis range: 50 - 100");

	root.prepend(input);

	resultscontainer = qs('#analysis .search-results');
	ul = ce('ul');
	resultscontainer.append(ul);

	resultsinfo = ce('div', `<b>Analysis coordinates</b>.`, { class: 'search-results-info' });
	resultscontainer.prepend(resultsinfo);

	input.oninput = function(_) {
		const v = parseFloat(this.value);
		if (isNaN(v)) return;
		if (v < 50 || v > 100) return;

		trigger(v);
	};
};
