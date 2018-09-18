function mapbox_setup(bounds, theme, token) {
  mapboxgl.accessToken = ea_settings.mapbox_token;

  const mapbox = new mapboxgl.Map({
    container: 'mapbox-container',
    style: `mapbox://styles/mapbox/${theme}-v9`,
    interactive: false,
  });

  mapbox.fitBounds(bounds, { animate: false });

  mapbox.on('load', _ => {
    const b = bounds;

    const r = b[0][0];
    const l = b[1][0];
    const u = b[1][1];
    const d = b[0][1];

    mapbox.addSource('canvas-source', {
      type: 'canvas',
      canvas: 'plot',

      coordinates: [
        [r, u],
        [l, u],
        [l, d],
        [r, d]
      ],
    });

    mapbox.addLayer({
      id: 'canvas-layer',
      source: 'canvas-source',
      type: 'raster',
    });
  });

  return mapbox;
};
