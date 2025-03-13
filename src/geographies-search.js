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

export async function load(x,y) {
	const fs = maybe(GEOGRAPHY.divisions, x, 'vectors', 'geojson', 'features');
	if (!fs) return;

	const geometry = fs.find(f => f['id'] === y);
	if (geometry) mapbox_fit(geojsonExtent(geometry), true);

	const d = GEOGRAPHY.divisions[x];
	await d.load('vectors');

	d.vectors.geojson.features.forEach(f => f.properties['__visible'] = (f.id === y));
	MAPBOX.getSource(d.id).setData(DST.get(d.id).vectors.geojson);
};

export async function init() {
	const panel = qs('#geographies.search-panel');
	input = ce('input', null, { "id": 'geographies-search', "autocomplete": 'off', "class": 'search-input' });
	input.setAttribute('placeholder', 'Geographies search');

	panel.prepend(input);

	resultscontainer = qs('#geographies .search-results');

	input.oninput = function() {
		trigger(this.value);
	};

	input.onfocus = function() {
		this.value = "";
		trigger(this.value);
	};

	const x = await until(_ => maybe(DST.get('admin-tiers'), 'tree'))
		.catch(err => {
			console.debug(err);
			throw new Error("NO ADMIN TIERS");
		});

	const d = await tree(x);
	if (!d) return ce('details');

	d.setAttribute('open', '');

	resultscontainer.replaceChildren(d);

	all = resultscontainer.querySelectorAll('summary,div');
	details = resultscontainer.querySelectorAll('details');

	resultscontainer.prepend(resultsinfo);
};

function tree($) {
	const divisions = GEOGRAPHY.divisions;
	const adm = GEOGRAPHY.adm;

	const a = DST.get('admin-tiers');

	try {
		if (and(adm !== 0, GEOGRAPHY.id != a.geography_id)) {
			const i = divisions[1].vectors.geojson.features[0].id;
			$ = $[a.csv.data.find(x => x['TIER'+(adm+1)] === i)['TIER'+adm]]; // figure out which adm-tier GEOGRAPHY belongs to

			if (!$) throw new Error("Failed finding current geography in parent's admin-tier", a.csv.data, adm, i);
		}
	} catch (err) {
		console.warn("Failed to create geography tree. Feature is still experimental.", err);
		return null;
	}

	function subtree(branch, j, title, y) {
		const s = ce('summary', title);
		const d = ce('details', s);
		d.subdiv = y;
		s.onclick = _ => {
			const t = d.getAttribute('open') === null;

			STATE.divtier = t ? j : j-1;
			STATE.subdiv  = t ? y : d.parentElement.subdiv;
		};

		for (let i = 0; i < branch.length; i++) {
			if (!branch[i])
				continue;

			else if (!divisions[j+1])
				continue;

			else if (branch[i] === 1) {
				const x = ce('div', divisions[j+1].csv.table[i]);

				x.onclick = _ => {
					STATE.divtier = j+1;
					STATE.subdiv  = i;
				};

				d.append(x);
			}

			else
				d.append(subtree(branch[i], j+1, divisions[j+1].csv.table[i], i));
		}

		return d;
	};

	const t = subtree($, 0, GEOGRAPHY.name);
	t.querySelector('summary').onclick = _ => {
		STATE.divtier = 0;
		STATE.subdiv = 0;
	};
	t.subdiv = 0;

	return t;
};
