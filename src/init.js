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
  'layers',
  'maparea',
  'globe',
  'mapbox',
  'sortable',
], (d3, topojson, geotiff, plotty) => {
  window.d3 = d3;
  window.topojson = topojson;
  window.GeoTIFF = geotiff;
  window.plotty = plotty;

  ea_layers_init();

  ea_controls_tree();

  ea_lazy_load_datasets(ea_datasets.slice(1).filter((d) => d.preload));

  ea_maparea_setup();

  ea_init();
});
