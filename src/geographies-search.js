import {
	fit as mapbox_fit,
} from './mapbox.js';

let input, resultscontainer;
let all = [];
let details = [];

const defaultinfo = "Showing all subgeographies";
const resultsinfo = ce('div', defaultinfo, { "class": 'search-results-info' });

function trigger(value) {
	details.forEach(x => x.removeAttribute('open'));

	const re = new RegExp(value, 'i');
	if (String(re) === "/(?:)/i") {
		all.forEach(x => {
			x.classList.remove('matches');
			x.classList.remove('nonmatch');
		});

		details[0]?.setAttribute('open', '');

		resultsinfo.innerText = defaultinfo;

		return;
	}

	all.forEach(x => {
		x.classList.remove('matches');
		x.classList.remove('nonmatch');

		if (x.textContent.match(re))
			x.classList.add('matches');
		else
			x.classList.add('nonmatch');
	});

	details.forEach(x => {
		if (x.querySelector('.matches')) x.setAttribute('open', '');
	});

	const l = resultscontainer.querySelectorAll('.matches').length;
	resultsinfo.innerText = l ? l + " results" : defaultinfo;
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

	O.view = U.view;
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

	const x = await until(_ => maybe(DST.get('admin-tiers'), 'tree'))
		.catch(err => {
			console.debug(err);
			throw "NO ADMIN TIERS";
		});

	const d = await tree(x);
	d.setAttribute('open', '');

	resultscontainer.replaceChildren(d);

	all = resultscontainer.querySelectorAll('summary,div');
	details = resultscontainer.querySelectorAll('details');

	resultscontainer.prepend(resultsinfo);

	load(0,0);
};

function tree($) {
	const divisions = GEOGRAPHY.divisions;

	function subtree(branch, j, title, y) {
		const s = ce('summary', title);
		const d = ce('details', s);
		d.subdiv = y;
		s.onclick = _ => {
			const t = d.getAttribute('open') === null;

			if (t)
				load(j, y);
			else
				load(j-1, d.parentElement.subdiv);
		};

		for (let i = 0; i < branch.length; i++) {
			if (!branch[i])
				continue;

			else if (!divisions[j+1])
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

	const t = subtree($, 0, GEOGRAPHY.name);
	t.querySelector('summary').onclick = load.bind(null, 0, 0);
	t.subdiv = 0;

	return t;
};
