import {
	super_error,
	bi_icon,
	closest_feature,
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
import bubblemessage from '../lib/bubblemessage.js';

import { t, translateIndexName } from './translate.js';

export function get_admin_area_item(variant, id) {
	const division = GEOGRAPHY.divisions[variant];
	if (!division || !division.priorityData || !division.vectors) return null;

	const features = division.vectors.data.features;
	const priorityData = division.priorityData;
	const nameTable = maybe(division, 'csv', 'table') || {};

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
let popup_token = 0;

export function get_map_position(coords) {
	const {x, y} = MAPBOX.project(coords);
	const box = qs('#maparea').getBoundingClientRect();

	return {
		"x":      box.x + x,
		"y":      box.y + y,
		"lngLat": {"lng": coords[0], "lat": coords[1]},
	};
}

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

function attach_tooltip(el, key) {
	let p;
	el.addEventListener('mouseenter', () => { p = new bubblemessage({ "position": "E", "message": t(window.LOCALE, key), "close": false }, el); });
	el.addEventListener('mouseleave', () => { if (p) p.remove(); });
}

class MapboxThemeControl {
	onAdd(map) {
		this._map = map;
		this._container = document.createElement('div');
		this._container.className = 'mapboxgl-ctrl';
		this._container.classList.add('mapboxgl-ctrl-group');

		const button = ce('button', ce('div', bi_icon('layers-fill'), { "style": "transform: scale(0.75)" }), { "type": 'button', "class": 'mapboxgl-ctrl-icon' });

		this._container.append(button);

		button.addEventListener('mouseup', e => theme_control_popup(e.target.closest('button')));
		attach_tooltip(button, 'map.controls.basemap');

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

		const button = ce('button', ce('div', bi_icon('dribbble'), { "style": "transform: scale(0.75)" }), { "type": 'button', "class": 'mapboxgl-ctrl-icon' });

		this._container.append(button);

		button.addEventListener('mouseup', e => projection_control_popup(e.target.closest('button')));
		attach_tooltip(button, 'map.controls.projection');

		return this._container;
	};

	onRemove() {
		this._container.parentNode.removeChild(this._container);
		this._map = undefined;
	};
};

class MapboxNorthArrowControl {
	onAdd(map) {
		this._map = map;
		this._container = document.createElement('div');
		this._container.className = 'mapboxgl-ctrl north-arrow-ctrl';
		this._container.innerHTML = `<svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">
			<text x="14" y="9" text-anchor="middle" font-size="9" font-weight="bold" fill="#333" font-family="sans-serif">N</text>
			<polygon points="14,12 20,26 14,23 8,26" fill="#333"/>
		</svg>`;
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

	const zoom_in = qs('.mapboxgl-ctrl-zoom-in');
	const zoom_out = qs('.mapboxgl-ctrl-zoom-out');
	if (zoom_in) attach_tooltip(zoom_in, 'map.controls.zoom_in');
	if (zoom_out) attach_tooltip(zoom_out, 'map.controls.zoom_out');

	MAPBOX.zoomTo(MAPBOX.getZoom() * 0.95, {"duration": 0});
	MAPBOX.doubleClickZoom.disable();
	MAPBOX.dragRotate.disable();
	MAPBOX.touchZoomRotate.disableRotation();

	// Mapbox's ScrollZoom only listens for wheel events on
	// `.mapboxgl-canvas-container`, so a wheel over any overlay that is not one
	// of its descendants (the scale bar, a map-info card, a control popup) never
	// reaches it and the map won't zoom. Forward those wheel events straight to
	// the scrollZoom handler so scroll zoom works over the whole map area.
	qs('#maparea').addEventListener('wheel', e => {
		// Mapbox already handles wheel events that start inside the canvas
		// container — forwarding those would double-zoom.
		if (e.target.closest('.mapboxgl-canvas-container')) return;

		// If the wheel happens over a map-info card whose detailed-data
		// section is actually scrollable, let the card scroll natively
		// instead of zooming the map.
		const card = e.target.closest('map-info');
		if (card) {
			const detailed = qs('.detailed-data', card);
			if (detailed && detailed.scrollHeight > detailed.clientHeight) {
				return;
			}
		}

		MAPBOX.scrollZoom.wheel(e);
	});

	// The "Show Analysis Results" button floats over the map but lives outside
	// `#maparea`, so its wheel events never reach the listener above.
	const show = qs('#right-panel-show');
	if (show) show.addEventListener('wheel', e => MAPBOX.scrollZoom.wheel(e));

	MAPBOX.on('click', click);

	MAPBOX.addControl((new MapboxThemeControl()), 'top-left');
	MAPBOX.addControl((new MapboxProjectionControl()), 'top-left');

	MAPBOX.addControl(new MapboxNorthArrowControl(), 'bottom-left');
	MAPBOX.addControl(new mapboxgl.ScaleControl({ "maxWidth": 150, "unit": "metric" }), 'bottom-left');
	MAPBOX.addControl(new mapboxgl.ScaleControl({ "maxWidth": 150, "unit": "imperial" }), 'bottom-left');

	MAPBOX.coords = fit(GEOGRAPHY.envelope);
	change_theme(EAE['settings'].mapbox_theme);
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

// Adding sources and layers before mapbox's style has been applied throws
// "Style is not done loading" (Style.addSource/addLayer call Style._checkLoaded).
//
// Wait for it on mapbox's own event rather than by polling isStyleLoaded() in a
// timer loop. That distinction is the whole point when the tab is in the
// background: browsers clamp timers in hidden tabs to roughly one tick per
// second, so a poll turns into a clock the browser controls, and everything
// queued behind it — including dataset downloads — waits on that clock. mapbox
// fires style.load from its style fetch and parse completing, which is network
// work, so this resolves while the tab is hidden.
export function style_ready(timeout = 30000) {
	if (!MAPBOX) return Promise.reject(new Error('style_ready: mapbox is not initialised'));
	if (MAPBOX.isStyleLoaded()) return Promise.resolve();

	return new Promise(resolve => {
		const done = () => {
			clearTimeout(timer);
			MAPBOX.off('style.load', done);
			MAPBOX.off('styledata', done);
			resolve();
		};

		// Both events, because they cover different paths: style.load fires when a
		// style finishes loading (first load, or a full replacement), while
		// styledata also fires for in-place style updates — setStyle with the same
		// stylesheet, sprite/glyph changes — where style.load does not fire again.
		// Waiting on one of them leaves a window where the style is usable but we
		// are still waiting, which costs the whole timeout.
		MAPBOX.once('style.load', done);
		MAPBOX.once('styledata', done);

		// Never hang the load on a style that is not going to arrive. If this
		// fires, the add_source/add_layers that follows throws, and the dataset
		// loaders catch that per dataset — so one dataset fails loudly instead
		// of the app spinning forever.
		const timer = setTimeout(() => {
			console.warn('style_ready: gave up waiting for the mapbox style');
			done();
		}, timeout);
	});
};

export function change_theme(theme) {
	async function go() {
		const c = MAPBOX.getStyle().layers.find(l => l.type === 'symbol');
		MAPBOX.first_symbol = maybe(c, 'id');

		await until(_ => MAPBOX.isStyleLoaded(), Infinity);

		worldview();
	};

	MAPBOX.once('style.load', go);

	const style = theme_pick(EAE['settings'].mapbox_theme = theme);

	if (typeof style === 'object') {
		MAPBOX.setStyle(style);
	} else {
		const url = style.replace('mapbox://styles/', 'https://api.mapbox.com/styles/v1/') + `?access_token=${EAE['settings'].mapbox_token}`;
		fetch(url)
			.then(r => r.json())
			.then(s => {
				s.layers = s.layers.filter(l => !l.id.startsWith('admin'));
				MAPBOX.setStyle(s);
			});
	}

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
		if (lngLat) MAPBOX.off('move', updatePosition);
		mark.remove();
	};

	const mark = new mapinfo({ "position": pos, "data": data, "close": cls, "onClose": drop, "point": { x, y } });

	function updatePosition() {
		const { x, y } = get_map_position([lngLat.lng, lngLat.lat]);
		mark.updatePoint(x, y);
	}

	if (lngLat) {
		MAPBOX.on('move', updatePosition);
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
				"kind":        f.properties.type || null,
				"coordinates": f.geometry.coordinates,
				"dist_m":      f.properties.tilequery?.distance ?? null,
				"layer":       f.properties.tilequery?.layer ?? null,
			}));
		});
};

export async function sort() {
	const datasets = STATE.datasets.map(d => d.hosts ? d.host : d);

	const layers = [].concat(...datasets.map(d => d._layers));

	await Promise.all(layers.map(i => until(_ => MAPBOX.getLayer(i), Infinity)));

	for (let i = 0; i < layers.length; i++) {
		MAPBOX.moveLayer(
			layers[i],
			(i === 0) ? MAPBOX.first_symbol : layers[i-1],
		);
	}
};

async function resolve_click_selection(ll) {
	const SNAP_RADIUS_M = 50;

	const raster_pixel = coordinates_to_raster_pixel(ll, OUTLINE.raster);

	const meters_per_pixel = 156543.03392 * Math.cos(ll[1] * Math.PI / 180) / Math.pow(2, MAPBOX.getZoom());
	const snap_px = SNAP_RADIUS_M / meters_per_pixel;

	const pt = MAPBOX.project(ll);
	const features = MAPBOX.queryRenderedFeatures([[pt.x - snap_px, pt.y - snap_px],
		[pt.x + snap_px, pt.y + snap_px]]);

	let vector_match = null;
	for (const d of STATE.datasets) {
		if (!d.vectors || !maybe(d.config, 'attributes_map', 'length')) continue;

		const match = closest_feature(features, ll, feat => feat.source === d.id);
		if (match && (!vector_match || match.distance < vector_match.distance)) {
			vector_match = { "dataset": d, "feature": match.feature, "distance": match.distance };
		}
	}

	const dot = closest_feature(features, ll, feat => maybe(feat, 'geometry', 'type') === 'Point');
	const snapped_ll = dot ? dot.feature.geometry.coordinates : ll;

	const feature_name = vector_match
		? null
		: maybe(await coords_search_pois({ "coords": snapped_ll, "limit": 1, "radius": SNAP_RADIUS_M }), 0, 'name');

	return { raster_pixel, vector_match, "ll": snapped_ll, feature_name };
}

export function show_location_info(ll, position, centerPointer = true) {
	const token = ++popup_token;

	resolve_click_selection(ll).then(({ raster_pixel, vector_match, ll, feature_name }) => {
		if (token !== popup_token) return;

		Object.assign(position, get_map_position(ll));

		const [fields, props, raw] = context(raster_pixel, vector_match);

		const ac = coordinates_to_raster_pixel(ll, {
			"data":   MAPBOX.getSource('output-source').raster,
			"nodata": -1,
		});

		let analysis_value = null;
		let analysis_name = null;
		if (Number.isFinite(maybe(ac, 'value'))) {
			analysis_value = ac.value;
			analysis_name = translateIndexName(window.LOCALE, STATE.index);
		}

		const { drop } = pointer(position, { fields, props, ll, analysis_value, analysis_name, feature_name, raw, "raster_index": raster_pixel?.index });
		current_map_info_drop = drop;

		if (centerPointer && raster_pixel) ensure_map_info_visible();
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
	++popup_token;

	const variant = STATE.variant;
	const [fields, props, raw] = get_admin_area_layer_data(variant, item.id);

	const info = { "variant": variant, "name": item.name, "id": item.id };
	const analysis_name = translateIndexName(window.LOCALE, STATE.index);

	const { drop } = pointer(position, {
		fields,
		props,
		"ll":             null,
		"analysis_value": item.priority,
		"analysis_name":  analysis_name,
		"feature_name":   item.name,
		"admin_info":     info,
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
