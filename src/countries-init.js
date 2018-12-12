requirejs.config({
  'baseUrl': ea_settings.app_base + '/src',
  'paths': {
    'd3': "../lib/d3",
    'topojson': "../lib/topojson",
    'ea': "./ea/ea",
    'datasets': "./ea/datasets",
    'countries': "./ea/countries",
    'auxiliary': "./ea/auxiliary",
    'flash': "../lib/flash",
    'modal': "../lib/modal",
    'ui': "./ea/ui",
    'client': "./ea/client",
    'svg': "./ea/svg",
    'canvas': "./ea/canvas",
    'map': "./ea/map",
    'search': "./ea/search",
  }
});

require([
  'd3',
  'topojson',
  'map',
  'client',
  'svg',
  'ui',
  'auxiliary',
  'datasets',
  'mapbox',
  'countries',
  'flash',
  'modal',
  'search',
], (d3, topojson) => {
  window.d3 = d3;
  window.topojson = topojson;

  ea_map = null;

  ea_countries_setup();
});
