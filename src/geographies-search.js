import {
	fit as mapbox_fit,
} from './mapbox.js';

let input, resultscontainer;
let all = [];
let details = [];

function trigger(value) {
	details.forEach(x => x.removeAttribute('open'));

	const re = new RegExp(value, 'i');
	if (String(re) === "/(?:)/i") {
		all.forEach(x => x.classList.remove('matches'));
		details[0]?.setAttribute('open', '');
		return;
	}

	all.forEach(x => {
		x.classList.remove('matches');

		if (x.textContent.match(re))
			x.classList.add('matches');
	});

	details.forEach(x => {
		if (x.querySelector('.matches'))
			x.setAttribute('open', '');
	});
};

async function load(x,y) {
	U.divtier = x;
	U.subdiv = y;

	const fs = maybe(GEOGRAPHY.divisions, x, 'vectors', 'geojson', 'features');
	if (!fs) return;

	const geometry = fs.find(f => f['id'] === y);
	if (geometry)
		mapbox_fit(geojsonExtent(geometry), true);

	const d = GEOGRAPHY.divisions[x];
	await d.load('vectors');

	d.vectors.geojson.features.forEach(f => f.properties.__visible = (f.id === y));
	MAPBOX.getSource(d.id).setData(DST.get(d.id).vectors.geojson);

	if (d.on) d.raise();
};

export async function init() {
	const panel = qs('#geographies.search-panel');
	input = ce('input', null, { "id": 'geographies-search', "autocomplete": 'off', "class": 'search-input' });
	input.setAttribute('placeholder', 'Geographies search');

	panel.prepend(input);

	resultscontainer = qs('#geographies .search-results');

	input.oninput = function(_) {
		trigger(this.value);
	};

	input.onfocus = function(_) {
		this.value = "";
		trigger(this.value);
	};

	const d = await tree();
	d.setAttribute('open', '');

	resultscontainer.replaceChildren(d);

	all = resultscontainer.querySelectorAll('summary,div');
	details = resultscontainer.querySelectorAll('details');

	load(0,0);
};

async function tree() {
	await until(_ => DST.get('admin-tiers').tree);

	const divisions = GEOGRAPHY.divisions;

	function subtree(branch, j, title, y) {
		const s = ce('summary', title);
		const d = ce('details', s);
		s.onclick = load.bind(null, j, y);

		for (let i = 0; i < branch.length; i++) {
			if (!branch[i])
				continue;

			else if (branch[i] === 1) {
				const x = ce('div', divisions[j+1].csv.table[i]);
				x.onclick = load.bind(null, j+1, i);
				d.append(x);
			}

			else
				d.append(subtree(branch[i], j+1, divisions[j+1].csv.table[i], i));
		}

		return d;
	};

	const t = subtree(DST.get('admin-tiers').tree, 0, GEOGRAPHY.name);
	t.querySelector('summary').onclick = load.bind(null, 0, 0);

	return t;
};
