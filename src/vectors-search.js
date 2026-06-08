import {
	pointto as search_pointto,
	zoom,
} from './search.js';

import {
	ce,
	maybe,
	qs,
	until,
} from '../lib/helpers.js';

import { tbind } from './translate.js';

let ul, input, resultscontainer, resultsinfo;

let ds, attr, searchable, searchable_attrs;

function pointto(f, centerPointer = false) {
	const t = MAPBOX.querySourceFeatures(ds.id, {
		"filter": ['==', attr, f.properties[attr] || "<justnotnull>"],
	});

	if (!t[0]) return;

	const [x,y] = (_ => {
		if (ds.type === 'points')
			return t[0].geometry.coordinates;
		else {
			const ext = geojsonExtent(t[0]);
			return [((ext[0] + ext[2]) / 2), ((ext[1] + ext[3]) / 2)];
		}
	})();

	const dict = [[ "name", ds.name ]];
	const props = { "name": f.properties[attr] };

	search_pointto([x,y], dict, props, centerPointer);
};

async function reset() {
	ds = STATE.datasets[0];

	if (!ds) return;

	ul.replaceChildren();

	if (!ds || !ds.vectors) {
		tbind(LOCALE, resultsinfo, { "text": ['left_panel.vectors_search.no_vectors', { "name": ds.name }] });
		searchable = false;
		return;
	}

	await until(_ => ds.vectors.data.features);

	if (maybe(ds.config, 'properties_search', 'length')) {
		const first = ds.vectors.data.features[0];

		for (const a of ds.config.properties_search) {
			if (!first.properties.hasOwnProperty(a))
				console.warn(`${ds.id}'s properties_search is misconfigured. Features' missing '${a}'`);
		}

		attr = ds.config.properties_search[0];
		searchable_attrs = ds.config.properties_search;
	}

	if (!(searchable = !!attr)) {
		tbind(LOCALE, resultsinfo, { "text": ['left_panel.vectors_search.not_searchable', { "name": ds.name }] });
		resultscontainer.replaceChildren(resultsinfo);
		return;
	}

	for (const f of ds.vectors.data.features) {
		if (f['__li']) continue;

		const li = ce('li', f.properties[attr]);
		li.onmouseenter = pointto.bind(null, f, false);
		li.onclick = _ => {
			const p = (_ => {
				if (ds.type === 'points')
					return { "center": f.geometry.coordinates };
				else {
					return { "bbox": geojsonExtent(f) };
				}
			})();

			zoom(p, pointto.bind(null, f, true));
		};

		f['__li'] = li;
	}

	resultscontainer.replaceChildren(resultsinfo, ul);
};

function trigger(value) {
	if (!searchable) return;

	ul.replaceChildren();

	let count = 0;
	let tooMany = false;

	for (let i = 0; i < ds.vectors.data.features.length; i++) {
		if (count > 100) {
			tooMany = true;
			break;
		}

		const f = ds.vectors.data.features[i];
		let matches = false;

		for (const [k,v] of Object.entries(f.properties)) {
			if (!searchable_attrs.includes(k)) continue;

			if (v && (v + "").match(new RegExp(value, 'i'))) {
				matches = true;
				continue;
			}
		}

		if (matches) {
			ul.append(f['__li']);
			count += 1;
		}
	}

	if (tooMany)
		tbind(LOCALE, resultsinfo, { "text": ['left_panel.vectors_search.too_many', { "name": ds.name }] });
	else
		tbind(LOCALE, resultsinfo, { "text": ['left_panel.vectors_search.results_count', { "name": ds.name, count }] });
};

export function init() {
	const panel = qs('#vectors.search-panel');
	input = ce('input', null, { "id": 'vectors-search', "autocomplete": 'off', "class": 'search-input' });
	input.setAttribute('placeholder', 'Search features');

	panel.prepend(input);

	resultscontainer = qs('#vectors .search-results');
	resultsinfo = qs('#vectors .search-results-info');
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
