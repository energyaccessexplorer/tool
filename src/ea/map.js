function ea_map_setup(bounds) {
  const b = bounds;

  const w = (b[1][0] - b[0][0]);
  const h = (b[1][1] - b[0][1]);

  const center = [b[0][0] + (Math.abs(w/2)), b[0][1] + (Math.abs(h/2))];

  ea_canvas.style.display = 'none';
  ea_mapbox = mapbox_setup(bounds, ea_settings.mapbox_theme, ea_settings.mapbox_token);

  ea_mapbox.zoomTo(ea_mapbox.getZoom() * 0.95, {duration: 0});

  document.querySelector('#maparea').appendChild(elem(`<div id="summary-button" onclick="ea_summary();">Summary</div>`));
};

function ea_map_svg(svg, topofile, name, options) {
  let width, height;

  let projection, geopath, scale;

  let opts = options || {};

  const map = svg.select('#map');
  const land = map.append('g').attr('id', "land")
        .attr('fill', "none");

  switch (topofile.type) {
  case "FeatureCollection": {
    topo = topofile
    break;
  }

  case "Topology": {
    topo = topojson.feature(topofile, topofile.objects[name]);
    break;
  }

  default: {
    console.warn("Don't know what to do with topofile type:", topofile.type)
    flash().type('error').message(topofile.type)();
    break;
  }
  }

  width = +svg.attr('width');
  height = +svg.attr('height');

  projection = d3.geoMercator();

  projection
    .scale(1)
    .center([0,0])
    .translate([0,0]);

  geopath = d3.geoPath()
    .projection(projection);

  const b = geopath.bounds(topo);
  const geo_width = (b[1][0] - b[0][0]);
  const geo_height = (b[1][1] - b[0][1]);

  scale = 1 / (Math.max(geo_width / width, geo_height / height));
  translate = [width/2 , height/2];

  projection
    .scale(opts.scale || scale)
    .center(opts.center || [0,0])
    .translate(opts.translate || translate)

  const _map = {
    topo: topo,
    projection: projection,
    geopath: geopath,
    svg: svg,
    map: map,
    init: null,
    land: land,
    scale: scale,
    width: width,
    height: height,
  };

  // ZOOM AND MOUSE EVENTS
  //
  {
    const comfy = 4/5;
    let mask;
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
      if (typeof ea_canvas === 'undefined') return;
    };

    let zoomend = () => {
      let k;

      if (d3.event)
        k = d3.event.transform.k;
      else
        k = comfy;

      if (typeof ea_datasets_collection === 'undefined') return;

      if (location.get_query_param('mode') === 'datasets')
      ea_datasets_collection
        .filter(x => x.active && x.features)
        .forEach(ds => {
          if (ds.polygons.shape_type === 'points')
            ea_map_load_points({
              map: _map,
              features: ds.features,
              cls: ds.id,
              symbol: ds.polygons.symbol,
              scale: k
            });
          else if (ds.polygons.shape_type === 'polygons')
            ea_map_load_features({
              map: _map,
              features: ds.features,
              cls: ds.id,
              scale: k,
            });
        });
    };

    let zooming = () => {
      let et;

      if (d3.event)
        et = zt = d3.event.transform;
      else
        et = zt = d3.zoomIdentity.translate(width/10, height/10).scale(comfy);

      const nw = projection.invert(et.invert([0,0]));
      const se = projection.invert(et.invert([width, height]));

      if (typeof ea_mapbox !== 'undefined' && ea_mapbox !== null)
        ea_mapbox.fitBounds([[nw[0], se[1]], [se[0], nw[1]]], { animate: false });

      map.attr("transform", et);
      mask.attr("transform", et);
    };

    let zoom = d3.zoom()
        .translateExtent([[0, 0], [width, height]])
        .scaleExtent([comfy, 200])
        .on("start", zoomstart)
        .on("zoom", zooming)
        .on("end", zoomend);

    svg.call(zoom)
      .on('mousemove', mousemove)
      .on('mouseenter', mouseenter)
      .on('mouseleave', mouseleave);

    zoom.scaleBy(svg, comfy);
    zoom.translateTo(svg, _map.width/10, _map.height/10);

    _map.init = () => {
      var d = d3.dispatch("init");

      d.on("init", _ => {
        zoomstart();
        zooming();
        zoomend();
      });

      d.call("init");
    }
  }

  return _map;
};

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

  let container = o.map.map.select(`#${o.cls}`);
  let paths;

  if (container.empty())
    container = o.map.map.append('g').attr('id', o.cls);

  container.selectAll(`path.${ o.cls }`).remove();

  paths = container.selectAll(`path.${ o.cls }`)
    .data(o.features).enter()
    .append('path')
    .attr('class', (o.cls || ''))
    .attr('id', d => o.cls + "-" + (d.gid || d.id || null))
    .attr('d', o.map.geopath)
    .attr('stroke-width', o.scale ? (0.5/o.scale) : 0);

  if (typeof o.classed === 'function')
    paths.classed("selectable", (d) => o.classed(d.gid || d.id || null));

  if (typeof o.mouseover === 'function')
    paths.on('mouseover', (d) => o.mouseover(d.gid || d.id || ''));

  if (typeof o.mouseenter === 'function')
    paths.on('mouseenter', (d) => o.mouseenter(d.gid || d.id || ''));

  if (typeof o.mouseleave === 'function')
    paths.on('mouseleave', (d) => o.mouseleave(d.gid || d.id || ''));

  if (typeof o.mousedown === 'function')
    paths.on('mousedown', (d) => o.mousedown(d.gid || d.id || ''));

  return container;
};
