const ea_path_root = "/maps-and-data/"
const ea_ccn3 = location.get_query_param('ccn3');
const ea_default_color_scheme = "electric";

Array.prototype.unique = function() {
  var key, l, o, ref, value;
  o = new Object;
  for (key = l = 0, ref = this.length; 0 <= ref ? l < ref : l > ref; key = 0 <= ref ? ++l : --l) {
    o[this[key]] = this[key];
  }
  return (function() {
    var results;
    results = [];
    for (key in o) {
      value = o[key];
      results.push(value);
    }
    return results;
  })();
};

Array.prototype.remove = function(v) {
  var e, i, l, len, ref;
  ref = this;
  for (i = l = 0, len = ref.length; l < len; i = ++l) {
    e = ref[i];
    if (e === v) {
      return this.splice(i, 1);
    }
  }
  return void 0;
};

requirejs.config({
  'baseUrl': ea_path_root + '/src',
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
    'views': "./ea/views",
    'layers': "./ea/layers",
    'client': "./ea/client",
    'svg': "./ea/svg",
    'canvas': "./ea/canvas",
    'map': "./ea/map",
    'datasets_collection': "./ea/datasets_collection",
    'config': "../config",
  }
});

require([
  'd3',
  'topojson',
  'geotiff',
  'plotty',
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
  'datasets_collection',
  'config',
], (d3, topojson, geotiff, plotty) => {
  window.d3 = d3;
  window.topojson = topojson;
  window.GeoTIFF = geotiff;
  window.plotty = plotty;

  ea_datasets_districts();

  ea_ui_flash = ea_ui_flash_setup();

  ea_map = null;

  ea_views_init();

  ea_layers_init();

  ea_client(`${ea_path_root}data/${ea_ccn3}/specifics.json`, 'GET', null, async (r) => {
    ea_init(r['category-tree'], ea_datasets_collection, r['bounds']);
  })
});
