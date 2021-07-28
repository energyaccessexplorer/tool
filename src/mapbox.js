const default_styles = [{
	"name": "Light (default)",
	"value": "mapbox/basic-v9"
}, {
	"name": "Satellite",
	"value": "mapbox/satellite-streets-v9"
}, {
	"name": "Dark",
	"value": "mapbox/dark-v9"
}];

const styles = default_styles;

class MapboxThemeControl {
	onAdd(map) {
		this._map = map;
		this._container = document.createElement('div');
		this._container.className = 'mapboxgl-ctrl';
		this._container.classList.add('mapboxgl-ctrl-group');

		let button = ce('button', ce('div', font_icon('layers-fill'), { style: "transform: scale(0.75)" }), { type: 'button', class: 'mapboxgl-ctrl-icon'});

		this._container.append(button);

		button.addEventListener('mouseup', e => theme_control_popup(e.target.closest('button')));

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

		let button = ce('button', ce('div', font_icon('info-circle'), { style: "transform: scale(0.75)" }), { type: 'button', class: 'mapboxgl-ctrl-icon'});

		this._container.append(button);

		button.addEventListener('mouseup', _ => {
			INFOMODE = !INFOMODE;

			if (INFOMODE) {
				button.classList.add('active');
				qs('canvas.mapboxgl-canvas').style.cursor = 'crosshair';
			}
			else {
				button.classList.remove('active');
				qs('canvas.mapboxgl-canvas').style.cursor = 'auto';
			}
		});

		return this._container;
	};

	onRemove() {
		this._container.parentNode.removeChild(this._container);
		this._map = undefined;
	};
};

let _O;

let _changing_target = false;

let _zoom;

export function init(overlord = {}) {
	mapboxgl.accessToken = ea_settings.mapbox_token;

	_O = overlord;

	const mb = new mapboxgl.Map({
		"container": 'mapbox-container',
		"trackResize": true,
		"preserveDrawingBuffer": true, // this allows us to get canvas.toDataURL()
		"style": theme_pick("")
	});

	mb.addControl(new mapboxgl.NavigationControl({ showCompass: false }));

	mb.zoomTo(mb.getZoom() * 0.95, {duration: 0});
	mb.doubleClickZoom.disable();
	mb.dragRotate.disable();
	mb.touchZoomRotate.disableRotation();

	if (_O.map) {
		mb.on('click', e => _O.map('click', e));

		mb.addControl((new MapboxThemeControl()), 'top-right');
		mb.addControl((new MapboxInfoControl()), 'top-right');
	}

	return mb;
};

function theme_control_popup(_) {
	let x = ce('div', null, { id: 'mapbox-theme-control-popup' });
	let radios = ce('div');

	for (let t of styles) {
		let e = ce('div', null, { class: 'radio-group' });

		e.append(
			ce('input', null, {
				id: `mapbox_theme_${t.value}`,
				type: "radio",
				name: "mapbox_theme",
				value: t.value
			}),
			ce('label', t.name, { for: `mapbox_theme_${t.value}` })
		);

		radios.append(e);
	}

	let current = qs(`input[value="${ea_settings.mapbox_theme}"]`, radios);
	if (current) current.setAttribute('checked', true);

	qsa('input[name="mapbox_theme"]', radios)
		.forEach(e => e.addEventListener('change', _ => change_theme(e.value)));

	x.addEventListener('mouseleave', _ => x.remove());

	x.append(radios);

	x.style = `
position: absolute;
top: 120px;
right: 10px;
background-color: white;
box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
border-radius: 4px;
padding: 16px;`;

	qs('#maparea').append(x);
};

function theme_pick(theme) {
	let t = (theme === "" ? null : theme);

	return (t ? `mapbox://styles/${t}` : {
		"version": 8,
		"sources": {},
		"layers": [{
			"id": 'background',
			"type": 'background',
			"paint": {
				"background-color": 'white'
			}
		}]
	});
};

export function change_theme(theme, soft) {
	function go() {
		const c = MAPBOX.getStyle().layers.find(l => l.type === 'symbol');
		MAPBOX.first_symbol = maybe(c, 'id');

		if (_O.theme_changed) _O.theme_changed();
	};

	MAPBOX.once('style.load', go);

	if (!soft)
		MAPBOX.setStyle(theme_pick(ea_settings.mapbox_theme = theme));

	if (theme === "") go();
};

export function pointer(content, x, y) {
	let p = qs('#mapbox-pointer');

	if (p) p.remove();

	p = ce('div', null, {
		id: "mapbox-pointer",
		style: `
position: absolute;
left: ${x - 10}px;
top: ${y - 10}px;
height: 20px;
width: 20px;
background-color: transparent;
`
	});

	document.body.append(p);

	for (const e of qsa('.nanny-marker'))
		e.remove();

	let cls = false;
	let pos = "W";

	if (MOBILE) {
		cls = true;
		pos = "C";
	}

	const mark = nanny.pick_element((MOBILE ? document.body : p), { position: pos, message: content, close: cls });

	function drop() {
		p.remove();
		mark.remove();
	};

	p.addEventListener('mouseleave', drop);

	let clk;
	function c() {
		drop();
		document.removeEventListener('click', clk);
	};

	document.addEventListener('click', (clk = c));

	return {
		drop: drop
	};
};

export function fit(bounds, animate = false) {
	const rect = qs('#maparea').getBoundingClientRect();

	const hp = (rect.width > rect.height) ? 0 : (rect.width * 0.1);
	const vp = (rect.height > rect.width) ? 0 : (rect.height * 0.1);

	try {
		MAPBOX.fitBounds(bounds, { animate: animate, padding: { top: vp, bottom: vp, left: hp, right: hp } });
		_zoom = MAPBOX.getZoom();
	} catch (e) {
		ea_super_error(
			"Geography bounding box",
			`
Mapbox says:
${e}

Tried to fit to:
	${JSON.stringify(bounds)}

This is fatal. Thanks for all the fish.`
		);

		throw new Error("Could not set geography's bounds. Ciao.");
	}

	const [left, bottom, right, top] = bounds;

	return [[left,top], [right,top], [right,bottom], [left,bottom]];
};

export function dblclick(id) {
	MAPBOX.on('dblclick', id, e => {
		if (_changing_target) return;

		_changing_target = true;
		_O.map('dblclick', e, id);
	});
};

export function zoomend(id) {
	MAPBOX.on('zoomend', id, e => {
		const z = MAPBOX.getZoom();

		if (or(_changing_target, z >= _zoom)) ;
		else _O.map('zoomend', e, id);

		_changing_target = false;

		_zoom = z;
	});
};
