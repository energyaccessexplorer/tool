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
		r = '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 2.88-2.88 7.19-5 9.88C9.92 16.21 7 11.85 7 9z"/><circle cx="12" cy="9" r="2.5"/></svg>';
		break;

	case 'locality':
	case 'neighborhood':
		r = '<svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M12.36 6l.4 2H18v6h-3.36l-.4-2H7V6h5.36M14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6L14 4z"/></svg>';
		break;

	case 'district':
	case 'region':
		r = '<svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" height="24" viewBox="0 0 24 24" width="24"><g><path d="M0,0h24v24H0V0z" fill="none"/></g><g><g><path d="M19.74,18.33C21.15,16.6,22,14.4,22,12c0-5.52-4.48-10-10-10S2,6.48,2,12s4.48,10,10,10c2.4,0,4.6-0.85,6.33-2.26 c0.27-0.22,0.53-0.46,0.78-0.71c0.03-0.03,0.05-0.06,0.07-0.08C19.38,18.75,19.57,18.54,19.74,18.33z M12,20c-4.41,0-8-3.59-8-8 s3.59-8,8-8s8,3.59,8,8c0,1.85-0.63,3.54-1.69,4.9l-1.43-1.43c0.69-0.98,1.1-2.17,1.1-3.46c0-3.31-2.69-6-6-6s-6,2.69-6,6 s2.69,6,6,6c1.3,0,2.51-0.42,3.49-1.13l1.42,1.42C15.54,19.37,13.85,20,12,20z M13.92,12.51c0.17-0.66,0.02-1.38-0.49-1.9 l-0.02-0.02c-0.77-0.77-2-0.78-2.78-0.04c-0.01,0.01-0.03,0.02-0.05,0.04c-0.78,0.78-0.78,2.05,0,2.83l0.02,0.02 c0.52,0.51,1.25,0.67,1.91,0.49l1.51,1.51c-0.6,0.36-1.29,0.58-2.04,0.58c-2.21,0-4-1.79-4-4s1.79-4,4-4s4,1.79,4,4 c0,0.73-0.21,1.41-0.56,2L13.92,12.51z"/></g></g></svg>';
		break;

	default:
		r = '<svg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" height="24" viewBox="0 0 24 24" width="24"><g><rect fill="none" height="24" width="24"/></g><g><path d="M12,2C6.47,2,2,6.47,2,12c0,5.53,4.47,10,10,10s10-4.47,10-10C22,6.47,17.53,2,12,2z M12,20c-4.42,0-8-3.58-8-8 c0-4.42,3.58-8,8-8s8,3.58,8,8C20,16.42,16.42,20,12,20z"/></g></svg>';
		break;
	};

	return r;
};

function li(p) {
	p._name = p.place_name.replace(", " + GEOGRAPHY.name, '');

	const el = ce('li', p._name, {});

	el.prepend(ce('span', icon(p.place_type), { style: "vertical-align: sub; margin-right: 0.5em;" }));

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
