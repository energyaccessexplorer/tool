import {
	pointto as search_pointto,
	zoom,
} from './search.js';

import {
	text_search as mapbox_text_search,
} from './mapbox.js';

import {
	bi_icon,
} from './utils.js';

import {
	ce,
	maybe,
	qs,
} from '../lib/helpers.js';

import { tbind } from './translate.js';

let ul, input, resultscontainer, resultsinfo;

function pointto(p, centerPointer = false) {
	const dict = [[ "name", "Name" ]];
	const props = { "name": p._name };

	search_pointto(p.center, dict, props, centerPointer);
};

async function reset(v) {
	ul.replaceChildren();

	tbind(LOCALE, resultsinfo, { "text": ['left_panel.locations_search.results_for', { "query": v }] });
};

function icon(t) {
	let r = null;

	switch(t[0]) {
	case 'place':
		r = 'geo-alt';
		break;

	case 'locality':
	case 'neighborhood':
		r = 'flag';
		break;

	case 'district':
	case 'region':
		r = 'textarea';
		break;

	default:
		r = 'circle';
		break;
	};

	return r;
};

function li(p) {
	p._name = p.place_name.replace(", " + GEOGRAPHY.name, '');

	const el = ce('li', p._name, {});

	el.prepend(ce('span', bi_icon(icon(p.place_type)), { "style": "font-size: 1.2em; margin-right: 0.8em;" }));

	el.onmouseenter = _ => pointto(p);

	el.onclick = _ => zoom(p, _ => pointto(p, true));

	return el;
};

function trigger(v) {
	mapbox_text_search({ "query": v })
		.then(r => {
			if (!maybe(r, 'features', 'length')) {
				tbind(LOCALE, resultsinfo, { "text": ['left_panel.locations_search.no_results', { "query": v }] });
				return;
			}

			r.features.forEach(t => ul.append(li(t)));
		});
};

export async function init() {
	const panel = qs('#locations.search-panel');
	input = ce('input', null, { "id": 'locations-search', "autocomplete": 'off', "class": 'search-input' });
	input.setAttribute('placeholder', 'Search for a location');

	panel.prepend(input);

	resultscontainer = qs('#locations .search-results');
	resultsinfo = qs('#locations .search-results-info');
	ul = ce('ul');
	resultscontainer.append(ul);

	tbind(LOCALE, resultsinfo, { "text": 'left_panel.locations_search.hint' });

	input.onchange = function(_) {
		reset(input.value);

		if (this.value === "") return;

		trigger(this.value);
	};

	let n;
	if (GEOGRAPHY.parent_id)
		n = (await API.get('geographies', { "select": "name", "id": `eq.${GEOGRAPHY.parent_id}`}, { "one": true }))['name'];
	else
		n = GEOGRAPHY.name.replace(new RegExp("\\ ?\\(?(" + ENV.join('|') + ")\\)?", "i"), '');

	fetch(`${EAE['settings'].world}/countries?select=cca2&or=(names->>official.eq."${n}",name.eq."${n}")`)
		.then(r => r.json())
		.then(r => GEOGRAPHY.cca2 = maybe(r, 0, 'cca2'));
};
