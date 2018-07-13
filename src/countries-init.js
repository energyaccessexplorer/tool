const ea_path_root = "/maps-and-data/"

requirejs.config({
  'baseUrl': ea_path_root + '/src',
  'paths': {
    'd3': "../lib/d3",
    'topojson': "../lib/topojson",
    'ea': "./ea/ea",
    'datasets': "./ea/datasets",
    'countries': "./ea/countries",
    'ui': "./ea/ui",
    'client': "./ea/client",
    'svg': "./ea/svg",
    'canvas': "./ea/canvas",
    'map': "./ea/map",
    'config': "../config",
  }
});

require([
  'd3',
  'topojson',
  'map',
  'client',
  'svg',
  'ui',
  'datasets',
  'mapbox',
  'config',
  'countries',
], (d3, topojson) => {
  window.d3 = d3;
  window.topojson = topojson;

  ea_datasets_districts();

  ea_ui_flash = ea_ui_flash_setup();

  ea_map = null;

  ea_countries_setup();
  ea_countries_init();
});
