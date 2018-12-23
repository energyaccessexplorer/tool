const ea_default_color_scale = "ea";

requirejs.config({
  'baseUrl': ea_settings.app_base + '/src',
});

require([
  '../lib/d3',
  '../lib/topojson',
  '../lib/geotiff',
  '../lib/plotty',
  '../lib/mapbox-gl',
  '../lib/flash',
  '../lib/modal',
  '../lib/htmlsortable',
  'ea',
  'auxiliary',
  'client',
  'svg',
  'controls',
  'ui',
  'layers',
  'datasets',
  'mapbox',
], (d3, topojson, geotiff, plotty, mapboxgl) => {
  window.d3 = d3;
  window.topojson = topojson;
  window.GeoTIFF = geotiff;
  window.plotty = plotty;
  window.mapboxgl = mapboxgl;

  window.ea_views = {
    "inputs": "Data",
    "outputs": "Analysis"
  };

  window.ea_indexes = {
    "eai": "Energy Access Index",
    "demand": "Demand Index",
    "supply": "Supply Index",
    "ani": "Need for Assistance Index",
  };

  window.ea_indexes_descriptions = {
    "eai": "(Current and/or potential)",
    "demand": "(Current and/or potential)",
    "supply": "(Current and/or potential)",
    "ani": "(Areas where financial assistance is needed)",
  };

  window.ea_presets = {
    "market": "Exploring new energy markets",
    "planning": "Planning for electrification",
    "investment": "Investing for impact"
  };

  window.ea_branch_dict = {
    "demographics": "Demographics",
    "productive-uses": "Social and Productive Uses",
    "resources": "Resources",
    "infrastructure": "Infrastructure",
  };

  ea_default_color_domain = [0, 0.5, 1];
  ea_default_color_stops = ['#1c4478', '#81b062', '#e5a82e'];
  plotty.addColorScale("ea", ea_default_color_stops, ea_default_color_domain);

  ea_ui_modal_setup();
  ea_ui_flash_setup();

  ea_overlord({
    "type": 'init',
    "caller": 'require'
  });
});
