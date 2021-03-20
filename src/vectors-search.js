import {
	pointto as search_pointto,
	zoom,
} from './search.js';

let root, ul, input, resultscontainer;

let ds, resultsinfo, attr, searchable;

function pointto(f, a = false) {
	const t = MAPBOX.querySourceFeatures(ds.source.id, {
		filter: ['==', attr, f.properties[attr] || "<justnotnull>"]
	});

	if (!t[0]) return;

	const [x,y] = (_ => {
		if (ds.datatype === 'points')
			return t[0].geometry.coordinates;
		else {
			const ext = geojsonExtent(t[0]);
			return [((ext[0] + ext[2]) / 2), ((ext[1] + ext[3]) / 2)];
		}
	})();

	const dict = [[ "name", ds.name ]];
	const props = { name: f.properties[attr] };

	search_pointto([x,y], dict, props, a);
};

async function reset() {
	ds = DST.get(U.inputs[0]);

	if (!ds) return;

	elem_empty(ul);
	resultscontainer.innerHTML = "";

	resultsinfo = ce('div', `<b>${ds.name}</b>.`, { class: 'search-results-info' });

	resultscontainer.append(resultsinfo);

	if (!ds || !ds.vectors) {
		resultscontainer.innerHTML = "";
		resultsinfo.innerHTML = `<b>${ds.name}</b> is not searchable. Try a dataset with polygons, points or lines ;)`;
		searchable = false;
		return;
	}

	await until(_ => ds.vectors.features.features);

	const first = ds.vectors.features.features[0];

	for (const a of ['name', 'Name', 'NAME']) {
		if (first.properties.hasOwnProperty(a)) { attr = a; break; }
	}

	if (!(searchable = !!attr)) {
		resultsinfo.innerHTML = `<b>${ds.name}</b> is not searchable (for now...)`;
		return;
	}

	for (const f of ds.vectors.features.features) {
		if (f['__li']) continue;

		const li = ce('li', f.properties[attr]);
		li.onmouseenter = _ => pointto(f, false);
		li.onclick = _ => {
			const p = (_ => {
				if (ds.datatype === 'points')
					return { center: f.geometry.coordinates };
				else {
					return { bbox: geojsonExtent(f) };
				}
			})();

			zoom(p, _ => pointto(f, true));
		};

		f['__li'] = li;
	}

	resultscontainer.append(ul);
};

function trigger(value) {
	if (!searchable) return;

	elem_empty(ul);

	let count = 0;
	for (let i = 0; i < ds.vectors.features.features.length; i++) {
		if (count > 100) {
			qs('div.search-results-info', resultscontainer).innerHTML = `Searching <b>${ds.name}</b>. Too many results. Showing first 101 <i>only</i>:`;
			break;
		}

		resultsinfo.innerHTML = `Searching <b>${ds.name}</b>. ${count} results:`;

		const f = ds.vectors.features.features[i];
		let matches = false;

		for (const [k,v] of Object.entries(f.properties)) {
			if (k !== attr) continue;

			if (v && v.match(new RegExp(value, 'i'))) {
				matches = true;
				continue;
			}
		}

		if (matches) {
			ul.append(f['__li']);
			count += 1;
		}
	}
};

export function init() {
	root = qs('#vectors.search-panel');
	input = ce('input', null, { id: 'vectors-search', autocomplete: 'off', class: 'search-input' });
	input.setAttribute('placeholder', 'Search features');

	root.prepend(input);

	resultscontainer = qs('#vectors .search-results');
	ul = ce('ul');

	input.oninput = function(_) {
		if (this.value === "") {
			reset();
			return;
		}

		trigger(this.value);
	};

	input.onfocus = function() {
		input.dispatchEvent(new Event('input'));
	};
};
