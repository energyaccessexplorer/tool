function globe_load_features(g, features, cls, callback) {
  var container = g.svg.select(`#${cls}`)

  if (container.empty())
    container = g.svg.append('g').attr('id', cls);

  g.svg.select('#mask').raise();

  container.selectAll(`path.${ cls }`).remove();

  container.selectAll(`path.${ cls }`)
    .data(features).enter()
    .append('path')
    .attr('class', cls)
    .attr('d', g.geopath)
    .on('dblclick', callback)
    .on('mouseover', (d) => console.log(d.id))
  ;

  return topo;
};

function globe_mousemove(g, t) {
  var e = d3.event
      p = g.projection.invert([e.offsetX, e.offsetY]);

  // p = [e.offsetX, e.offsetY];

  t
    .html(`${ p[0].toFixed(4) }, ${ p[1].toFixed(4) }`)
    .style('left', `${ (d3.event.pageX + 7) }px`)
    .style('top', `${ (d3.event.pageY + 15) }px`)
    .style('display', "block");
};

function globe_create(svg, topofile) {
  var width, height;

  var projection, geopath, scale;

  var land = svg.append('g').attr('id', "land");

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

  var _globe = {
    topo: topo,
    projection: projection,
    geopath: geopath,
    svg: svg,
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
    .on('mousemove', () => globe_mousemove(_globe, coord_tooltip))
    .on('mouseout', () => coord_tooltip.style('display', "none"));

  return _globe;
};
