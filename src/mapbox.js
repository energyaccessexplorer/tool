mapbox_themes = [{
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

    button.addEventListener('mouseup', function() {
      let content = elem('<div>');
      let radios = elem(`<div><h3>Background map style</h3></div>`);

      for (let t of mapbox_themes) {
        radios.appendChild(elem(`<div><input type="radio" name="mapbox_theme" value="${t.value}" /> <label>${t.name}</label><br><br></div>`));
      }

      let current = radios.querySelector(`input[value="${ea_settings.mapbox_theme}"]`)
      if (current) current.setAttribute('checked', true);

      radios.querySelectorAll('input[name="mapbox_theme"]').forEach(e => {
        e.addEventListener('change', _ => {
          ea_mapbox.setStyle(mapbox_theme_pick(e.value));
          ea_settings.mapbox_theme = e.value;
          mapbox_canvas(ea_mapbox);
        });
      });

      content.appendChild(radios);

      modal()
        .header("Map configuration")
        .content(content)();
    });

    return this._container;
  }

  onRemove() {
    this._container.parentNode.removeChild(this._container);
    this._map = undefined;
  }
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

function mapbox_canvas(m, coords) {
  m.addSource('canvas-source', {
    "type": 'canvas',
    "canvas": 'plot',
    "coordinates": coords
  });

  const c = m.getStyle().layers.find(l => l.type === 'symbol')

  ea_mapbox.first_symbol = ((c && c.id) || undefined);

  m.addLayer({
    "id": 'canvas-layer',
    "source": 'canvas-source',
    "type": 'raster',
  }, ea_mapbox.first_symbol);
}

function mapbox_setup(bounds) {
  mapboxgl.accessToken = ea_settings.mapbox_token;

  const mapbox = new mapboxgl.Map({
    "container": 'mapbox-container',
    "style": mapbox_theme_pick(ea_settings.mapbox_theme)
  });

  mapbox.fitBounds(bounds, { animate: false });

  mapbox.on('style.load', _ => {
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

    mapbox_canvas(mapbox, coords);
  });

  mapbox.addControl(new mapboxgl.NavigationControl({ showCompass: false }));

  mapbox.addControl((new MapboxThemeControl()), 'top-right');

  return mapbox;
};
