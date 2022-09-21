import {
	fit as mapbox_fit,
} from './mapbox.js';

let ul, input, resultscontainer;

const lists = [];
let geometry_path = [];
let loaded_list = 1;

const resultsinfo = ce('div', null, {
	"class": 'search-results-info',
	"style": "cursor: pointer;",
});

function div(g,i,j) {
	const el = tmpl('#geographies-search-item');
	bind(el, {
		"name": g.name,
		"url":  g.id ? `./?id=${g.id}` : null,
	});

	qs('[zoom]', el).onclick = load.bind(null, i,j);

	return ce('li', el);
};

function li(g,i,j) {
	const el = ce('li', g.name);
	el.onclick = load.bind(null,i,j);

	return el;
};

function trigger(value) {
	if (!lists[U.divtier + 1]) return;

	for (let i of lists[U.divtier + 1])
		i.li.style.display = i.name.match(new RegExp(value, 'i')) ? "" : "none";
};

function fetch_countries() {
	const p = {
		"select":         ["id", "name"],
		"datasets_count": "gt.0",
		"parent_id":      GEOGRAPHY.parent_id ? `eq.${GEOGRAPHY.parent_id}` : "is.null",
		"adm":            `eq.0`,
		"deployment":     `ov.{${ENV}}`,
		"order":          "name.asc",
	};

	return API.get("geographies", p).then(j => {
		return j.map((g,i) => {
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
				"name": g.name,
			};
		});
	});
};

async function load(x,y) {
	U.divtier = x;
	U.subdiv = y;
	O.view = U.view;

	const fs = maybe(GEOGRAPHY.divisions, x, 'vectors', 'geojson', 'features');
	if (!fs) return;

	const geometry = fs.find(f => f['id'] === y);

	geometry_path[x] = y;

	resultsinfo.replaceChildren(
		font_icon('arrow-up'),
		ce('span', "Up a level", { "style": "margin-left: 1em;"}),
	);

	resultsinfo.onclick = function(_) {
		const x = U.divtier;

		if (loaded_list === 0) return;

		if (x === 0) {
			ul.replaceChildren(...lists[0].map(x => x.li));
			loaded_list = 0;
			resultsinfo.replaceChildren(ce('span', "Top level", { "style": "margin-left: 1em; color: gray;" }));
			return;
		}

		const d = GEOGRAPHY.divisions[x];
		d.vectors.geojson.features.forEach(f => f.properties.__visible = true);
		MAPBOX.getSource(d.id).setData(DST.get(d.id).vectors.geojson);

		load(x - 1, geometry_path[x - 1]);
	};

	if (lists[x+1]) {
		let tiers;
		const at = DST.get('admin-tiers');
		if (at) await until(_ => tiers = at.csv.data);

		ul.replaceChildren(...lists[x+1].filter(v => {
			if (!at) return true;

			const t = tiers.find(r => +r['TIER' + (x+1)] === v.i);

			if (!t) return true;

			const e = t['TIER' + x];

			return (t && e === undefined) ? true : +e === U.subdiv;
		}).map(i => i.li));
	} else {
		resultsinfo.append(ce('span', "(No more subdivisions)", { "style": "margin-left: 1em; color: gray;" }));
	}

	if (!maybe(lists, x, 'length')) {
		resultsinfo.replaceChildren(ce('span', "Already at top level", { "style": "margin-left: 1em; color: gray;" }));
		resultsinfo.onclick = null;
	}

	loaded_list = x+1;

	if (geometry)
		mapbox_fit(geojsonExtent(geometry), true);

	const d = GEOGRAPHY.divisions[x];
	await d.load('vectors');

	d.vectors.geojson.features.forEach(f => f.properties.__visible = (f.id === y));
	MAPBOX.getSource(d.id).setData(DST.get(d.id).vectors.geojson);

	if (d.on) {
		await delay(1);
		d.raise();
	}
};

export async function init() {
	const panel = qs('#geographies.search-panel');
	input = ce('input', null, { "id": 'geographies-search', "autocomplete": 'off', "class": 'search-input' });
	input.setAttribute('placeholder', 'Geographies search');

	panel.prepend(input);

	resultscontainer = qs('#geographies .search-results');
	ul = ce('ul');
	resultscontainer.append(ul);

	const at = DST.get('admin-tiers');
	if (at) at.load('csv');

	const gid = (new URL(location)).searchParams.get('id');

	await API
		.get("geographies", {
			"select":     ["name", "id"],
			"parent_id":  `eq.${gid}`,
			"deployment": `ov.{${ENV}}`,
		})
		.then(r => {
			const fli = r.find(e => maybe(e.id)) ? div : li;

			GEOGRAPHY
				.divisions
				.forEach((d,i) => {
					const v = maybe(d, 'csv', 'value');
					const a = !v ? [] : d.csv.data.map(x => x[v]);

					lists[i] = a.map((g,j) => {
						const k = +d.csv.data[j][d.csv.key];
						const id = maybe(r.find(e => e.name === g), 'id');

						const geo = { "name": g, id };

						return {
							"i":    k,
							"li":   fli(geo, i, k),
							"name": g,
						};
					});
				});
		});

	lists[0] = await fetch_countries();

	resultscontainer.prepend(resultsinfo);
	load(0,0);

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
