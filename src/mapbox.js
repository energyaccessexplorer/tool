function mapbox_setup(bounds, theme, token) {
  mapboxgl.accessToken = token;

  const mapbox = new mapboxgl.Map({
    container: 'mapbox-container',
    style: `mapbox://styles/mapbox/${theme}-v9`,
  });

  mapbox.fitBounds(bounds, { animate: false });

  mapbox.on('load', _ => {
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

    mapbox.addSource('canvas-source', {
      type: 'canvas',
      canvas: 'plot',
      coordinates: coords
    });

    ea_mapbox.first_symbol = mapbox.getStyle().layers.find(l => l.type === 'symbol').id;

    mapbox.addLayer({
      id: 'canvas-layer',
      source: 'canvas-source',
      type: 'raster',
    }, ea_mapbox.first_symbol);
  });

  mapbox.addControl(new mapboxgl.NavigationControl({ showCompass: false }));

  return mapbox;
};
