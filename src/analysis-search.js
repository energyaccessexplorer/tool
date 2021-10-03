import {
	plot_active as analysis_plot_active,
} from './analysis.js';

import {
	pointto as search_pointto,
	zoom,
} from './search.js';

let ul, input, resultscontainer;

let resultsinfo;

const n = 20;

async function getpoints() {
	const a = await analysis_plot_active(U.output, false);

	const threshold = a.raster.slice(0)
		.sort((a,b) => a > b ? -1 : 1)
		.slice(0, n)[n-1];

	const points = a.raster.reduce((t,v,i) => {
		if (v > 0 && v >= threshold)
			t.push({i,v});

		return t;
	}, []);

	return points.map(t => ({ v: t.v, i: raster_pixel_to_coordinates(t.i) }));
};

function pointto(p, a = false) {
	const dict = [[ "v", ea_indexes[U.output]['name'] ]];
	const props = { v: ea_lowmedhigh_scale(p.v) };

	search_pointto(p.i, dict, props, a);
};

function li(p) {
	const c = Math.round((p.v).toFixed(2) * 100) + " " + JSON.stringify((p.i).map(c => +c.toFixed(3)));

	const el = ce('li', ce('code', c), {});

	el.onmouseenter = _ => pointto(p);

	el.onclick = _ => zoom(p, _ => pointto(p, true));

	return el;
};

async function trigger() {
	ul.replaceChildren();

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
	const panel = qs('#analysis.search-panel');
	input = ce('span', "Analysis top locations",
						 { id: 'analysis-search', class: 'search-input' });

	panel.addEventListener('activate', trigger);

	panel.prepend(input);

	resultscontainer = qs('#analysis .search-results');
	ul = ce('ul');
	resultscontainer.append(ul);

	resultsinfo = ce('div', ce('b', "Analysis coordinates"), { class: 'search-results-info' });
	resultscontainer.prepend(resultsinfo);

	input.onclick = function(_) {
		trigger();
	};
};
