function ea_maparea_setup() {
  const b = ea_settings.bounds;
  const p = document.querySelector('#playground');

  if (!p)
    ea_settings.width = 500;
  else
    ea_settings.width = (p.clientWidth - p.querySelector('#playground #controls').clientWidth) * (4/5);

  p.querySelector('canvas#plot').style.width = ea_settings.width;

  ea_settings.center = [(b[1][0] - b[0][0]) / 2, (b[1][1] - b[0][1]) / 2];

  ea_settings.height = (b[1][1] - b[0][1]) / (b[1][0] - b[0][0]) * ea_settings.width;
  ea_settings.image_height = Math.round(ea_settings.image_width * ea_settings.height) / ea_settings.width;

  var svg = d3.select('svg#map')
      .attr('width', ea_settings.width)
      .attr('height', ea_settings.height);

  var maparea = document.querySelector('#maparea')
  maparea.style.width = ea_settings.width + "px";
  maparea.style.height = ea_settings.height + "px";

  coord_tooltip = document.createElement('div');
  coord_tooltip.id = "coord-tooltip";
  document.body.appendChild(coord_tooltip);

  var rect = canvas.getBoundingClientRect();

  canvas.addEventListener('mousemove', (e) => {
    var p = [
      (e.clientX - rect.left) * (ea_settings.image_width / ea_settings.width),
      (e.clientY - rect.top) * (ea_settings.image_height / ea_settings.height)
    ];

    coord_tooltip.innerHTML = `${ p[0].toFixed(4) }, ${ p[1].toFixed(4) }`;
    coord_tooltip.style = `
left: ${ (e.clientX + 7) }px;
top: ${ (e.clientY + 15) }px;
display: block;`
  });

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
