mapbox = null;

mapbox_setup = () => {
  if (!ea_settings.mapboxstyle) {
    console.info("mapbox_setup: Mapbox disabled. Return.")
    return;
  }

  mapboxgl.accessToken = earth_config.mapbox_token;

  mapbox = new mapboxgl.Map({
    container: 'mapbox-container',
    style: `mapbox://styles/mapbox/${ea_settings.mapboxstyle}-v9`,
    interactive: false,
  });

  mapbox.fitBounds(ea_settings.bounds, { animate: false });
};
