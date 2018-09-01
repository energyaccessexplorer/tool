const ea_path_root = "/maps-and-data/"
const ea_ccn3 = location.get_query_param('ccn3');
const ea_default_color_scheme = "electric";

requirejs.config({
  'baseUrl': ea_path_root + '/src',
  'paths': {
    'd3': "../lib/d3",
    'topojson': "../lib/topojson",
    'geotiff': "../lib/geotiff",
    'plotty': "../lib/plotty",
    'sortable':   "../lib/htmlsortable",
    'flash':   "../lib/flash",
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
  'flash',
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
  'config',
], (d3, topojson, geotiff, plotty) => {
  window.d3 = d3;
  window.topojson = topojson;
  window.GeoTIFF = geotiff;
  window.plotty = plotty;

  ea_datasets_districts();

  ea_map = null;

  ea_views_init();

  ea_layers_init();

  function get_datasets(country) {
    ea_client(
      `${ea_settings.database}/datasets?country_id=eq.${country.id}&select=*,heatmap_file(*),polygons_file(*),category(*)`, 'GET', null,
      r => {
        const collection = r.map(e => {
          let heatmap = e.category.heatmap;
          if (heatmap && e.heatmap_file) heatmap.endpoint = e.heatmap_file.endpoint;

          let polygons = e.category.polygons;
          if (polygons && e.polygons_file) polygons.endpoint = e.polygons_file.endpoint;

          if (e.category.metadata && e.category.metadata.mutant) console.log('mutant: ', e.category_name, e.id);
          else if (!e.heatmap_file && !e.polygons_file) return undefined;

          return {
            "description": e.category.description,
            "description_long": e.category.description_long,
            "heatmap": heatmap,
            "polygons": polygons,
            "id": e.category.name,
            "unit": e.category.unit,
            "metadata": e.category.metadata,
          };
        });

        ea_datasets_collection = collection.filter(d => d);

        ea_init(
          country.category_tree,
          ea_datasets_collection,
          country.bounds);
      });
  };

  ea_client(
    `${ea_settings.database}/countries?ccn3=eq.${ea_ccn3}`,
    'GET', 1,
    r => get_datasets(r)
  );
});
