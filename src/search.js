import {
	fit as mapbox_fit,
	show_location_info,
} from './mapbox.js';

import {
	qs,
	qsa,
} from '../lib/helpers.js';

export function pointto(coords, dict, props, centerPointer = false) {
	const maparea = qs('#maparea');

	const {x,y} = MAPBOX.project(coords);

	const box = maparea.getBoundingClientRect();

	const position = {
		"x":      box.x + x,
		"y":      box.y + y,
		"lngLat": {"lng": coords[0], "lat": coords[1]},
	};

	show_location_info(coords, position, centerPointer);
};

export function zoom(p, fn) {
	for (const e of qsa('map-info'))
		e.remove();

	if (p.bbox)
		mapbox_fit(p.bbox, true);

	else if (p.center) {
		MAPBOX.flyTo({ "center": p.center, "zoom": 12, "speed": 2 });
	}
	else if (p.c) {
		MAPBOX.flyTo({ "center": p.c, "zoom": 12, "speed": 2 });
	}

	if (typeof fn === 'function')
		MAPBOX.once('moveend', fn);
};
