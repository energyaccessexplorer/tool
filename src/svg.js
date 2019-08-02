function ea_svg_checkbox(init, callback) {
  const size = 24;

  const svg = d3.select(document.createElementNS(d3.namespaces.svg, "svg"))
        .attr('class', 'svg-checkbox');

  const g = svg.append('g');
  const gutter = g.append('rect');
  const check = g.append('path');

  let status = init || false;

  const active = getComputedStyle(document.body).getPropertyValue('--the-yellow');

  svg
    .attr('width', size)
    .attr('height', size)
    .style('cursor', 'pointer');

  gutter
    .attr('stroke', '#ccc')
    .attr('x', 0)
    .attr('y', 0)
    .attr('rx', 1)
    .attr('ry', 1)
    .attr('width', size)
    .attr('height', size);

  check
    .attr('fill', 'white')
    .attr('stroke', 'white')
    .attr('d', "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z");

  function change(s,x) {
    gutter
      .attr('stroke', (s ? active : '#ccc'))
      .style('fill', (s ? active : 'white'));

    if ((typeof callback === 'function') && x) callback(s);
  };

  svg.on('click', _ => change(status = !status, true));

  change(status, false);

  return {
    svg: svg.node(),
    change: change
  };
};

function ea_svg_radio(init, callback) {
  const size = 24;

  const svg = d3.select(document.createElementNS(d3.namespaces.svg, "svg"))
        .attr('class', 'svg-radio');

  const g = svg.append('g');
  const gutter = g.append('circle');
  const center = g.append('circle');

  let status = init || false;

  const active = getComputedStyle(document.body).getPropertyValue('--the-yellow');

  svg
    .attr('width', size)
    .attr('height', size)
    .style('cursor', 'pointer');

  gutter
    .attr('stroke', '#ccc')
    .attr('fill', 'white')
    .attr('r', (size/2) - 2)
    .attr('cx', (size/2))
    .attr('cy', (size/2));

  center
    .attr('r', (size/2) * (3/5))
    .attr('cx', (size/2))
    .attr('cy', (size/2));

  function change(s,i) {
    center
      .style('fill', (s ? active : 'white'))
      .style('stroke', (s ? active : 'white'));

    if (typeof callback === 'function' && !i) callback(s);
  };

  svg.on('click', _ => {
    if (status) return;
    else change(status = true);
  });

  svg.on('select', _ => change((status = true)));
  svg.on('unselect', _ => change((status = false)));

  change(status, init);

  return svg.node();
};

function ea_svg_range_steps(steps, init, opts = {}) {
  const callback1 = opts.callback1;
  const callback2 = opts.callback2;
  const end_callback = opts.end_callback;

  const radius = 5,
        svgwidth = opts.width || 256,
        svgheight = (radius * 2) + 2,
        linewidth = radius * 2,
        svgmin = radius + 1,
        svgmax = svgwidth - radius - 1;

  const norm = d3.scaleQuantize().domain([svgmin, svgmax]).range(steps);
  const denorm = d3.scaleLinear().domain([steps[0], steps[steps.length-1]]).range([svgmin, svgmax]);

  const svg = d3.select(document.createElementNS(d3.namespaces.svg, "svg"))
        .attr('class', 'svg-range');

  const g = svg.append('g');

  const gutter = g.append('rect');

  const c1 = g.append('circle');

  svg
    .attr('width', svgwidth + 2)
    .attr('height', svgheight + 2);

  gutter
    .attr('stroke', 'black')
    .attr('stroke-width', 0.1)
    .attr('fill', 'transparent')
    .attr('x', 1)
    .attr('y', (svgheight / 2) - 1)
    .attr('width', svgwidth - 2)
    .attr('height', 1);

  steps.forEach(s => {
    g.append('rect')
      .attr('x', denorm(s))
      .attr('y', radius - 2)
      .attr('fill', 'lightgray')
      .attr('stroke', 'none')
      .attr('width', 0.5)
      .attr('height', radius + 2);
  });

  c1
    .attr('r', radius)
    .attr('cy', svgheight/2)
    .attr('fill', getComputedStyle(document.body).getPropertyValue('--the-green'))
    .attr('stroke', 'none')
    .style('cursor', 'grab')
    .raise();

  let x_position;

  function dragged(x) {
    c1.attr('cx', denorm(norm(x)));
    if (typeof drag_callback === 'function') drag_callback(norm(x));
  };

  function change(v) {
    c1.attr('cx', denorm(v));
    if (typeof drag_callback === 'function') drag_callback(v);
  };

  c1.call(
    d3.drag()
      .on('drag', _ => {
        x_position = Math.max(svgmin, Math.min(d3.event.x, svgmax));
        dragged(x_position);
      })
      .on('start', _ => c1.raise())
      .on('end', _ => (typeof end_callback === 'function') ? end_callback(norm(x_position)) : 0)
  );

  dragged(denorm(init));

  return {
    svg: svg.node(),
    change: change
  };
};

function ea_svg_pie(data, outer, inner, colors, inner_text) {
  const width =  outer * 2,
        height = outer * 2;

  const pie = d3.pie()
        .value(d => d[0])
        .sort(null);

  const arc = d3.arc()
        .innerRadius(((inner === null || inner === undefined || inner === false) ? outer - (outer/4) : inner))
        .outerRadius(outer - (outer/15));

  let svg = d3.select(document.createElementNS(d3.namespaces.svg, "svg"))
      .attr('class', 'svg-pie')
      .attr("width", width)
      .attr("height", height);

  let g = svg.append("g")
      .attr("transform", `translate(${ width / 2 }, ${ height / 2 })`);

  let n;

  let outline = svg.append('circle')
      .attr('cx', width / 2)
      .attr('cy', height / 2)
      .attr('r', outer - (outer/15) - 1)
      .attr('stroke', 'gray')
      .attr('stroke-width', 0)
      .attr('fill', 'none');

  let path = g
      .datum(data)
      .selectAll("path")
      .data(pie).enter()
      .append("path")
      .attr("fill", (d,i) => colors[i])
      .attr("d", arc)
      .on("mouseenter", function(d) { n = nanny.pick_element(this, { "title": (d.value * 100).toFixed(2) + "%", "message": "", "position": "W" }); })
      .on("mouseleave", function(d) { if (n) n.remove(); })
      .each(function(d) { this._current = d });

  function change(v) {
    let t = "";

    pie.value(d => t = d[v]);
    path = path.data(pie);

    path
      .transition()
      .duration(750)
      .attrTween("d", tween);

    outline.attr('stroke-width', data.every(x => !x[v]) ? 0.5 : 0);
  };

  function tween(a) {
    const i = d3.interpolate(this._current, a);
    this._current = i(0);
    return t => arc(i(t));
  };

  return {
    data: data,
    change: change,
    tween: tween,
    path: path,
    svg: svg.node(),
  };
};

function ea_svg_color_steps(color_scale, steps, height) {
  const h = height || 8;

  const svg = d3.select(document.createElementNS(d3.namespaces.svg, "svg"))
        .attr('class', 'svg-interval');

  const g = svg.append('g');

  steps.forEach((v,i) => {
    g.append('rect')
      .attr('fill', color_scale(v,i))
      .attr('stroke', 'none')
      .attr('x', `${(100/steps.length) * i}%`)
      .attr('width', `${100/steps.length}%`)
      .attr('height', h);
  });

  svg
    .attr('width', "100%")
    .attr('height', h);

  return svg.node();
};

function ea_svg_interval(single, init, opts = {}) {
  const callback1 = opts.callback1;
  const callback2 = opts.callback2;
  const end_callback = opts.end_callback;

  const radius = 5,
        svgwidth = opts.width || 256,
        svgheight = (radius * 2) + 2,
        linewidth = radius * 2,
        svgmin = radius + 1,
        svgmax = svgwidth - radius - 1;

  const norm = d3.scaleLinear().domain([svgmin, svgmax]).range([0,1]);

  const svg = d3.select(document.createElementNS(d3.namespaces.svg, "svg"))
        .attr('class', 'svg-interval');

  const g = svg.append('g');

  const gutter = g.append('rect');
  const marked = g.append('rect');

  const umarked1 = g.append('rect');
  const umarked2 = g.append('rect');

  const c1 = g.append('circle');
  const c2 = g.append('circle');

  const fill = getComputedStyle(document.body).getPropertyValue('--the-green');

  svg
    .attr('width', svgwidth + 2)
    .attr('height', svgheight + 2);

  marked
    .attr('fill', fill)
    .attr('stroke', 'none')
    .attr('x', 1)
    .attr('y', (svgheight / 2) - 1.5)
    .attr('height', 2);

  gutter
    .attr('stroke', 'black')
    .attr('stroke-width', 0.1)
    .attr('fill', 'transparent')
    .attr('x', 1)
    .attr('y', (svgheight / 2) - 1)
    .attr('rx', 0)
    .attr('ry', 0)
    .attr('width', svgwidth - 2)
    .attr('height', 1);

  c1
    .attr('r', radius)
    .attr('cy', svgheight/2)
    .attr('fill', fill)
    .attr('stroke-width', 'none')
    .style('cursor', 'grab');

  c2
    .attr('r', radius)
    .attr('cy', svgheight/2)
    .attr('fill', fill)
    .attr('stroke-width', 'none')
    .style('cursor', 'grab');

  function drag_callback(c, cx, rx, w, callback) {
    c.attr('cx', cx);

    marked
      .attr('x', rx - radius)
      .attr('width', w + radius);

    if (typeof callback === 'function') callback(norm(cx).toFixed(2));
  };

  c1.call(
    d3.drag()
      .on('drag', _ => {
        const c2x = c2.attr('cx');
        const cx = Math.min(c2x, Math.max(d3.event.x, svgmin));

        drag_callback(c1, cx, cx, c2x - cx, callback1);
      })
      .on('start', _ => c1.raise())
      .on('end', _ => {
        if (typeof end_callback === 'function') end_callback();
      })
  );

  c2.call(
    d3.drag()
      .on('drag', _ => {
        const c1x = c1.attr('cx');
        const cx = Math.max(c1x, Math.min(d3.event.x, svgmax));

        drag_callback(c2, cx, c1x, cx - c1x, callback2);
      })
      .on('start', _ => c2.raise())
      .on('end', _ => {
        if (typeof end_callback === 'function') end_callback();
      })
  );

  function change(a,b) {
    const i0 = norm.invert(a);
    const i1 = norm.invert(b);

    drag_callback(c1, i0, i0, i1 - i0, callback1);
    drag_callback(c2, i1, i0, i1 - i0, callback2);
  };

  const i0 = (init ? norm.invert(init[0]) : svgmin);
  const i1 = (init ? norm.invert(init[1]) : svgmax);

  drag_callback(c1, i0, i0, i1 - i0, callback1);
  drag_callback(c2, i1, i0, i1 - i0, callback2);

  if (single) c1.remove();

  return {
    svg: svg.node(),
    change: change
  };
};

function ea_svg_points_symbol() {
  if (!(this instanceof DS)) throw `${this} should be a DS. Bye.`;

  const size = 28;

  const container = d3.select(document.createElementNS(d3.namespaces.svg, "svg"))
        .attr("class", 'svg-point')
        .attr("width", size)
        .attr("height", size);

  container
    .append('circle')
    .attr('r', 12)
    .attr('cx', size/2)
    .attr('cy', size/2)
    .attr('fill', this.vectors.fill)
    .attr('stroke', this.vectors.stroke)
    .attr('stroke-width', 2);

  return container.node();
};

function ea_svg_lines_symbol() {
  if (!(this instanceof DS)) throw `${this} should be a DS. Bye.`;

  const size = 28;

  const container = d3.select(document.createElementNS(d3.namespaces.svg, "svg"))
        .attr("width", size)
        .attr("height", size);

  container
    .append('path')
    .attr('d', "M 0.5625,23.71875 C 2.0625,8.0625 14.439788,10.706994 17.625,7.5 20.810212,4.2930056 23.71875,0.375 23.71875,0.375")
    .attr('fill', 'none')
    .attr('stroke-dasharray', this.vectors.dasharray)
    .attr('stroke', this.vectors.stroke)
    .attr('stroke-width', this.vectors.width * 2);

  return container.node();
};

function ea_svg_polygons_symbol() {
  if (!(this instanceof DS)) throw `${this} should be a DS. Bye.`;

  const size = 28;

  const container = d3.select(document.createElementNS(d3.namespaces.svg, "svg"))
        .attr("class", 'svg-polygon')
        .attr("width", size)
        .attr("height", size);

  container
    .append('path')
    .attr('d', "M 5.5532202,7.3474994 24.062506,2.1642083 26.51526,25.827 1.3896115,25.827438 Z")
    .attr('fill', this.vectors.fill)
    .attr('fill-opacity', this.vectors.opacity)
    .attr('stroke', this.vectors.stroke)
    .attr('stroke-width', this.vectors.width - 1 || 1);

  return container.node();
};
