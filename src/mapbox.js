mapbox = null;

mapbox_setup = () => {
  mapboxgl.accessToken = earth_config.mapbox_token;

  mapbox = new mapboxgl.Map({
    container: 'mapbox-container',
    style: 'mapbox://styles/mapbox/satellite-v9', // {satellite, basic, dark, streets}-v9
    interactive: false,
  });

  mapbox.fitBounds(ea_settings.bounds, { animate: false });
};
