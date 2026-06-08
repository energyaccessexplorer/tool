import {
	coords_search_pois,
} from './mapbox.js';

import {
	setup_about_button,
} from './right-panel-graphs.js';

import { translateNode } from './translate.js';

import {
	tmpl,
	qs,
} from '../lib/helpers.js';

import bind from '../lib/bind.js';

const MAX_POINTS = 15;
const RADIUS_KM  = 25;

export async function update(ll) {
	const container = qs('#poi-card-container');
	if (!container || !ll) return;

	container.innerHTML = '';

	const raw = await coords_search_pois({
		"coords": ll,
		"limit":  50,
		"radius": RADIUS_KM * 1000,
	});

	const results = raw
		.filter(p => p.layer !== 'place_label')
		.slice(0, MAX_POINTS);

	if (!results.length) return;

	const n = results.length;
	const max_dist_m = Math.max(...results.map(p => p.dist_m ?? 0));
	const radius_km = Math.round(max_dist_m / 100) / 10;

	const card = tmpl('#poi-card-template');

	bind(card, {
		"description": `There ${n === 1 ? 'is' : 'are'} <strong>${n}</strong> `
			+ `point${n === 1 ? '' : 's'} of interest within <strong>${radius_km}km</strong> `
			+ `of this area of interest.`,
		"points": results.map(poi => ({
			"name": poi.name,
			"kind": poi.kind ?? '',
		})),
	});

	setup_about_button(card, 'Shows points of interest near the selected pixel.');
	translateNode(window.LOCALE, card);
	container.append(card);
}

export function clear() {
	const container = qs('#poi-card-container');
	if (container) container.innerHTML = '';
}
