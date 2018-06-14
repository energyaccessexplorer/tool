function ea_map_setup() {
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

  const svg = d3.select('#svg-map')
        .attr('width', ea_settings.width)
        .attr('height', ea_settings.height);

  const maparea = document.querySelector('#maparea')
  maparea.style['width'] = ea_settings.width + "px";
  maparea.style['height'] = ea_settings.height + "px";

  d3.queue()
    .defer(d3.json, ea_settings.topofile)
    .await((error, topo) => {
      if (error) {
        ea_ui_flash('error', error.target.statusText, error.target.responseURL);
        console.log(error);
      }

      ea_map = ea_map_svg(svg, topo);

      ea_map_load_features(ea_map, ea_map.topo.features, 'land', 'adm0');

      ea_svg_land_mask(ea_map);
      mapbox_setup();
    });
};

function ea_map_svg(svg, topofile) {
  var width, height;

  var projection, geopath, scale;

  const map = svg.select('#map');
  const land = map.append('g').attr('id', "land");

  topo = topojson.feature(topofile, topofile.objects.adm0);

  width = svg.attr('width');
  height = svg.attr('height');

  projection = d3.geoMercator();

  projection
    .scale(1)
    .translate([0,0]);

  geopath = d3.geoPath()
    .projection(projection)
    .pointRadius(2);

  var b = geopath.bounds(topo);
  const angle_width = (b[1][0] - b[0][0]);
  const angle_height = (b[1][1] - b[0][1]);

  scale = 1 / (Math.max(angle_width / width, angle_height / height));
  var t = [
    (width - scale * (b[1][0] + b[0][0])) / 2,
    (height - scale * (b[1][1] + b[0][1])) / 2
  ];

  projection
    .scale(scale)
    .translate(t);

  var _map = {
    topo: topo,
    projection: projection,
    geopath: geopath,
    svg: svg,
    map: map,
    land: land,
    scale: scale,
  };

  // ZOOM
  //
  // {
  // }

  const coord_tooltip = d3.select('body').append('div');
  coord_tooltip.attr('id', "coord-tooltip");

  document.body.appendChild(coord_tooltip.node());

  // MOUSE OVER
  //
  svg
    .on('mousemove', () => ea_map_mousemove(_map, coord_tooltip))
    .on('mouseout', () => coord_tooltip.style('display', "none"));

  return _map;
};

function ea_map_load_features(m, features, cls, callback) {
  var container = m.map.select(`#${cls}`)

  if (container.empty())
    container = m.map.append('g').attr('id', cls);

  container.selectAll(`path.${ cls }`).remove();

  container.selectAll(`path.${ cls }`)
    .data(features).enter()
    .append('path')
    .attr('class', cls)
    .attr('d', m.geopath)
    .on('dblclick', callback)
    .on('mouseover', (d) => console.log(d.id))
  ;

  return topo;
};

function ea_map_unload(g, id) {
  if (typeof g === 'undefined' || g === null) return;

  g.map.select(`#${id}`).remove();
}

function ea_map_mousemove(g, t) {
  var e = d3.event
      p = g.projection.invert([e.offsetX, e.offsetY]);

  t
    .html(`${ p[0].toFixed(4) }, ${ p[1].toFixed(4) }`)
    .style('left', `${ (d3.event.pageX + 7) }px`)
    .style('top', `${ (d3.event.pageY + 15) }px`)
    .style('display', "block");
};
