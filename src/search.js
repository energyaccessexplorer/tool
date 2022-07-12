import {
	fit as mapbox_fit,
	map_pointer,
} from './mapbox.js';

let pointer;

export function pointto(coords, dict, props, a = false) {
	const maparea = qs('#maparea');

	const {x,y} = MAPBOX.project(coords);

	const rc = coordinates_to_raster_pixel(coords, OUTLINE.raster);

	if (a) O.context(rc, dict, props);

	const td = table_data(dict, props, coords);

	const box = maparea.getBoundingClientRect();

	if (pointer) pointer.drop();
	pointer = map_pointer(td, box.x + x, box.y + y);
};

export function zoom(p, fn) {
	if (pointer) pointer.drop();

	if (p.bbox)
		mapbox_fit(p.bbox, true);

	else if (p.center) {
		MAPBOX.flyTo({ "center": p.center, "zoom": 12, "speed": 2 });
	}
	else if (p.i) {
		MAPBOX.flyTo({ "center": p.i, "zoom": 12, "speed": 2 });
	}

	if (typeof fn === 'function')
		MAPBOX.once('moveend', fn);
};
