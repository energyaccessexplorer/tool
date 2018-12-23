requirejs.config({
  'baseUrl': ea_settings.app_base + '/src',
});

require([
  '../lib/d3',
  '../lib/topojson',
  '../lib/flash',
  '../lib/modal',
  'svg',
  'ui',
  'auxiliary',
  'countries',
], (d3, topojson) => {
  window.d3 = d3;
  window.topojson = topojson;

  ea_map = null;

  ea_countries_setup();

  ea_ui_modal_setup();
  ea_ui_flash_setup();
});
