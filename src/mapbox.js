import {
	super_error,
	bi_icon,
	coordinates_to_raster_pixel,
} from './utils.js';

import {
	context,
} from './complicated.js';

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
	let p = qs('#map-pointer');

	if (p) p.remove();

	p = ce('div', null, {
		"id":    "map-pointer",
		"style": `
position: absolute;
left: ${x - 8}px;
top: ${y - 8}px;`,
	});

	for (const e of qsa('bubble-message'))
		e.remove();

	for (const e of qsa('map-info'))
		e.remove();

	document.body.append(p);

	let cls = false;
	let pos = "W";

	if (MOBILE) {
		cls = true;
		pos = "C";
	}

	function drop() {
		if (p._preventDrop) return;
		if (onMove) MAPBOX.off('move', onMove);
		p.remove();
		mark.remove();
	};

	const mark = new mapinfo({ "position": pos, "data": data, "close": cls, "onClose": drop }, (MOBILE ? document.body : p));

	function updatePosition() {
		if (!lngLat) return;

		const point = MAPBOX.project(lngLat);
		const mapContainer = MAPBOX.getContainer().getBoundingClientRect();

		const newX = mapContainer.left + point.x;
		const newY = mapContainer.top + point.y;

		p.style.left = (newX - 8) + "px";
		p.style.top = (newY - 8) + "px";

		mark.align();
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
	const rc = coordinates_to_raster_pixel(ll, OUTLINE.raster);

	const p = MAPBOX.queryRenderedFeatures(MAPBOX.project(ll));
	const [fields, props, _] = context(rc, p[0]);

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
			const { drop } = pointer(position, { fields, props, ll, analysis_value, analysis_name, feature_name });
			current_map_info_drop = drop;

			if (!centerPointer) return;

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
						const pointer = qs('#map-pointer');
						const pointerBox = pointer ? pointer.getBoundingClientRect() : null;
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

					const p = qs('#map-pointer');
					if (p) {
						p._preventDrop = true;

						MAPBOX.once('moveend', () => {
							if (p) p._preventDrop = false;
						});
					}

					MAPBOX.easeTo({
						"center":   targetCenter,
						"duration": 300,
					});
				}
			});
		});
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

	show_location_info(ll, position);
};
