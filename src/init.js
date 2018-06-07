requirejs.config({
  'baseUrl': './src',
  'paths': {
    'd3': "../lib/d3",
    'topojson': "../lib/topojson",
    'geotiff': "../lib/geotiff",
    'plotty': "../lib/plotty",
    'ea': "./ea/ea",
    'datasets': "./ea/datasets",
    'controls': "./ea/controls",
    'ui': "./ea/ui",
    'client': "./ea/client",
    'svg': "./ea/svg",
    'maparea': "./ea/maparea",
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
  'utils',
  'ui',
  'maparea',
  'globe',
  'mapbox',
], (d3, topojson, geotiff, plotty) => {
  window.d3 = d3;
  window.topojson = topojson;
  window.GeoTIFF = geotiff;
  window.plotty = plotty;

  ea_controls_tree();

  ea_lazy_load_datasets(ea_datasets.slice(1).filter((d) => d.preload));

  ea_maparea_setup();

  ea_init();
});
