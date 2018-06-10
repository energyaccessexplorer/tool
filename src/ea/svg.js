function ea_svg_land_mask(g) {
  var el = document.querySelector("#map");

  var mask = g.svg
    .append("defs")
    .append("mask")
    .attr("id", "country-mask");

  mask.append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", ea_settings.width)
    .attr("height", ea_settings.height)
    .style("fill", "white")
    .style("opacity", "1")
  ;

  var paths = document.querySelectorAll('#land path');
  var masknode = mask.node();

  paths.forEach((p) => masknode.appendChild(p.cloneNode()));

  g.svg
    .append("g")
    .attr("id", "mask")
    .attr("transform", "translate(0,0)")
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", ea_settings.width)
    .attr("height", ea_settings.height)
    .attr("mask", "url(#country-mask)")
    .style("fill", "#f8f8f8");
}

function ea_svg_checkbox(callback) {
  const radius = 5,
        svgwidth = 34,
        svgheight = (radius + 1) * 2,
        linewidth = (radius + 1) * 2,
        svgmin = radius + 1,
        svgmax = svgwidth - radius - 1;

  const svg = d3.select(document.createElementNS(d3.namespaces.svg, "svg"))
        .attr('class', 'svg-checkbox');

  const g = svg.append('g');
  const gutter = g.append('rect');
  const text = g.append('text');
  const c1 = g.append('circle');

  let status = false;

  svg
    .attr('width', svgwidth + 2)
    .attr('height', svgheight + 2)
    .style('cursor', 'pointer');

  gutter
    .attr('stroke', 'white')
    .attr('x', 1)
    .attr('y', 1)
    .attr('rx', radius)
    .attr('ry', radius)
    .attr('width', svgwidth - 2)
    .attr('height', svgheight - 2);

  c1
    .attr('r', radius - 0.5)
    .attr('cy', svgheight/2)
    .attr('cx', svgmin);

  text
    .attr('y', svgheight - (radius/2) - 1)
    .attr('font-size', (radius * 2) - 2.5)
    .attr('font-weight', "bold")
    .text("OFF");

  function change(s,init) {
    c1.attr('cx', (s ? svgmax : svgmin));

    gutter
      .style('fill', (s ? 'white' : 'none'))

    text
      .attr('x', (s ? (svgmin - 2) : svgmax - (radius * 2) - 4))
      .text((s ? "ON" : "OFF"))

    if (typeof callback === 'function' && !init) callback(s);
  }

  svg.on('click', () => change(status = !status))

  change(status, true);

  return svg.node();
}

function ea_svg_range_steps(steps, init, drag_callback, end_callback, is_weight) {
  const radius = (is_weight ? 5 : 6),
        svgwidth = 150,
        svgheight = (radius * 2) + 2,
        linewidth = radius * 2,
        svgmin = radius + 1,
        svgmax = svgwidth - radius - 1;

  const norm = d3.scaleQuantize().domain([svgmin, svgmax]).range(steps);
  const denorm = d3.scaleLinear().domain([steps[0], steps[steps.length-1]]).range([svgmin, svgmax]);

  const svg = d3.select(document.createElementNS(d3.namespaces.svg, "svg"))
        .attr('class', 'svg-range');

  const g = svg.append('g');

  const marked = g.append('rect');
  const gutter = g.append('rect');

  const c1 = g.append('circle');

  svg
    .attr('width', svgwidth + 2)
    .attr('height', svgheight + 2);

  marked
    .attr('stroke', 'none')
    .attr('rx', radius)
    .attr('ry', radius)
    .attr('x', 1)
    .attr('y', 1)
    .attr('height', (is_weight ? 0 : svgheight - 2));

  gutter
    .attr('stroke', (is_weight ? 'none' : 'white'))
    .attr('fill', (is_weight ? 'white' : 'transparent'))
    .attr('x', 1)
    .attr('y', (is_weight ? svgheight/2 : 1))
    .attr('rx', (is_weight ? 0 : radius))
    .attr('ry', (is_weight ? 0 : radius))
    .attr('width', svgwidth - 2)
    .attr('height', (is_weight ? 1 : svgheight - 2));

  c1
    .attr('r', radius)
    .attr('cy', svgheight/2)
    .style('cursor', 'grab');

  let x_position;

  function dragged(x) {
    const cx0 = denorm(norm(x));

    c1.attr('cx', cx0);
    marked.attr('width', cx0);

    if (typeof drag_callback === 'function') drag_callback(norm(x));
  }

  c1.call(
    d3.drag()
      .on('drag', () => {
        x_position = Math.max(svgmin, Math.min(d3.event.x, svgmax));
        dragged(x_position);
      })
      .on('start', () => c1.raise())
      .on('end', () => (typeof end_callback === 'function') ? end_callback(norm(x_position)) : 0)
  );

  dragged(denorm(init));

  return svg.node();
}

function ea_svg_interval(callback1, callback2, end_callback) {
  const radius = 6,
        svgwidth = 150,
        svgheight = (radius * 2) + 2,
        linewidth = radius * 2,
        svgmin = radius + 1,
        svgmax = svgwidth - radius - 1;

  const now = Date.now();

  const norm = d3.scaleLinear().domain([svgmin, svgmax]).range([0,1]);

  const svg = d3.select(document.createElementNS(d3.namespaces.svg, "svg"))
        .attr('class', 'svg-interval');

  const gradient = svg.append("defs")
        .append("linearGradient")
        .attr("id", `gradient-${now}`)
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "100%")
        .attr("y2", "0%")
        .attr("spreadMethod", "pad");

  gradient.append("stop")
    .attr("offset", "0%")
    .attr("stop-color", "blue")
    .attr("stop-opacity", 1);

  gradient.append("stop")
    .attr("offset", "100%")
    .attr("stop-color", "red")
    .attr("stop-opacity", 1);

  const g = svg.append('g');

  const marked = g.append('rect');
  const gutter = g.append('rect');

  const c1 = g.append('circle');
  const c2 = g.append('circle');

  svg
    .attr('width', svgwidth + 2)
    .attr('height', svgheight + 2);

  gutter
    .attr('stroke', 'white')
    .attr('fill', 'none')
    .attr('x', 1)
    .attr('y', 1)
    .attr('rx', radius)
    .attr('ry', radius)
    .attr('width', svgwidth - 2)
    .attr('height', svgheight - 2);

  marked
    .attr('fill', `url(#gradient-${now})`)
    .attr('stroke', 'none')
    .attr('x', 1)
    .attr('y', 1)
    .attr('height', svgheight - 2);

  c1
    .attr('r', radius)
    .attr('cy', svgheight/2)
    .attr('fill', 'blue')
    .style('cursor', 'grab');

  c2
    .attr('r', radius)
    .attr('cy', svgheight/2)
    .attr('fill', 'red')
    .style('cursor', 'grab');

  function drag_callback(c, cx, rx, w, callback) {
    c.attr('cx', cx);

    marked
      .attr('x', rx)
      .attr('width', w);

    if (typeof callback === 'function') callback(norm(cx).toFixed(2));
  }

  c1.call(
    d3.drag()
      .on('drag', () => {
        const c2x = c2.attr('cx');
        const cx = Math.min(c2x, Math.max(d3.event.x, svgmin));

        drag_callback(c1, cx, cx, c2x - cx, callback1);
      })
      .on('start', () => c1.raise())
      .on('end', () => {
        if (typeof end_callback === 'function') end_callback();
      })
  );

  c2.call(
    d3.drag()
      .on('drag', () => {
        const c1x = c1.attr('cx');
        const cx = Math.max(c1x, Math.min(d3.event.x, svgmax));
        drag_callback(c2, cx, c1x, cx - c1x, callback2);
      })
      .on('start', () => c2.raise())
      .on('end', () => {
        if (typeof end_callback === 'function') end_callback();
      })
  );

  drag_callback(c1, svgmin, svgmin, svgmax - svgmin, callback1);
  drag_callback(c2, svgmax, svgmin, svgmax - svgmin, callback2);

  return svg.node();
}
