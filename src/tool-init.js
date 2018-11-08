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
    'mapbox-gl': "../lib/mapbox-gl",
    'ea': "./ea/ea",
    'datasets': "./ea/datasets",
    'controls': "./ea/controls",
    'ui': "./ea/ui",
    'views': "./ea/views",
    'layers': "./ea/layers",
    'client': "./ea/client",
    'svg': "./ea/svg",
    'map': "./ea/map",
    'presets': "./ea/presets",
    'country-select': "./ea/country-select",
  }
});

require([
  'd3',
  'topojson',
  'geotiff',
  'plotty',
  'mapbox-gl',
  'flash',
  'modal',
  'ea',
  'presets',
  'map',
  'client',
  'svg',
  'controls',
  'ui',
  'country-select',
  'layers',
  'views',
  'datasets',
  'mapbox',
  'sortable',
], (d3, topojson, geotiff, plotty, mapboxgl) => {
  window.d3 = d3;
  window.topojson = topojson;
  window.GeoTIFF = geotiff;
  window.plotty = plotty;
  window.mapboxgl = mapboxgl;

  window.ea_views = ['inputs', 'outputs'];

  window.ea_indexes = {
    "eai": 'Energy Access Index',
    "demand": 'Demand Index',
    "supply": 'Supply Index',
    "ani": 'Assistance Need Index',
  };

  window.ea_category_dict = {
    "demographics": "Demographics",
    "productive-uses": "Social and Productive Uses",
    "resources": "Resources",
    "infrastructure": "Infrastructure",
  };

  plotty.addColorScale("ea", ['#1c4478', '#81b062', '#e5a82e'], [0, 0.5, 1]);

  ea_overlord({ type: 'init', caller: 'require' });
});
