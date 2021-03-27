import {
	plot_active as analysis_plot_active,
} from './analysis.js';

import {
	pointto as search_pointto,
	zoom,
} from './search.js';

let root, ul, input, resultscontainer;

let resultsinfo;

const n = 20;

async function getpoints() {
	const a = await analysis_plot_active(U.output, false);

	const threshold = a.raster.slice(0)
		.sort((a,b) => a > b ? -1 : 1)
		.slice(0, n)[n-1];

	const points = a.raster.reduce(function(t,v,i) { if (v >= threshold) t.push({i,v}); return t; }, []);

	const ref = DST.get('boundaries').raster;

	return points.map(t => ({ v: t.v, i: ea_raster_in_coordinates(t.i, ref, GEOGRAPHY.bounds) }));
};

function pointto(p, a = false) {
	const e = ce('div', null);
	e.style = `background-color: rgb(${ea_analysis_colorscale.fn(p.v)}); width: 1em; height: 1em;`;

	const dict = [[ "v", "" ]];
	const props = { v: e.outerHTML };

	search_pointto(p.i, dict, props, a);
};

function li(p) {
	const c = Math.round((p.v).toFixed(2) * 100) + " " + JSON.stringify((p.i).map(c => +c.toFixed(3)));

	const el = ce('li', `<code>${c}</code>`, {});

	el.onmouseenter = _ => pointto(p);

	el.onclick = _ => zoom(p, _ => pointto(p, true));

	return el;
};

async function trigger() {
	elem_empty(ul);

	const results = await getpoints();

	const count = results.length;

	resultsinfo.innerHTML = `Searching <b>analysis coordinates</b>. Top ${count} results:`;

	results
		.sort((a,b) => a.v > b.v ? -1 : 1)
		.slice(0,n)
		.forEach(t => ul.append(li(t)));

	if (count > n)
		qs('div.search-results-info', resultscontainer).innerHTML = `Searching <b>analysis coordinates</b>. Showing first ${n} of ${count}:`;
};

export function init() {
	root = qs('#analysis.search-panel');
	input = ce('button', "Click for top locations",
						 { id: 'analysis-search', autocomplete: 'off', class: 'search-input', style: "cursor: pointer;" });

	root.prepend(input);

	resultscontainer = qs('#analysis .search-results');
	ul = ce('ul');
	resultscontainer.append(ul);

	resultsinfo = ce('div', `<b>Analysis coordinates</b>.`, { class: 'search-results-info' });
	resultscontainer.prepend(resultsinfo);

	input.onclick = function(_) {
		trigger();
	};
};
