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
  "value": "mapbox/satellite-v9"
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

    let button = elem(`
<button class="mapboxgl-ctrl-icon" type="button">
  <div style="transform: scale(0.75);">
    <svg width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z"/></svg>
  <div>
</button>
`);

    this._container.appendChild(button);

    button.addEventListener('mouseup', e => mapbox_theme_control_popup(e.target.closest('button')));

    return this._container;
  }

  onRemove() {
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }
};

function mapbox_theme_control_popup(btn) {
  let x = elem('<div id="mapbox-theme-control-popup">');
  let radios = elem(`<div>`);

  for (let t of mapbox_styles) {
    radios.appendChild(elem(`<div class="radio-group"><input id="mapbox_theme_${t.value}" type="radio" name="mapbox_theme" value="${t.value}" /> <label for="mapbox_theme_${t.value}">${t.name}</label></div>`));
  }

  let current = radios.querySelector(`input[value="${ea_settings.mapbox_theme}"]`)
  if (current) current.setAttribute('checked', true);

  radios.querySelectorAll('input[name="mapbox_theme"]')
    .forEach(e => e.addEventListener('change', _ => mapbox_change_theme(e.value)));

  x.addEventListener('mouseleave', _ => x.remove());

  x.appendChild(radios);

  const r = btn.getBoundingClientRect();

  x.style = `
position: absolute;
top: ${r.top + 36}px;
right: 4px;
background-color: white;
box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.1);
border-radius: 4px;
padding: 16px;
`;

  document.body.appendChild(x);
}

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
  ea_mapbox.addSource('canvas-source', {
    "type": 'canvas',
    "canvas": 'output',
    "animate": false,
    "coordinates": ea_mapbox.coords
  });

  const c = ea_mapbox.getStyle().layers.find(l => l.type === 'symbol');

  ea_mapbox.first_symbol = ((c && c.id) || undefined);

  ea_mapbox.addLayer({
    "id": 'canvas-layer',
    "source": 'canvas-source',
    "type": 'raster',
    "paint": {
      "raster-resampling": "nearest"
    }
  }, ea_mapbox.first_symbol);
};

function mapbox_setup(bounds) {
  mapboxgl.accessToken = ea_settings.mapbox_token;

  const mapbox = new mapboxgl.Map({
    "container": 'mapbox-container',
    "style": mapbox_theme_pick("")
  });

  mapbox.fitBounds(bounds, { animate: false });

  const b = bounds;

  const r = b[0][0];
  const l = b[1][0];
  const u = b[1][1];
  const d = b[0][1];

  const coords = [
    [r, u],
    [l, u],
    [l, d],
    [r, d]
  ];

  mapbox.addControl(new mapboxgl.NavigationControl({ showCompass: false }));

  mapbox.addControl((new MapboxThemeControl()), 'top-right');

  mapbox.coords = coords;

  mapbox.zoomTo(mapbox.getZoom() * 0.95, {duration: 0});

  mapbox.dragRotate.disable();
  mapbox.touchZoomRotate.disableRotation();

  return (ea_mapbox = mapbox);
};

function mapbox_change_theme(theme, callback) {
  const do_it = _ => {
    mapbox_canvas();

    ea_overlord({
      type: "refresh",
      caller: "mapbox_change_theme",
    });
  };

  ea_mapbox.once('style.load', do_it);
  ea_mapbox.setStyle(mapbox_theme_pick(ea_settings.mapbox_theme = theme));

  if (theme === "") do_it();
};
