import {
	coordinates_to_raster_pixel,
	table_data,
} from './utils.js';

import {
	context,
} from './complicated.js';

import {
	fit as mapbox_fit,
	pointer as mapbox_pointer,
} from './mapbox.js';

import {
	qs,
} from '../lib/helpers.js';

let pointer;

export function pointto(coords, dict, props, a = false) {
	const maparea = qs('#maparea');

	const {x,y} = MAPBOX.project(coords);

	const rc = coordinates_to_raster_pixel(coords, OUTLINE.raster);

	if (a) context(rc, dict, props);

	const td = table_data(dict, props, coords);

	const box = maparea.getBoundingClientRect();

	if (pointer) pointer.drop();
	pointer = mapbox_pointer({"x": box.x + x, "y": box.y + y}, td);
};

export function zoom(p, fn) {
	if (pointer) pointer.drop();

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
