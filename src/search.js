import {
	fit as mapbox_fit,
	get_map_position,
	show_location_info,
} from './mapbox.js';

import {
	qsa,
} from '../lib/helpers.js';

export function pointto(coords, dict, props, centerPointer = false) {
	show_location_info(coords, get_map_position(coords), centerPointer);
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
