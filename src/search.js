import {
	context as analysis_context,
} from './analysis.js';

import {
	pointer as mapbox_pointer,
	fit as mapbox_fit,
} from './mapbox.js';

let pointer;

export function pointto(coords, dict, props, a = false) {
	const maparea = qs('#maparea');

	const {x,y} = MAPBOX.project(coords);

	const rc = ea_coordinates_in_raster(coords, BOUNDARIES.raster);

	if (a) analysis_context(rc, dict, props, null);

	const td = table_data(dict, props);

	table_add_lnglat(td, coords);

	const box = maparea.getBoundingClientRect();

	if (pointer) pointer.drop();
	pointer = mapbox_pointer(td, box.x + x, box.y + y);
};

export function zoom(p, fn) {
	if (pointer) pointer.drop();

	if (p.bbox)
		mapbox_fit(p.bbox, true);

	else if (p.center) {
		MAPBOX.flyTo({ center: p.center, zoom: 12, speed: 2 });
	}
	else if (p.i) {
		MAPBOX.flyTo({ center: p.i, zoom: 12, speed: 2 });
	}

	if (typeof fn === 'function')
		MAPBOX.once('moveend', _ => fn(p, true));
};
