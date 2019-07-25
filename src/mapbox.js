resourcewatch_styles = [{
  "name": "Light Basemap with no labels",
  "value": "resourcewatch/cjhqgk77j0r7h2sqw220p7imy"
}, {
  "name": "Satellite",
  "value": "resourcewatch/cjhqiecof53wv2rl9gw4cehmy"
}, {
  "name": "Light labels",
  "value": "resourcewatch/cjgcf9rs05qnu2rrpp4qzucox"
}, {
  "name": "Dark labels",
  "value": "resourcewatch/cjgcf9gqk9tmm2spd9zr0tml3"
}, {
  "name": "Boundaries",
  "value": "resourcewatch/cjgcf8qdaai1x2rn6w3j4q805"
}];

default_styles = [{
  "name": "Light (default)",
  "value": "mapbox/basic-v9"
}, {
  "name": "Satellite",
  "value": "mapbox/satellite-streets-v9"
}, {
  "name": "Dark",
  "value": "mapbox/dark-v9"
}];

mapbox_styles = default_styles;

class MapboxThemeControl {
  onAdd(map) {
    this._map = map;
    this._container = document.createElement('div');
    this._container.className = 'mapboxgl-ctrl';
    this._container.classList.add('mapboxgl-ctrl-group');

    let button = ce('button', ce('div', tmpl('#svg-layers'), { style: "transform: scale(0.75)" }), { type: 'button', class: 'mapboxgl-ctrl-icon'});

    this._container.append(button);

    button.addEventListener('mouseup', e => mapbox_theme_control_popup(e.target.closest('button')));

    return this._container;
  }

  onRemove() {
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }
};

function mapbox_theme_control_popup(btn) {
  let x = ce('div', null, { id: 'mapbox-theme-control-popup' });
  let radios = ce('div');

  for (let t of mapbox_styles) {
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

  let current = radios.querySelector(`input[value="${ea_settings.mapbox_theme}"]`)
  if (current) current.setAttribute('checked', true);

  radios.querySelectorAll('input[name="mapbox_theme"]')
    .forEach(e => e.addEventListener('change', _ => mapbox_change_theme(e.value)));

  x.addEventListener('mouseleave', _ => x.remove());

  x.append(radios);

  const r = btn.getBoundingClientRect();

  x.style = `
position: absolute;
top: 120px;
right: 10px;
background-color: white;
box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
border-radius: 4px;
padding: 16px;`;

  document.querySelector('#playground #visual').append(x);
};

function mapbox_theme_pick(theme) {
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

function mapbox_canvas() {
  if (!ea_mapbox.getSource('output-source'))
    ea_mapbox.addSource('output-source', {
      "type": 'canvas',
      "canvas": 'output',
      "animate": false,
      "coordinates": ea_mapbox.coords
    });

  const c = ea_mapbox.getStyle().layers.find(l => l.type === 'symbol');

  ea_mapbox.first_symbol = ((c && c.id) || undefined);

  if (!ea_mapbox.getLayer('output-layer')) {
    ea_mapbox.addLayer({
      "id": 'output-layer',
      "source": 'output-source',
      "type": 'raster',
      "layout": {
        "visibility": "none",
      },
      "paint": {
        "raster-resampling": "nearest",
      }
    }, ea_mapbox.first_symbol);
  }
};

function mapbox_setup(bounds) {
  mapboxgl.accessToken = ea_settings.mapbox_token;

  const mapbox = new mapboxgl.Map({
    "container": 'mapbox-container',
    "trackResize": true,
    "preserveDrawingBuffer": true, // this allows us to get canvas.toDataURL()
    "style": mapbox_theme_pick("")
  });

  mapbox.addControl(new mapboxgl.NavigationControl({ showCompass: false }));

  mapbox.addControl((new MapboxThemeControl()), 'top-right');

  mapbox.zoomTo(mapbox.getZoom() * 0.95, {duration: 0});

  mapbox.dragRotate.disable();
  mapbox.touchZoomRotate.disableRotation();

  mapbox.on('mouseup', e => ea_overlord({
    type: "map",
    target: "click",
    event: e,
    caller: "mapbox mouseup"
  }));

  return (ea_mapbox = mapbox);
};

function mapbox_change_theme(theme) {
  const it = _ => {
    mapbox_canvas();

    ea_overlord({
      type: "refresh",
      caller: "mapbox_change_theme",
    });
  };

  ea_mapbox.once('style.load', it);
  ea_mapbox.setStyle(mapbox_theme_pick(ea_settings.mapbox_theme = theme));

  if (theme === "") it();
};

function mapbox_pointer(content, x, y) {
  let p = document.querySelector('#mapbox-pointer');

  if (!p) {
    p = ce('div', content, {
      id: "mapbox-pointer",
      style: `
position: absolute;
left: ${x}px;
top: ${y}px;
background-color: white;
box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
border-radius: 0 4px 4px 4px;
padding: 16px;`
    });
  }

  document.body.append(p);

  let l;

  document.body.addEventListener('mousemove', (l = function() {
    p.remove();
    document.removeEventListener('mousemove', l);
  }));
};

function mapbox_fit(bounds) {
  ea_mapbox.fitBounds(bounds, { animate: false });

  const b = bounds;

  const l = b[0];
  const r = b[2];
  const d = b[1];
  const u = b[3];

  ea_mapbox.coords = [[l,u], [r,u], [r,d], [l,d]];
}
