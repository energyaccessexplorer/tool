const ea_default_color_scheme = "ea";

requirejs.config({
  'baseUrl': ea_settings.app_base + '/src',
  'paths': {
    'd3': "../lib/d3",
    'topojson': "../lib/topojson",
    'geotiff': "../lib/geotiff",
    'plotty': "../lib/plotty",
    'sortable':   "../lib/htmlsortable",
    'flash': "../lib/flash",
    'modal': "../lib/modal",
    'ea': "./ea/ea",
    'datasets': "./ea/datasets",
    'controls': "./ea/controls",
    'ui': "./ea/ui",
    'views': "./ea/views",
    'layers': "./ea/layers",
    'client': "./ea/client",
    'svg': "./ea/svg",
    'canvas': "./ea/canvas",
    'map': "./ea/map",
  }
});

require([
  'd3',
  'topojson',
  'geotiff',
  'plotty',
  'flash',
  'modal',
  'ea',
  'map',
  'client',
  'svg',
  'canvas',
  'controls',
  'ui',
  'layers',
  'views',
  'datasets',
  'mapbox',
  'sortable',
], (d3, topojson, geotiff, plotty) => {
  window.d3 = d3;
  window.topojson = topojson;
  window.GeoTIFF = geotiff;

  window.plotty = plotty;
  plotty.addColorScale("ea", ['#1c4478', '#81b062', '#e5a82e'], [0, 0.5, 1]);

  window.ea_indexes = {
    "eai": 'Energy Access Index',
    "demand": 'Demand Index',
    "supply": 'Supply Index',
    "ani": 'Assistance Need Index',
  };

  ea_overlord({ type: 'init', caller: 'require' });
});
