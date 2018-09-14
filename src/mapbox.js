mapbox = null;

mapbox_setup = (bounds) => {
  if (!ea_settings.mapboxstyle) {
    console.info("mapbox_setup: Mapbox disabled. Return.");
    return;
  }

  mapboxgl.accessToken = ea_settings.mapbox_token;

  mapbox = new mapboxgl.Map({
    container: 'mapbox-container',
    style: `mapbox://styles/mapbox/${ea_settings.mapboxstyle}-v9`,
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
};
