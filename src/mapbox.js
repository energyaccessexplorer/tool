import bubblemessage from '../lib/bubblemessage.js';

const default_styles = [{
	"name":  "Light (default)",
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

let info_mode_button;

class MapboxThemeControl {
	onAdd(map) {
		this._map = map;
		this._container = document.createElement('div');
		this._container.className = 'mapboxgl-ctrl';
		this._container.classList.add('mapboxgl-ctrl-group');

		let button = ce('button', ce('div', font_icon('layers-fill'), { "style": "transform: scale(0.75)" }), { "type": 'button', "class": 'mapboxgl-ctrl-icon'});

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

		let button = ce('button', ce('div', font_icon('dribbble'), { "style": "transform: scale(0.75)" }), { "type": 'button', "class": 'mapboxgl-ctrl-icon'});

		this._container.append(button);

		button.addEventListener('mouseup', e => projection_control_popup(e.target.closest('button')));

		return this._container;
	};

	onRemove() {
		this._container.parentNode.removeChild(this._container);
		this._map = undefined;
	};
};

class MapboxInfoControl {
	onAdd(map) {
		this._map = map;
		this._container = document.createElement('div');
		this._container.className = 'mapboxgl-ctrl';
		this._container.classList.add('mapboxgl-ctrl-group');

		let button = ce('button', ce('div', font_icon('info-circle'), { "style": "transform: scale(0.75)" }), { "type": 'button', "class": 'mapboxgl-ctrl-icon'});

		this._container.append(button);

		button.addEventListener('click', info_mode_change);

		info_mode_button = button;

		return this._container;
	};

	onRemove() {
		this._container.parentNode.removeChild(this._container);
		this._map = undefined;
	};
};

export function init() {
	mapboxgl.accessToken = ea_settings.mapbox_token;

	const mb = new mapboxgl.Map({
		"container":             'mapbox-container',
		"trackResize":           true,
		"preserveDrawingBuffer": true, // this allows us to get canvas.toDataURL()
		"style":                 theme_pick(""),
	});

	mb.addControl(new mapboxgl.NavigationControl({ "showCompass": false }));

	mb.zoomTo(mb.getZoom() * 0.95, {"duration": 0});
	mb.doubleClickZoom.disable();
	mb.dragRotate.disable();
	mb.touchZoomRotate.disableRotation();

	if (O.map) {
		mb.on('click', e => O.map('click', e));

		mb.addControl((new MapboxThemeControl()), 'top-right');
		mb.addControl((new MapboxProjectionControl()), 'top-right');
		mb.addControl((new MapboxInfoControl()), 'top-right');
	}

	return mb;
};

function projection_control_popup(_) {
	let x = ce('div', null, { "class": 'mapbox-control-popup' });
	let radios = ce('div');

	for (let t of projections) {
		let e = ce('div', null, { "class": 'radio-group' });

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

	let current = qs(`input[value="${MAPBOX.getProjection()?.name}"]`, radios);
	if (current) current.setAttribute('checked', true);

	qsa('input[name="mapbox_projection"]', radios)
		.forEach(e => e.addEventListener('change', _ => MAPBOX.setProjection(e.value)));

	x.addEventListener('mouseleave', x.remove);

	x.append(radios);

	x.style = `
position: absolute;
top: 120px;
right: 10px;
background-color: white;
box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
border-radius: 4px;
padding: 16px;
`;

	qs('#maparea').append(x);
};

function theme_control_popup(_) {
	let x = ce('div', null, { "class": 'mapbox-control-popup' });
	let radios = ce('div');

	for (let t of styles) {
		let e = ce('div', null, { "class": 'radio-group' });

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

	let current = qs(`input[value="${ea_settings.mapbox_theme}"]`, radios);
	if (current) current.setAttribute('checked', true);

	qsa('input[name="mapbox_theme"]', radios)
		.forEach(e => e.addEventListener('change', _ => change_theme(e.value)));

	x.addEventListener('mouseleave', x.remove);

	x.append(radios);

	x.style = `
position: absolute;
top: 120px;
right: 10px;
background-color: white;
box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
border-radius: 4px;
padding: 16px;
`;

	qs('#maparea').append(x);
};

function theme_pick(theme) {
	let t = (theme === "" ? null : theme);

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

export function info_mode_change() {
	INFOMODE = !INFOMODE;
	const b = info_mode_button;

	if (INFOMODE) {
		b.classList.add('active');
		qs('canvas.mapboxgl-canvas').style.cursor = 'crosshair';
	}
	else {
		b.classList.remove('active');
		qs('canvas.mapboxgl-canvas').style.cursor = 'auto';
	}
};

async function worldview() {
	let v = "US";
	switch (GEOGRAPHY.circle) {
	case "india":
		v = "IN";
		break;

	default:
		break;
	}

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

		await O.theme_changed();

		worldview();
	};

	MAPBOX.once('style.load', go);

	if (!soft)
		MAPBOX.setStyle(theme_pick(ea_settings.mapbox_theme = theme));

	if (theme === "") go();
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

export function map_pointer(content, x, y) {
	let p = qs('#map-pointer');

	if (p) p.remove();

	p = ce('div', null, {
		"id":    "map-pointer",
		"style": `
position: absolute;
left: ${x - 10}px;
top: ${y - 10}px;
height: 20px;
width: 20px;
background-color: transparent;`,
	});

	for (const e of qsa('bubble-message'))
		e.remove();

	document.body.append(p);

	let cls = false;
	let pos = "W";

	if (MOBILE) {
		cls = true;
		pos = "C";
	}

	const mark = new bubblemessage({ "position": pos, "message": content, "close": cls }, (MOBILE ? document.body : p));

	function drop() {
		p.remove();
		mark.remove();
	};

	p.addEventListener('mouseleave', drop);

	let _clk;
	function clk() {
		drop();
		document.removeEventListener('click', _clk);
	};

	delay(0.2).then(_ => {
		_clk = clk;
		document.addEventListener('click', _clk);
	});

	return {
		drop,
	};
};
