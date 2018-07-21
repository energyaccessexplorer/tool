const ea_path_root = "/maps-and-data/"
const ea_ccn3 = location.get_query_param('ccn3');

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

  plotty.addColorScale(
    "hot-reverse",
    plotty.colorscales['hot'].colors.reverse(),
    plotty.colorscales['hot'].positions
  );

  plotty.addColorScale(
    "yignbu-reverse",
    plotty.colorscales['yignbu'].colors.reverse(),
    plotty.colorscales['yignbu'].positions
  );

  const collection = ea_datasets_collection;

  collection.forEach((d) => {
    if (!d.views.heatmaps.color_scale) return;

    d.color_scale_fn = function() {
      return d3.scaleLinear()
        .domain(plotty.colorscales[d.views.heatmaps.color_scale].positions)
        .range(plotty.colorscales[d.views.heatmaps.color_scale].colors);
    }
  });

  ea_datasets_districts();

  ea_ui_flash = ea_ui_flash_setup();

  ea_map = null;

  ea_layers_init();

  ea_client(`${ea_path_root}data/${ea_ccn3}/specifics.json`, 'GET', null, async (r) => {
    ea_init(r['category-tree'], collection, r['bounds']);
  })
});
