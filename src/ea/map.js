function ea_map_setup() {
  const b = ea_settings.bounds;
  const p = document.querySelector('#playground');

  const w = (b[1][0] - b[0][0]);
  const h = (b[1][1] - b[0][1]);

  ea_settings.center = [b[0][0] + (Math.abs(w/2)), b[0][1] + (Math.abs(h/2))];

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

  const coord_tooltip = document.querySelector('body')
        .appendChild(elem(`<div id="coord-tooltip"></div>`));

  ea_canvas = document.querySelector('canvas#plot');

  d3.queue()
    .defer(d3.json, ea_settings.topofile)
    .await((error, topo) => {
      if (error) {
        ea_ui_flash('error', error.target.statusText, error.target.responseURL);
        console.log(error);
      }

      ea_map = ea_map_svg(svg, topo, 'adm0');

      ea_map_load_features({
        map: ea_map,
        features: ea_map.topo.features,
        cls: 'land',
        scale: 0,
      });

      ea_svg_land_mask(ea_map);

      mapbox_setup();
    });
}

function ea_map_svg(svg, topofile, name, options) {
  var width, height;

  var projection, geopath, scale;

  var opts = options || {};

  const map = svg.select('#map');
  const land = map.append('g').attr('id', "land")
        .attr('fill', "none");

  topo = topojson.feature(topofile, topofile.objects[name]);

  width = svg.attr('width');
  height = svg.attr('height');

  projection = d3.geoMercator();

  projection
    .scale(1)
    .center([0,0])
    .translate([0,0]);

  geopath = d3.geoPath()
    .projection(projection);

  var b = geopath.bounds(topo);
  const angle_width = (b[1][0] - b[0][0]);
  const angle_height = (b[1][1] - b[0][1]);

  scale = 1 / (Math.max(angle_width / width, angle_height / height));
  translate = [width/2 , height/2];

  projection
    .scale(opts.scale || scale)
    .center(opts.center || ea_settings.center)
    .translate(opts.translate || translate)

  var _map = {
    topo: topo,
    projection: projection,
    geopath: geopath,
    svg: svg,
    map: map,
    land: land,
    scale: scale,
  };

  // ZOOM AND MOUSE EVENTS
  //
  {
    let mask;
    let tmp_canvas;
    let zt = d3.zoomIdentity;
    const tooltip = d3.select('#coord-tooltip');

    let mouseenter = () => tooltip.style('display', "block");

    let mouseleave = () => tooltip.style('display', "none");

    let mousemove = () => {
      const p = projection.invert(zt.invert(d3.mouse(svg.node())))

      tooltip
        .html(`${ p[0].toFixed(4) }, ${ p[1].toFixed(4) }`)
        .style('left', `${ (d3.event.pageX + 7) }px`)
        .style('top', `${ (d3.event.pageY + 15) }px`);
    };

    let zoomstart = () => {
      if (!mask || mask.empty()) mask = d3.select('#mask');

      tmp_canvas = document.createElement("canvas");
      tmp_canvas.setAttribute("width", ea_canvas.width);
      tmp_canvas.setAttribute("height", ea_canvas.height);
    };

    let zoomend = () => {
      const k = d3.event.transform.k;

      ea_datasets_collection
        .filter(x => x.active && x.features)
        .forEach(ds => {
          if (ds.type === 'points')
            ea_map_load_points(
              _map,
              ds.features,
              ds.id,
              ds.symbol,
              k
            );
          else if (ds.type === 'polygon')
            ea_map_load_features({
              map: _map,
              features: ds.features,
              cls: ds.id,
              scale: k,
            });
        });

      tmp_canvas.remove();
    };

    let zooming = () => {
      const et = zt = d3.event.transform;
      const nw = projection.invert(et.invert([0,0]));
      const se = projection.invert(et.invert([width, height]));

      if (typeof mapbox !== 'undefined' && mapbox !== null)
        mapbox.fitBounds([[nw[0], se[1]], [se[0], nw[1]]], { animate: false });

      ea_canvas_draw(et, tmp_canvas);

      map.attr("transform", et);
      mask.attr("transform", et);
    };

    let zoom = d3.zoom()
        .translateExtent([[0, 0], [width, height]])
        .scaleExtent([1, 200])
        .on("start", zoomstart)
        .on("zoom", zooming)
        .on("end", zoomend);

    svg.call(zoom)
      .on('mousemove', mousemove)
      .on('mouseenter', mouseenter)
      .on('mouseleave', mouseleave);
  }

  return _map;
}

function ea_map_load_features(o) {
  if (!o.map)
    throw "Argument Error: o.map is missing";

  if (!o.map.map)
    throw "Argument Error: o.map.map is missing";

  if (!o.map.geopath)
    throw "Argument Error: o.map.geopath is missing";

  if (!o.features)
    throw "Argument Error: o.features is missing";

  if (o.features.some(f => f.type !== "Feature")) {
    console.log(o.features);
    throw "Argument Error: o.features is not an array of Features";
  }

  var container = o.map.map.select(`#${o.cls}`)
  var paths;

  if (container.empty())
    container = o.map.map.append('g').attr('id', o.cls);

  container.selectAll(`path.${ o.cls }`).remove();

  paths = container.selectAll(`path.${ o.cls }`)
    .data(o.features).enter()
    .append('path')
    .attr('class', (o.cls || ''))
    .attr('id', d => d.gid || d.id || null)
    .attr('d', o.map.geopath)
    .attr('stroke-width', o.scale ? (0.5/o.scale) : 0);

  return container;
}

function ea_map_load_points(m, features, cls, sym, scale) {
  if (!scale) scale = 1;

  var container = m.map.select(`#${cls}`)

  if (container.empty())
    container = m.map.append('g').attr('id', cls);

  container.selectAll(`path.${ cls }`).remove();

  var s = null;

  switch (sym) {
    case 'triangle':
    s = d3.symbolTriangle;
    break;

    case 'wye':
    s = d3.symbolWye;
    break;

    case 'star':
    s = d3.symbolStar;
    break;

    case 'square':
    s = d3.symbolSquare;
    break;

    case 'cross':
    s = d3.symbolCross;
    break;

    case 'circle':
    default:
    s = d3.symbolCircle;
    break;
  }

  var symbol = d3.symbol()
      .size(25 / (scale**2))
      .type((d) => s)

  container.selectAll(`path.${ cls }`)
    .data(features).enter()
    .append('path')
    .attr('d', symbol)
    .attr('transform', (d) => `translate(${m.projection(d.geometry.coordinates)})`)
    .attr('stroke-width', (0.5/scale))
    .attr('class', cls);

  return topo;
}

function ea_map_unload(g, id) {
  if (typeof g === 'undefined' || g === null) return;

  g.map.select(`#${id}`).remove();
}
