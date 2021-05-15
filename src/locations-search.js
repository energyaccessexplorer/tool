import {
	pointto as search_pointto,
	zoom,
} from './search.js';

let root, ul, input, resultscontainer;

let resultsinfo;

function pointto(p, a = false) {
	const dict = [[ "name", "Name" ]];
	const props = { name: p._name };

	search_pointto(p.center, dict, props, a);
};

async function reset() {
	elem_empty(ul);

	resultsinfo.innerHTML = "<b>Location search</b>.";
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

	el.prepend(ce('span', font_icon(icon(p.place_type)), { style: "font-size: 1.2em; margin-right: 0.8em;" }));

	el.onmouseenter = _ => pointto(p);

	el.onclick = _ => zoom(p, _ => pointto(p, true));

	return el;
};

function trigger(value) {
	const token = mapboxgl.accessToken;
	const q = encodeURI(value);

	const {left, top, right, bottom} = GEOGRAPHY.bounds;
	const box = [left, bottom, right, top];

	const types = ['region', 'district', 'place', 'locality', 'neighborhood', 'poi'];
	const search = `?limit=10&country=${GEOGRAPHY.cca2}&types=${types}&bbox=${box}&access_token=${token}`;

	fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json${search}`)
		.then(r => r.json())
		.then(r => {
			if (r.features.length)
				r.features.forEach(t => ul.append(li(t)));
			else
				resultsinfo.innerHTML = `No results`;
		});
};

export function init() {
	root = qs('#locations.search-panel');
	input = ce('input', null, { id: 'locations-search', autocomplete: 'off', class: 'search-input' });
	input.setAttribute('placeholder', 'Search for a location');

	root.prepend(input);

	resultscontainer = qs('#locations .search-results');
	ul = ce('ul');
	resultscontainer.append(ul);

	resultsinfo = ce('div', `<b>Location search</b>.`, { class: 'search-results-info' });
	resultscontainer.prepend(resultsinfo);

	input.onchange = function(_) {
		reset();

		if (this.value === "") return;

		trigger(this.value);
	};
};
