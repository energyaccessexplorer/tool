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

  let current = qs(`input[value="${ea_settings.mapbox_theme}"]`, radios);
  if (current) current.setAttribute('checked', true);

  qsa('input[name="mapbox_theme"]', radios)
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

  qs('#playground #visual').append(x);
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

function mapbox_setup() {
  mapboxgl.accessToken = ea_settings.mapbox_token;

  const mb = new mapboxgl.Map({
    "container": 'mapbox-container',
    "trackResize": true,
    "preserveDrawingBuffer": true, // this allows us to get canvas.toDataURL()
    "style": mapbox_theme_pick("")
  });

  mb.addControl(new mapboxgl.NavigationControl({ showCompass: false }));

  mb.addControl((new MapboxThemeControl()), 'top-right');

  mb.zoomTo(mb.getZoom() * 0.95, {duration: 0});

  mb.dragRotate.disable();
  mb.touchZoomRotate.disableRotation();

  mb.on('mouseup', e => ea_overlord({
    type: "map",
    target: "click",
    event: e,
    caller: "mapbox mouseup"
  }));

  return mb;
};

function mapbox_change_theme(theme) {
  const set_output = _ => {
    if (!MAPBOX.getSource('output-source')) {
      MAPBOX.addSource('output-source', {
        "type": 'canvas',
        "canvas": 'output',
        "animate": false,
        "coordinates": MAPBOX.coords
      });
    }

    const c = MAPBOX.getStyle().layers.find(l => l.type === 'symbol');

    MAPBOX.first_symbol = ((c && c.id) || undefined);

    if (!MAPBOX.getLayer('output-layer')) {
      MAPBOX.addLayer({
        "id": 'output-layer',
        "source": 'output-source',
        "type": 'raster',
        "layout": {
          "visibility": "none",
        },
        "paint": {
          "raster-resampling": "nearest",
        }
      }, MAPBOX.first_symbol);
    }

    ea_overlord({
      type: "refresh",
      caller: "mapbox_change_theme",
    });
  };

  MAPBOX.once('style.load', set_output);
  MAPBOX.setStyle(mapbox_theme_pick(ea_settings.mapbox_theme = theme));

  if (theme === "") set_output();
};

function mapbox_pointer(content, x, y) {
  let p = qs('#mapbox-pointer');

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
  const rect = qs('#maparea').getBoundingClientRect();

  const hp = (rect.width > rect.height) ? 0 : (rect.width * 0.1);
  const vp = (rect.height > rect.width) ? 0 : (rect.height * 0.1);

  MAPBOX.fitBounds(bounds, { animate: false, padding: { top: vp, bottom: vp, left: hp, right: hp } });

  const b = bounds;

  const l = b[0];
  const r = b[2];
  const d = b[1];
  const u = b[3];

  MAPBOX.coords = [[l,u], [r,u], [r,d], [l,d]];
};
