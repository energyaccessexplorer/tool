import {
	coords_search_pois as mapbox_coords_search_pois,
} from './mapbox.js';

import {
	getpoints,
	analysis_colorscale,
	lowmedhigh_scale,
} from './analysis.js';

import {
	pointto as search_pointto,
	zoom,
} from './search.js';

let ul, resultscontainer, resultsinfo;

function pointto(p, a = false) {
	const dict = [[ "v", ea_indexes[U.output]['name'] ]];
	const props = { "v": lowmedhigh_scale(p.v) };

	search_pointto(p.c, dict, props, a);
};

function li(p) {
	const pi3 = (p.c).map(c => +c.toFixed(3));

	const pn = ce('span');

	const el = ce('li', [
		ce('code', 	"[" + pi3.join(", ") + "]", { "style": "font-size: 0.9em" } ),
		pn,
	]);

	const t = (p.v ? Math.round((p.v).toFixed(2) * 100) : "");

	el.setAttribute('group', t);

	el.onmouseenter = pointto.bind(null, p);

	el.onclick = zoom.bind(null, p, pointto.bind(null, p, true));

	mapbox_coords_search_pois({ "coords": p.c, "limit": 1 })
		.then(r => pn.append(ce('span', maybe(r, 0, 'name'), { "class": "context" })));

	return el;
};

async function trigger({ points = getpoints, n = 20 }) {
	ul.replaceChildren();

	const results = await points(n);

	const count = results.length;

	resultsinfo.innerHTML = `Searching <b>analysis coordinates</b>. Top ${count} results:`;

	const list = results
		.sort((a,b) => a.v > b.v ? -1 : 1)
		.slice(0,n)
		.map(t => li(t));

	const groups = {};
	list.forEach(i => {
		const a = i.getAttribute('group');
		if (!groups[a]) groups[a] = [];

		groups[a].push(i);
	});

	ul.append(...list);

	for (const g in groups) {
		const el = ul.querySelector(`[group='${g}']`);
		const h = ce('h5', g + "%");

		ul.insertBefore(h, el);

		h.style = `
font-size: 0.9em;
background-color: rgba(${analysis_colorscale.fn(g/100.0)});
padding: 0.5em;
padding-left: 1em;
margin: 0.5em auto;
margin-left: 0;
width: calc(${g}% - 1.5em);
`;
	}

	if (count > n)
		qs('div.search-results-info', resultscontainer).innerHTML = `Searching <b>analysis coordinates</b>. Showing first ${n} of ${count}:`;
};

export function init() {
	const panel = qs('#analysis.search-panel');
	const input = ce('span', "Analysis top locations", { "id": 'analysis-search', "class": 'search-input' });

	panel.addEventListener('activate', trigger);

	panel.prepend(input);

	resultscontainer = qs('#analysis .search-results');
	ul = ce('ul');
	resultscontainer.append(ul);

	resultsinfo = ce('div', ce('b', "Analysis coordinates"), { "class": 'search-results-info' });
	resultscontainer.prepend(resultsinfo);
};
