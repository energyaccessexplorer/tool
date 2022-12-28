import {
	pointto as search_pointto,
	zoom,
} from './search.js';

import {
	text_search as mapbox_text_search,
} from './mapbox.js';

let ul, input, resultscontainer;

let resultsinfo;

function pointto(p, a = false) {
	const dict = [[ "name", "Name" ]];
	const props = { "name": p._name };

	search_pointto(p.center, dict, props, a);
};

async function reset(v) {
	ul.replaceChildren();

	resultsinfo.replaceChildren(ce('b', "Results"), ` for "${v}":`);
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

	el.prepend(ce('span', font_icon(icon(p.place_type)), { "style": "font-size: 1.2em; margin-right: 0.8em;" }));

	el.onmouseenter = _ => pointto(p);

	el.onclick = _ => zoom(p, _ => pointto(p, true));

	return el;
};

function trigger(v) {
	mapbox_text_search({ "query": v })
		.then(r => {
			if (!maybe(r, 'features', 'length')) {
				resultsinfo.innerHTML = `No results for "${v}".`;
				return;
			}

			r.features.forEach(t => ul.append(li(t)));
		});
};

export function init() {
	const panel = qs('#locations.search-panel');
	input = ce('input', null, { "id": 'locations-search', "autocomplete": 'off', "class": 'search-input' });
	input.setAttribute('placeholder', 'Search for a location');

	panel.prepend(input);

	resultscontainer = qs('#locations .search-results');
	ul = ce('ul');
	resultscontainer.append(ul);

	resultsinfo = ce('div', ce('i', "City, region, park..."), { "class": 'search-results-info' });
	resultscontainer.prepend(resultsinfo);

	input.onchange = function(_) {
		reset(input.value);

		if (this.value === "") return;

		trigger(this.value);
	};

	const n = GEOGRAPHY.name.replace(/\ ?(training|test)\ ?/i, '');

	fetch(`${ea_settings.world}/countries?select=cca2&or=(names->>official.eq.${n},name.eq.${n})`)
		.then(r => r.json())
		.then(r => GEOGRAPHY.cca2 = maybe(r, 0, 'cca2'));
};
