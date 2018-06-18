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
    'canvas': "./ea/canvas",
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
  'canvas',
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

  ea_datasets.forEach((d) => {
    if (!d.color_scale) return;

    d.color_scale_fn = function() {
      return d3.scaleLinear()
        .domain(plotty.colorscales[d.color_scale].positions)
        .range(plotty.colorscales[d.color_scale].colors);
    }
  })

  ea_ui_flash = ea_ui_flash_setup();

  ea_map = null;

  ea_layers_init();

  ea_controls_tree();

  ea_map_setup();

  ea_init();
});
