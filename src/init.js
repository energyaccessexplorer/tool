requirejs.config({
  'baseUrl': './src',
  'paths': {
    'd3': "../lib/d3",
    'topojson': "../lib/topojson",
    'geotiff': "../lib/geotiff",
    'plotty': "../lib/plotty",
    'sortable':   "../lib/htmlsortable",
    'ea': "./ea/ea",
    'datasets': "./ea/datasets",
    'controls': "./ea/controls",
    'ui': "./ea/ui",
    'layers': "./ea/layers",
    'client': "./ea/client",
    'svg': "./ea/svg",
    'map': "./ea/map",
  }
});

require([
  'd3',
  'topojson',
  'geotiff',
  'plotty',
  'datasets',
  'ea',
  'client',
  'svg',
  'controls',
  'ui',
  'layers',
  'map',
  'mapbox',
  'sortable',
], (d3, topojson, geotiff, plotty) => {
  window.d3 = d3;
  window.topojson = topojson;
  window.GeoTIFF = geotiff;
  window.plotty = plotty;

  ea_ui_flash = ea_ui_flash_setup();

  ea_canvas = document.querySelector('canvas#plot');

  ea_map = null;

  ea_layers_init();

  ea_controls_tree();

  ea_map_setup();

  ea_init();
});
