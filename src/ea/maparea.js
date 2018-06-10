function ea_maparea_setup() {
  const b = ea_settings.bounds;
  const p = document.querySelector('#playground');

  const w = (b[1][0] - b[0][0]);
  const h = (b[1][1] - b[0][1]);

  ea_settings.center = [w/2, h/2];

  if (w < h) {
    ea_settings.width = (p.clientWidth - p.querySelector('#controls').clientWidth) * (4/5);
    ea_settings.height = (h/w) * ea_settings.width;
  }

  else {
    ea_settings.height = p.clientHeight * (4/5);
    ea_settings.width = (w/h) * ea_settings.height;
  }

  const svg = d3.select('svg#map')
        .attr('width', ea_settings.width)
        .attr('height', ea_settings.height);

  const maparea = document.querySelector('#maparea')
  maparea.style['width'] = ea_settings.width + "px";
  maparea.style['height'] = ea_settings.height + "px";

  d3.queue()
    .defer(d3.json, './lib/TZA-adm0.json')
    .await((error, topo) => {
      ea_globe = globe_create(svg, topo);

      globe_load_features(
        ea_globe,
        ea_globe.topo.features,
        'land',
        'adm0'
      );

      ea_svg_land_mask(ea_globe);
      mapbox_setup();
    });
};
