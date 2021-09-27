import {
	fit as mapbox_fit,
} from './mapbox.js';

let ul, input, resultscontainer;

const lists = [];
let geometry_path = [];

const resultsinfo = ce('div', [
	font_icon('arrow-up'),
	ce('span', "Up a level", { style: "margin-left: 1em;"})
], {
	class: 'search-results-info',
	style: "cursor: pointer;",
});

function li(g,i,j) {
	const el = ce('li', g);

	el.onclick = function() {
		load(i,j);
	};

	return el;
};

function trigger(value) {
	for (let i of lists[U.divtier + 1])
		i.li.style.display = i.name.match(new RegExp(value, 'i')) ? "" : "none";
};

function fetch_countries() {
	const p = {
		"select": ["id", "name"],
		"datasets_count": "gt.0",
		"parent_id": GEOGRAPHY.parent_id ? `eq.${GEOGRAPHY.parent_id}` : "is.null",
		"adm": `eq.0`,
		"deployment": `ov.{${ENV}}`,
		"order": "name.asc"
	};

	ea_api.get("geographies", p).then(j => {
		lists[0] = j.map((g,i) => {
			const li = ce('li', g.name);
			li.onclick = function() {
				if (g.id === GEOGRAPHY.id) {
					load(0,0);
				} else {
					const url = new URL(location);
					url.searchParams.set('id', g.id);
					location = url;
				}
			};

			return {
				i,
				li,
				name: g.name,
			};
		});
	});
};

function load(x,y) {
	U.divtier = x;
	U.subdiv = y;
	O.view = U.view;

	const geometry = (x < 0) ?
		OUTLINE.vectors.features.features[0] :
		maybe(GEOGRAPHY.divisions, x, 'vectors', 'features', 'features').find(f => f['id'] === y);

	geometry_path[x] = y;

	elem_empty(ul);

	if (lists[x+1])
		ul.append(...lists[x+1].map(i => i.li));

	if (geometry)
		mapbox_fit(geojsonExtent(geometry), true);
};

export async function init() {
	const panel = qs('#geographies.search-panel');
	input = ce('input', null, { id: 'geographies-search', autocomplete: 'off', class: 'search-input' });
	input.setAttribute('placeholder', 'Geographies search');

	panel.prepend(input);

	resultscontainer = qs('#geographies .search-results');
	ul = ce('ul');
	resultscontainer.append(ul);

	fetch_countries();

	GEOGRAPHY.divisions
		.map(d => {
			const v = maybe(d, 'config', 'csv_columns', 'value');
			if (!v) return [];

			return d.csv.data.map(x => x[v]);
		})
		.map((d,i) => {
			lists[i] = d.map((g,j) => ({
				i: j,
				li: li(g,i,j),
				name: g,
			}));
		});

	resultscontainer.prepend(resultsinfo);
	load(0,0);

	resultsinfo.onclick = function(_) {
		if (U.divtier < 0) return;
		load(U.divtier - 1, geometry_path[U.divtier - 1]);
	};

	input.oninput = function(_) {
		trigger(this.value);
	};

	input.onfocus = function(_) {
		this.value = "";
		trigger(this.value);
	};

	input.onkeypress = function(e) {
		if (e.key !== 'Enter') return;

		const c = Array.from(qsa('li', ul)).find(x => x.style.display !== 'none');

		if (c) c.dispatchEvent(new Event('click'));
	};
};
