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

import {
	ce,
	maybe,
	qs,
} from '../lib/helpers.js';

let ul, resultscontainer, resultsinfo, section;

function pointto(p, a = false) {
	const dict = [[ "v", EAE['indexes'][STATE.index]['name'] ]];
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

function toggle_section() {
	const chevron = qs('.section-chevron', section);

	if (chevron.classList.contains('disabled')) return;

	const isCollapsed = section.getAttribute('data-collapsed') === 'true';
	section.setAttribute('data-collapsed', !isCollapsed);
}

function set_section_state(hasValidData) {
	const chevron = qs('.section-chevron', section);
	const content = qs('.section-content', section);

	if (!hasValidData) {
		chevron.classList.add('disabled');
		section.setAttribute('data-collapsed', 'true');
	} else {
		chevron.classList.remove('disabled');
		if (content) { content.style.maxHeight = content.scrollHeight + 'px'; }
	}
}

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

	set_section_state(count > 0);
};

// Export this function to be called when analysis updates
export function update() {
	trigger({});
};

export function init() {
	section = qs('#right-panel #analysis-locations-section');
	resultscontainer = qs('.search-results', section);

	ul = ce('ul');
	resultscontainer.append(ul);

	resultsinfo = ce('div', ce('b', "Analysis coordinates"), { "class": 'search-results-info' });
	resultscontainer.prepend(resultsinfo);

	const title = qs('.section-title', section);
	if (title) {
		title.onclick = toggle_section;
	}
};
