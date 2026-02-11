import {
	super_error,
	bi_icon,
	coordinates_to_raster_pixel,
} from './utils.js';

import {
	context,
} from './complicated.js';

import {
	get_admin_area_layer_data,
} from './area-analysis.js';

import {
	ce,
	delay,
	maybe,
	qs,
	qsa,
	unique_by,
	until,
} from '../lib/helpers.js';

import mapinfo from './map-info.js';

function get_admin_area_item(variant, featureId) {
	const division = GEOGRAPHY.divisions[variant];
	if (!division || !division.priorityData || !division.vectors) return null;

	const features = division.vectors.data.features;
	const priorityData = division.priorityData;
	const nameTable = maybe(division, 'csv', 'table') || {};

	const id = featureId;
	const feature = features.find(f => f.id === +id);
	if (!feature || !priorityData[id]) return null;

	return {
		"id":       +id,
		"priority": priorityData[id].average,
		"name":     nameTable[id] || `Area ${id}`,
		"feature":  feature,
	};
}

let current_map_info_drop = null;

const default_styles = [{
	"name":  "Basic (default)",
	"value": "mapbox/basic-v9",
}, {
	"name":  "Light",
	"value": "mapbox/light-v10",
}, {
	"name":  "Satellite",
	"value": "mapbox/satellite-streets-v11",
}, {
	"name":  "Dark",
	"value": "mapbox/dark-v10",
}];

const styles = default_styles;

const projections = [{
	"name":  "Globe",
	"value": "globe",
}, {
	"name":  "Mercator",
	"value": "mercator",
}];

class MapboxThemeControl {
	onAdd(map) {
		this._map = map;
		this._container = document.createElement('div');
		this._container.className = 'mapboxgl-ctrl';
		this._container.classList.add('mapboxgl-ctrl-group');

		const button = ce('button', ce('div', bi_icon('layers-fill'), { "style": "transform: scale(0.75)" }), { "type": 'button', "class": 'mapboxgl-ctrl-icon'});

		this._container.append(button);

		button.addEventListener('mouseup', e => theme_control_popup(e.target.closest('button')));

		return this._container;
	};

	onRemove() {
		this._container.parentNode.removeChild(this._container);
		this._map = undefined;
	};
};

class MapboxProjectionControl {
	onAdd(map) {
		this._map = map;
		this._container = document.createElement('div');
		this._container.className = 'mapboxgl-ctrl';
		this._container.classList.add('mapboxgl-ctrl-group');

		const button = ce('button', ce('div', bi_icon('dribbble'), { "style": "transform: scale(0.75)" }), { "type": 'button', "class": 'mapboxgl-ctrl-icon'});

		this._container.append(button);

		button.addEventListener('mouseup', e => projection_control_popup(e.target.closest('button')));

		return this._container;
	};

	onRemove() {
		this._container.parentNode.removeChild(this._container);
		this._map = undefined;
	};
};


export function init() {
	mapboxgl.accessToken = EAE['settings'].mapbox_token;

	MAPBOX = new mapboxgl.Map({
		"container":             'mapbox-container',
		"trackResize":           true,
		"preserveDrawingBuffer": true, // this allows us to get canvas.toDataURL()
		"style":                 theme_pick(""),
	});

	MAPBOX.addControl(new mapboxgl.NavigationControl({ "showCompass": false }), 'top-left');

	MAPBOX.zoomTo(MAPBOX.getZoom() * 0.95, {"duration": 0});
	MAPBOX.doubleClickZoom.disable();
	MAPBOX.dragRotate.disable();
	MAPBOX.touchZoomRotate.disableRotation();

	MAPBOX.on('click', click);

	MAPBOX.addControl((new MapboxThemeControl()), 'top-left');
	MAPBOX.addControl((new MapboxProjectionControl()), 'top-left');

	MAPBOX.coords = fit(GEOGRAPHY.envelope);
	MAPBOX.setStyle(theme_pick(EAE['settings'].mapbox_theme));
};

function projection_control_popup(_) {
	const x = ce('div', null, { "class": 'mapbox-control-popup' });
	const radios = ce('div');

	for (const t of projections) {
		const e = ce('div', null, { "class": 'radio-group' });

		e.append(
			ce('input', null, {
				"id":    `mapbox_projection_${t.value}`,
				"type":  "radio",
				"name":  "mapbox_projection",
				"value": t.value,
			}),
			ce('label', t.name, { "for": `mapbox_projection_${t.value}` }),
		);

		radios.append(e);
	}

	const current = qs(`input[value="${MAPBOX.getProjection()?.name}"]`, radios);
	if (current) current.setAttribute('checked', true);

	qsa('input[name="mapbox_projection"]', radios)
		.forEach(e => e.addEventListener('change', _ => MAPBOX.setProjection(e.value)));

	x.addEventListener('mouseleave', x.remove);

	x.append(radios);

	x.style = `
position: absolute;
top: 120px;
left: 10px;
background-color: white;
box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
border-radius: 4px;
padding: 16px;
`;

	qs('#maparea').append(x);
};

function theme_control_popup(_) {
	const x = ce('div', null, { "class": 'mapbox-control-popup' });
	const radios = ce('div');

	for (const t of styles) {
		const e = ce('div', null, { "class": 'radio-group' });

		e.append(
			ce('input', null, {
				"id":    `mapbox_theme_${t.value}`,
				"type":  "radio",
				"name":  "mapbox_theme",
				"value": t.value,
			}),
			ce('label', t.name, { "for": `mapbox_theme_${t.value}` }),
		);

		radios.append(e);
	}

	const current = qs(`input[value="${EAE['settings'].mapbox_theme}"]`, radios);
	if (current) current.setAttribute('checked', true);

	qsa('input[name="mapbox_theme"]', radios)
		.forEach(e => e.addEventListener('change', _ => change_theme(e.value)));

	x.addEventListener('mouseleave', x.remove);

	x.append(radios);

	x.style = `
position: absolute;
top: 120px;
left: 10px;
background-color: white;
box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
border-radius: 4px;
padding: 16px;
`;

	qs('#maparea').append(x);
};

function theme_pick(theme) {
	const t = (theme === "" ? null : theme);

	return (t ? `mapbox://styles/${t}` : {
		"version": 8,
		"sources": {},
		"layers":  [{
			"id":    'background',
			"type":  'background',
			"paint": {
				"background-color": 'white',
			},
		}],
	});
};

async function worldview() {
	let v = "US";

	if (GEOGRAPHY.circles.includes("india")) v = "IN";

	if (!MAPBOX.getLayer('admin-0-boundary-disputed')) return;

	MAPBOX.setFilter('admin-0-boundary-disputed', [
		'all',
		['==', ['get', 'disputed'], 'true'],
		['==', ['get', 'admin_level'], 0],
		['==', ['get', 'maritime'], 'false'],
		['match', ['get', 'worldview'], ['all', v], true, false],
	]);

	MAPBOX.setFilter('admin-0-boundary', [
		'all',
		['==', ['get', 'admin_level'], 0],
		['==', ['get', 'disputed'], 'false'],
		['==', ['get', 'maritime'], 'false'],
		['match', ['get', 'worldview'], ['all', v], true, false],
	]);

	MAPBOX.setFilter('admin-0-boundary-bg', [
		'all',
		['==', ['get', 'admin_level'], 0],
		['==', ['get', 'maritime'], 'false'],
		['match', ['get', 'worldview'], ['all', v], true, false],
	]);
}

export function change_theme(theme, soft) {
	async function go() {
		const c = MAPBOX.getStyle().layers.find(l => l.type === 'symbol');
		MAPBOX.first_symbol = maybe(c, 'id');

		await until(_ => MAPBOX.isStyleLoaded());

		worldview();
	};

	MAPBOX.once('style.load', go);

	if (!soft)
		MAPBOX.setStyle(theme_pick(EAE['settings'].mapbox_theme = theme));

	if (theme === "") go();

	COMMIT();
};

export function fit(bounds, animate = false) {
	const rect = qs('#maparea').getBoundingClientRect();

	const hp = (rect.width > rect.height) ? 0 : (rect.width * 0.1);
	const vp = (rect.height > rect.width) ? 0 : (rect.height * 0.1);

	try {
		MAPBOX.fitBounds(bounds, { "animate": animate, "padding": { "top": vp, "bottom": vp, "left": hp, "right": hp } });
	} catch (e) {
		super_error(
			"Geography bounding box",
			`
Mapbox says:
${e}

Tried to fit to:
	${JSON.stringify(bounds)}

This is fatal. Thanks for all the fish.`,
		);

		throw new Error("Could not set geography's bounds. Ciao");
	}

	const [left, bottom, right, top] = bounds;

	return [[left,top], [right,top], [right,bottom], [left,bottom]];
};

export function drop_map_info() {
	if (current_map_info_drop) current_map_info_drop();
}

export function pointer({x = 0, y = 0, lngLat = null}, data) {
	for (const e of qsa('bubble-message'))
		e.remove();

	for (const e of qsa('map-info'))
		e.remove();

	let cls = false;
	let pos = "W";

	if (MOBILE) {
		cls = true;
		pos = "C";
	}

	function drop() {
		if (mark._preventDrop) return;
		if (onMove) MAPBOX.off('move', onMove);
		mark.remove();
	};

	const mark = new mapinfo({ "position": pos, "data": data, "close": cls, "onClose": drop, "point": { x, y } });

	function updatePosition() {
		if (!lngLat) return;

		const point = MAPBOX.project(lngLat);
		const mapContainer = MAPBOX.getContainer().getBoundingClientRect();

		const newX = mapContainer.left + point.x;
		const newY = mapContainer.top + point.y;

		mark.updatePoint(newX, newY);
	}

	let onMove;
	if (lngLat) {
		onMove = () => updatePosition();
		MAPBOX.on('move', onMove);
	}

	return {
		drop,
	};
};

export function text_search({
	query,
	limit = 10,
	box = GEOGRAPHY.envelope,
	types = ['region', 'district', 'place', 'locality', 'neighborhood', 'poi'],
}) {
	const q = encodeURI(query);
	const search = `?limit=${limit}&country=${GEOGRAPHY.cca2}&types=${types}&bbox=${box}&access_token=${mapboxgl.accessToken}`;

	return fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json${search}`)
		.then(r => r.json());
};

export function coords_search_pois({
	coords,
	limit = 10,
	radius = 500,
}) {
	const query = [
		`radius=${radius}`,
		`limit=${limit}`,
		`dedupe`,
		`geometry=point`,
		`access_token=${EAE['settings'].mapbox_token}`,
	].join('&');

	return fetch(`https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${coords}.json?${query}`)
		.then(r => r.json())
		.catch(_ => ({ "features": [] }))
		.then(r => {
			return unique_by(
				r.features.filter(f => maybe(f, 'properties', 'name')),
				t => maybe(t, 'properties', 'name'),
			).map(f => ({
				"name":        f.properties.name,
				"coordinates": f.geometry.coordinates,
			}));
		});
};

export async function sort() {
	const datasets = STATE.datasets.map(d => d.hosts ? d.host : d);

	const layers = [].concat(...datasets.map(d => d._layers));

	await Promise.all(layers.map(i => until(_ => MAPBOX.getLayer(i))));

	for (let i = 0; i < layers.length; i++) {
		MAPBOX.moveLayer(
			layers[i],
			(i === 0) ? MAPBOX.first_symbol : layers[i-1],
		);
	}
};

export function show_location_info(ll, position, centerPointer = true) {
	const raster_pixel = coordinates_to_raster_pixel(ll, OUTLINE.raster);

	const pt = MAPBOX.project(ll);
	const features = MAPBOX.queryRenderedFeatures([[pt.x - 10, pt.y - 10],
		[pt.x + 10, pt.y + 10]]);

	const dotFeature = features.find(feat => feat && maybe(feat, 'geometry', 'type') === 'Point');
	if (dotFeature) {
		const [lng, lat] = dotFeature.geometry.coordinates;
		ll = [lng, lat];
		const snapped = MAPBOX.project([lng, lat]);
		const mapRect = MAPBOX.getContainer().getBoundingClientRect();
		position.x = mapRect.left + snapped.x;
		position.y = mapRect.top + snapped.y;
		position.lngLat = { lng, lat };
	}

	const [fields, props, raw] = context(raster_pixel, features);

	const ac = coordinates_to_raster_pixel(ll, {
		"data":   MAPBOX.getSource('output-source').raster,
		"nodata": -1,
	});

	let analysis_value = null;
	let analysis_name = null;
	if (Number.isFinite(maybe(ac, 'value'))) {
		analysis_value = ac.value;
		analysis_name = EAE['indexes'][STATE.index]['name'];
	}

	coords_search_pois({ "coords": ll, "limit": 1 })
		.then(r => {
			const feature_name = maybe(r, 0, 'name') || null;
			const { drop } = pointer(position, { fields, props, ll, analysis_value, analysis_name, feature_name, raw });
			current_map_info_drop = drop;

			if (centerPointer) ensure_map_info_visible();
		});
}

function ensure_map_info_visible() {
	delay(0.1).then(() => {
		const mapInfo = qs('map-info');
		if (!mapInfo) return;

		const mapContainer = qs('#maparea').getBoundingClientRect();
		const mapInfoBox = mapInfo.getBoundingClientRect();
		const rightPanel = qs('#right-panel');
		const leftPanel = qs('#left-panel');

		let visibleLeft = mapContainer.left;
		let visibleRight = mapContainer.right;

		if (leftPanel) {
			const leftBox = leftPanel.getBoundingClientRect();
			if (leftBox.width > 0) {
				visibleLeft = Math.max(visibleLeft, leftBox.right);
			}
		}

		if (rightPanel) {
			const rightBox = rightPanel.getBoundingClientRect();
			if (rightBox.width > 0) {
				visibleRight = Math.min(visibleRight, rightBox.left);
			}
		}

		const controlsPadding = 60;

		const visibleTop = mapContainer.top;
		const visibleBottom = mapContainer.bottom - controlsPadding;

		visibleLeft += controlsPadding;

		const isFullyVisible =
			mapInfoBox.left >= visibleLeft &&
			mapInfoBox.right <= visibleRight &&
			mapInfoBox.top >= visibleTop &&
			mapInfoBox.bottom <= visibleBottom;

		if (!isFullyVisible) {
			let offsetX = 0;
			let offsetY = 0;

			if (mapInfoBox.right > visibleRight) {
				offsetX = mapInfoBox.right - visibleRight;
			} else if (mapInfoBox.left < visibleLeft) {
				offsetX = mapInfoBox.left - visibleLeft;
			}

			if (mapInfoBox.bottom > visibleBottom) {
				offsetY = mapInfoBox.bottom - visibleBottom;
			} else if (mapInfoBox.top < visibleTop) {
				const map_info_dot = qs('map-info .dot');
				const pointerBox = map_info_dot ? map_info_dot.getBoundingClientRect() : null;
				if (pointerBox) {
					offsetY = mapInfoBox.top - pointerBox.top;
				} else {
					offsetY = mapInfoBox.top - visibleTop;
				}
			}

			const currentCenter = MAPBOX.getCenter();

			const centerPoint = MAPBOX.project(currentCenter);
			const targetPoint = {
				"x": centerPoint.x + offsetX,
				"y": centerPoint.y + offsetY,
			};

			const targetCenter = MAPBOX.unproject(targetPoint);

			const map_info = qs('map-info');
			if (map_info) {
				map_info._preventDrop = true;

				MAPBOX.once('moveend', () => {
					if (map_info) map_info._preventDrop = false;
				});
			}

			MAPBOX.easeTo({
				"center":   targetCenter,
				"duration": 300,
			});
		}
	});
}

export function show_admin_area_info(item, position, centerPointer = false) {
	const variant = STATE.variant;
	const [fields, props, raw] = get_admin_area_layer_data(variant, item.id);

	const info = { "variant": variant, "name": item.name };
	const analysis_name = EAE['indexes'][STATE.index]['name'];

	const { drop } = pointer(position, {
		fields,
		props,
		"ll":             null,
		"analysis_value": item.priority,
		"analysis_name":  analysis_name,
		"feature_name":   item.name,
		"area_info":      info,
		raw,
	});

	current_map_info_drop = drop;

	if (centerPointer) ensure_map_info_visible();
}

function get_clicked_admin_area_item(e) {
	if (STATE.variant === 'raster') return null;

	const layerId = `priority-layer-${STATE.variant}`;
	const features = MAPBOX.queryRenderedFeatures(e.point, { "layers": [layerId] });
	if (features.length === 0) return null;

	return get_admin_area_item(STATE.variant, features[0].id);
}

function click(e) {
	const ll = [e.lngLat.lng, e.lngLat.lat];

	COORDINATES.unshift({ "c": ll });
	qs('#points.search-panel').dispatchEvent(new Event('activate'));

	const position = {
		"x":      maybe(e, 'originalEvent', 'pageX'),
		"y":      maybe(e, 'originalEvent', 'pageY'),
		"lngLat": e.lngLat,
	};

	const item = get_clicked_admin_area_item(e);

	if (item) {
		show_admin_area_info(item, position, true);
	} else {
		show_location_info(ll, position);
	}
};
