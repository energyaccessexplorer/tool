function ea_svg_checkbox(init, callback) {
  const size = 24;

  const svg = d3.create("svg")
        .attr('class', 'svg-checkbox');

  const g = svg.append('g');

  const defs = svg.append('defs');

  const gutter = g.append('rect');

  const check = g.append('path');

  let status = init || false;

  const active = getComputedStyle(document.body).getPropertyValue('--the-yellow');

  svg
    .attr('width', size)
    .attr('height', size)
    .style('cursor', 'pointer');

  defs
    .append('filter')
    .attr('id', 'shadow-checkbox')
    .append('feDropShadow')
    .attr('dx', 0.1)
    .attr('dy', 0.1)
    .attr('stdDeviation', 0.8);

  gutter
    .attr('x', 0)
    .attr('y', 0)
    .attr('rx', 1)
    .attr('ry', 1)
    .attr('style', 'filter: url(#shadow-checkbox);')
    .attr('width', size)
    .attr('height', size);

  check
    .attr('fill', 'white')
    .attr('stroke', 'white')
    .attr('d', "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z");

  function change(s,x) {
    gutter
      .attr('stroke', (s ? active : '#aaaaaa'))
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

function ea_svg_switch(init, callback, opts = {}) {
  const radius = 10,
        svgwidth = 38,
        svgheight = (radius * 2) + 2,
        linewidth = radius * 2,
        svgmin = radius + 1,
        svgmax = svgwidth - radius - 1;

  const svg = d3.create("svg")
        .attr('class', 'svg-checkbox');

  const defs = svg.append('defs');

  const g = svg.append('g');

  const gutter = g.append('rect');

  const c1 = g.append('circle');

  let status = init || false;

  const active = getComputedStyle(document.body).getPropertyValue('--the-yellow');

  svg
    .attr('width', svgwidth)
    .attr('height', svgheight)
    .style('cursor', 'pointer');

  defs
    .append('filter')
    .attr('id', 'shadow-switch')
    .append('feDropShadow')
    .attr('dx', 0.2)
    .attr('dy', 0.2)
    .attr('stdDeviation', 0.8);

  gutter
    .attr('stroke', 'none')
    .attr('stroke-width', 0.4)
    .attr('fill', 'white')
    .attr('fill-opacity', 0.6)
    .attr('rx', (6/8) * radius)
    .attr('x', 1)
    .attr('y', (3/16) * svgheight)
    .attr('width', svgwidth - 2)
    .attr('height', (5/8) * svgheight);

  c1
    .attr('r', radius)
    .attr('cy', svgheight/2)
    .attr('stroke', 'black')
    .attr('stroke-width', 0.2)
    .attr('fill', 'white')
    .attr('style', 'filter: url(#shadow-switch);')
    .style('cursor', 'grab')
    .raise();

  function change(s,x) {
    c1
      .attr('fill', (s ? active : 'white'))
      .attr('cx', (s ? svgmax : svgmin));

    gutter
      .attr('stroke', 'black')
      .style('fill', (s ? active : '#f9f9f9'));

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
  const size = 20;

  const svg = d3.create("svg")
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

function ea_svg_pie(data, outer, inner, colors, inner_text, parse) {
  if (typeof parse !== 'function')
    parse = x => (x * 100).toFixed(2);

  const width =  outer * 2,
        height = outer * 2;

  const pie = d3.pie()
        .value(d => d[0])
        .sort(null);

  const arc = d3.arc()
        .innerRadius(typeof inner !== 'number' ? outer - (outer/4) : inner)
        .outerRadius(outer - (outer/15));

  const svg = d3.create("svg")
      .attr('class', 'svg-pie')
      .attr("width", width)
      .attr("height", height);

  const g = svg.append("g")
      .attr("transform", `translate(${ width / 2 }, ${ height / 2 })`);

  let n;

  const outline = svg.append('circle')
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
      .on("mouseenter", function(d) { n = nanny.pick_element(this, { message: parse(d.value) + "%", position: "W", close: false }); })
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

function ea_svg_color_steps(steps, height) {
  const h = height || 5;

  const svg = d3.create("svg")
        .attr('class', 'svg-interval');

  const g = svg.append('g');

  steps.forEach((v,i) => {
    g.append('rect')
      .attr('fill', v)
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

function ea_svg_interval(opts = {}) {
  const {single, domain, init, steps, width, callback1, callback2, end_callback} = opts;

  const radius = 6,
        svgwidth = width || 256,
        svgheight = (radius * 2) + 2,
        linewidth = radius * 2,
        svgmin = radius + 1,
        svgmax = svgwidth - radius - 1;

  let norm = d3.scaleLinear().domain([svgmin, svgmax]).range(domain);
  let denorm = norm.invert;

  if (steps) {
    norm = d3.scaleQuantize().domain([svgmin, svgmax]).range(steps);
    denorm = d3.scaleLinear().domain([steps[0], steps[steps.length-1]]).range([svgmin, svgmax]);
  }

  const svg = d3.create("svg")
        .attr('class', 'svg-interval');

  const defs = svg.append('defs');

  const g = svg.append('g');
  const ticks = g.append('g');

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

  defs
    .append('filter')
    .attr('id', 'shadow-interval')
    .append('feDropShadow')
    .attr('dx', 0.1)
    .attr('dy', 0.1)
    .attr('stdDeviation', 0.8);

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

  ticks.selectAll('rect.tick')
    .data(steps || []).enter()
    .append('rect')
    .attr('class', 'tick')
    .attr('x', d => denorm(d))
    .attr('y', radius - 2)
    .attr('fill', 'lightgray')
    .attr('stroke', 'none')
    .attr('width', 0.5)
    .attr('height', radius + 2);

  marked
    .attr('fill', fill)
    .attr('stroke', 'none')
    .attr('x', 1)
    .attr('y', (svgheight / 2) - 1.5)
    .attr('height', 2);

  c1
    .attr('r', radius)
    .attr('cy', svgheight/2)
    .attr('fill', 'white')
    .attr('style', 'filter: url(#shadow-interval);')
    .attr('stroke-width', 'none')
    .style('cursor', 'grab');

  c2
    .attr('r', radius)
    .attr('cy', svgheight/2)
    .attr('fill', 'white')
    .attr('style', 'filter: url(#shadow-interval);')
    .attr('stroke-width', 'none')
    .style('cursor', 'grab');

  function dragged(c, cx, callback) {
    if (steps) cx = denorm(norm(cx));

    c.attr('cx', cx);

    const w = +c2.attr('cx') - c1.attr('cx');

    marked
      .attr('x', +c1.attr('cx'))
      .attr('width', (w < 0) ? 0 : w);

    if (typeof callback === 'function') callback(norm(cx).toFixed(2));
  };

  let x_position;

  c1.call(
    d3.drag()
      .on('drag', _ => {
        const c2x = c2.attr('cx');
        const cx = x_position = Math.min(c2x, Math.max(d3.event.x, svgmin));

        dragged(c1, cx, callback1);
      })
      .on('start', _ => c1.raise())
      .on('end', _ => {
        if (typeof end_callback === 'function') end_callback(norm(x_position));
      })
  );

  c2.call(
    d3.drag()
      .on('drag', _ => {
        const c1x = c1.attr('cx');
        const cx = x_position = Math.max(c1x, Math.min(d3.event.x, svgmax));

        dragged(c2, cx, callback2);
      })
      .on('start', _ => c2.raise())
      .on('end', _ => {
        if (typeof end_callback === 'function') end_callback(norm(x_position));
      })
  );

  function change(a,b) {
    dragged(c1, denorm(a), callback1);
    dragged(c2, denorm(b), callback2);
  };

  if (init) change(init[0], init[1]);

  if (single) c1.remove();

  return {
    svg: svg.node(),
    change: change
  };
};

function ea_svg_points_symbol() {
  if (!(this instanceof DS)) throw `${this} should be a DS. Bye.`;

  const size = 24;

  const svg = d3.create("svg")
        .attr("class", 'svg-point')
        .attr("width", size)
        .attr("height", size);

  svg
    .append('circle')
    .attr('r', (size/2) - 2)
    .attr('cx', size/2)
    .attr('cy', size/2)
    .attr('fill', this.vectors.config.fill)
    .attr('stroke', this.vectors.config.stroke)
    .attr('stroke-width', 2);

  return svg.node();
};

function ea_svg_lines_symbol() {
  if (!(this instanceof DS)) throw `${this} should be a DS. Bye.`;

  const size = 28;

  const svg = d3.create("svg")
        .attr("width", size)
        .attr("height", size);

  svg
    .append('path')
    .attr('d', "M 0.5625,23.71875 C 2.0625,8.0625 14.439788,10.706994 17.625,7.5 20.810212,4.2930056 23.71875,0.375 23.71875,0.375")
    .attr('fill', 'none')
    .attr('stroke-dasharray', this.vectors.config.dasharray)
    .attr('stroke', this.vectors.config.stroke)
    .attr('stroke-width', this.vectors.config.width * 2);

  return svg.node();
};

function ea_svg_polygons_symbol() {
  if (!(this instanceof DS)) throw `${this} should be a DS. Bye.`;

  const size = 28;

  const svg = d3.create("svg")
        .attr("class", 'svg-polygon')
        .attr("width", size)
        .attr("height", size);

  svg
    .append('path')
    .attr('d', "M 5.5532202,7.3474994 24.062506,2.1642083 26.51526,25.827 1.3896115,25.827438 Z")
    .attr('fill', this.vectors.config.fill)
    .attr('fill-opacity', this.vectors.config.opacity)
    .attr('stroke', this.vectors.config.stroke)
    .attr('stroke-width', this.vectors.config.width - 1 || 1);

  return svg.node();
};

function ea_svg_timeline_slider(opts) {
  const {steps, dragging, parent, width, init} = opts;

  const radius = 16,
        svgwidth = width,
        svgheight = (radius * 2) + 3,
        linewidth = radius * 3,
        svgmin = radius + 2,
        svgmax = svgwidth - radius - 2;

  const norm = d3.scaleQuantize().domain([svgmin, svgmax]).range(steps);
  const denorm = d3.scaleLinear().domain([steps[0], steps[steps.length-1]]).range([svgmin, svgmax]);

  const svg = d3.create("svg")
        .attr('class', 'svg-timeline');

  const g = svg.append('g');

  const gutter = g.append('rect');

  const circle = g.append('circle');

  svg
    .attr('width', svgwidth + 2)
    .attr('height', svgheight + 2 + 30);

  steps.forEach(x => {
    g.append('text').text(x)
      .attr('transform', `translate(${denorm(x) - 16}, ${svgheight + 32})`)
      .style('font-family', 'monospace')
  });

  gutter
    .attr('stroke', '#42505B')
    .attr('stroke-width', 0.5)
    .attr('fill', 'white')
    .attr('x', 1)
    .attr('y', 1)
    .attr('rx', radius)
    .attr('ry', radius)
    .attr('width', svgwidth - 2)
    .attr('height', svgheight - 2);

  circle
    .attr('r', radius)
    .attr('cy', svgheight/2)
    .attr('fill', '#E4A82E')
    .attr('stroke', '#42505B')
    .attr('stroke-width', 3)
    .style('cursor', 'grab');

  function drag(cx) {
    const cx0 = denorm(norm(cx));
    circle.attr('cx', cx0);

    dragging(norm(cx));
  };

  const behaviour = d3.drag()
        .on('drag', _ => drag(d3.event.x));

  circle.call(behaviour);

  gutter.on('click', _ => drag(d3.event.offsetX));

  drag(denorm(steps[init || 0]));

  return {
    svg: svg.node(),
    set: x => drag(denorm(x))
  };
};

function ea_svg_multiline(opts) {
  const {domain, range, data, color, message} = opts;

  const width = opts.width || 600;
  const height = opts.height || 400;

  const margin = { top: 20, right: 20, bottom: 30, left: 40 };

  const svg = d3.create("svg")
        .attr("viewBox", [0, 0, width, height]);

  const x = d3.scaleUtc()
        .domain(d3.extent(data.dates))
        .range([margin.left, width - margin.right]);

  const y = d3.scaleLinear()
        .domain(domain || [d3.min(data.series, d => d3.min(d.values)), d3.max(data.series, d => d3.max(d.values))]).nice()
        .range([height - margin.bottom, margin.top]);

  const xAxis = g => g
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(width / 80).tickSizeOuter(0));

  const yAxis = g => g
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y))
        .call(g => g.select(".domain").remove());

  const line = d3.line()
        .defined(d => !isNaN(d))
        .x((d, i) => x(data.dates[i]))
        .y(d => y(d));

  const dot = svg.append("g")
        .attr("display", "none");

  const path = svg.append("g")
        .attr("fill", "none")
        .attr("stroke-width", 1.5)
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round")
        .selectAll("path")
        .data(data.series)
        .join("path")
        .style("mix-blend-mode", "multiply")
        .attr("stroke", d => d.color || color)
        .attr("d", d => line(d.values));

  const dotnode = dot.node();

  dot.append("circle")
    .attr("r", 2.5)
    .attr("fill", 'transparent');

  svg.append("g")
    .call(xAxis);

  svg.append("g")
    .call(yAxis);

  let n;

  function hover(svg, path) {
    svg
      .style("position", "relative");

    if ("ontouchstart" in document) {
      svg
        .style("-webkit-tap-highlight-color", "transparent")
        .on("touchmove", moved)
        .on("touchstart", entered)
        .on("touchend", left);
    }
    else {
      svg
        .on("mousemove", moved)
        .on("mouseenter", entered)
        .on("mouseleave", left);
    }

    function moved() {
      d3.event.preventDefault();

      const ym = y.invert(d3.event.layerY);
      const xm = x.invert(d3.event.layerX);
      const i1 = d3.bisectLeft(data.dates, xm, 1);
      const i0 = i1 - 1;
      const i = xm - data.dates[i0] > data.dates[i1] - xm ? i1 : i0;
      const s = data.series.reduce((a, b) => Math.abs(a.values[i] - ym) < Math.abs(b.values[i] - ym) ? a : b);

      if (undefined === data.dates[i] || undefined === s.values[i]) return;

      path.attr("stroke", d => d === s ? (d.color || color) : "#ddd").filter(d => d === s).raise();

      dot.attr("transform", `translate(${x(data.dates[i])},${y(s.values[i])})`);

      n ? n.remove() : null;

      n = nanny.pick_element(dot.node(), {
        title: s.name,
        message: typeof message === 'function' ? message(s, i, s.values[i]) : s.name,
        position: "W",
        close: false
      });
    };

    function entered() {
      path.style("mix-blend-mode", null).attr("stroke", "#ddd");
      dot.attr("display", null);
    };

    function left() {
      path.style("mix-blend-mode", "multiply").attr("stroke", d => d.color || color);
      dot.attr("display", "none");
      n ? n.remove() : null;
    };
  };

  function highlight(name, date) {
    const s = data.series.find(x => x.name === name);
    const i = data.dates.findIndex(x => x.getTime() === date.getTime());

    path.attr("stroke", d => d === s ? (d.color || color) : "#ddd").filter(d => d === s).raise();
    dot.attr("transform", `translate(${x(data.dates[i])},${y(s.values[i])})`);
    dot.select("text").text(s.name);
    dot.attr("display", null);
  };

  svg.call(hover, path);

  return {
    svg: svg.node(),
    highlight: highlight,
  };
};
