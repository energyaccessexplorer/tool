import {
	pointto as search_pointto,
	zoom,
} from './search.js';

let ul, input, resultscontainer;

let ds, resultsinfo, attr, searchable, searchable_attrs;

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

	ul.replaceChildren();

	resultsinfo = ce('div', ce('b', ds.name), { class: 'search-results-info' });

	if (!ds || !ds.vectors) {
		resultsinfo.replaceChildren(
			ce('b', ds.name), "is not searchable.",
			ce('br'), "Try a dataset with points, lines or polygons ;)",
		);
		searchable = false;
		return;
	}

	await until(_ => ds.vectors.features.features);

	if (maybe(ds.config, 'properties_search', 'length')) {
		const first = ds.vectors.features.features[0];

		for (let a of ds.config.properties_search) {
			if (!first.properties.hasOwnProperty(a))
				console.warn(`${ds.id}'s properties_search is misconfigured. Features' missing '${a}'`);
		}

		attr = ds.config.properties_search[0];
		searchable_attrs = ds.config.properties_search;
	}

	if (!(searchable = !!attr)) {
		resultsinfo.replaceChildren(ce('b', ds.name), " is not searchable (for now...)");
		return;
	}

	for (let f of ds.vectors.features.features) {
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

	resultscontainer.replaceChildren(resultsinfo, ul);
};

function trigger(value) {
	if (!searchable) return;

	ul.replaceChildren();

	let count = 0;
	for (let i = 0; i < ds.vectors.features.features.length; i++) {
		if (count > 100) {
			qs('div.search-results-info', resultscontainer).innerHTML = `Searching <b>${ds.name}</b>. Too many results. Showing first 101 <i>only</i>:`;
			break;
		}

		resultsinfo.innerHTML = `Searching <b>${ds.name}</b>. ${count} results:`;

		const f = ds.vectors.features.features[i];
		let matches = false;

		for (let [k,v] of Object.entries(f.properties)) {
			if (!searchable_attrs.includes(k)) continue;

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
	const panel = qs('#vectors.search-panel');
	input = ce('input', null, { id: 'vectors-search', autocomplete: 'off', class: 'search-input' });
	input.setAttribute('placeholder', 'Search features');

	panel.prepend(input);

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

	input.onkeypress = function(e) {
		if (e.key !== 'Enter') return;

		const c = qs('li', ul);

		if (c) c.dispatchEvent(new Event('click'));
	};
};
