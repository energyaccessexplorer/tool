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

function ea_svg_range_steps(steps, init, drag_callback, end_callback, is_weight) {
  const radius = 5,
        svgwidth = 256,
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
    .attr('fill', (is_weight ? 'lightgray' : 'transparent'))
    .attr('x', 1)
    .attr('y', (is_weight ? svgheight/2 : 1))
    .attr('rx', (is_weight ? 0 : radius))
    .attr('ry', (is_weight ? 0 : radius))
    .attr('width', svgwidth - 2)
    .attr('height', (is_weight ? 1 : svgheight - 2));

  steps.forEach(s => {
    g.append('rect')
      .attr('x', denorm(s))
      .attr('y', radius - 2)
      .attr('fill', 'lightgray')
      .attr('stroke', 'none')
      .attr('width', 1)
      .attr('height', radius + 2);
  });

  c1
    .attr('r', radius)
    .attr('cy', svgheight/2 + 1)
    .attr('fill', getComputedStyle(document.body).getPropertyValue('--the-green'))
    .attr('stroke', 'none')
    .style('cursor', 'grab')
    .raise();

  let x_position;

  function dragged(x) {
    const cx0 = denorm(norm(x));

    c1.attr('cx', cx0);
    marked.attr('width', cx0);

    if (typeof drag_callback === 'function') drag_callback(norm(x));
  };

  function change(v) {
    const cx0 = denorm(v);

    c1.attr('cx', cx0);
    marked.attr('width', cx0);

    if (typeof drag_callback === 'function') drag_callback(v);
  };

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

  return {
    svg: svg.node(),
    change: change
  };
};

function ea_svg_interval_gradient(color_scale, callback1, callback2, end_callback) {
  const radius = 5,
        svgwidth = 256,
        svgheight = (radius * 2) + 2,
        linewidth = radius * 2,
        svgmin = radius + 1,
        svgmax = svgwidth - radius - 1;

  const random = Math.random();

  const norm = d3.scaleLinear().domain([svgmin, svgmax]).range([0,1]);

  const svg = d3.select(document.createElementNS(d3.namespaces.svg, "svg"))
        .attr('class', 'svg-interval');

  const gradient = svg.append("defs")
        .append("linearGradient")
        .attr("id", `gradient-${random}`)
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "100%")
        .attr("y2", "0%")
        .attr("spreadMethod", "pad");

  const cr = color_scale().range();
  const cd = color_scale().domain();

  cr.forEach((v,i) => {
    gradient.append("stop")
      .attr("offset", `${cd[i] * 100}%`)
      .attr("stop-color", v)
      .attr("stop-opacity", 1);
  });

  const g = svg.append('g');

  const marked = g.append('rect');
  const gutter = g.append('rect');

  const c1 = g.append('circle');
  const c2 = g.append('circle');

  svg
    .attr('width', svgwidth + 2)
    .attr('height', svgheight + 2);

  gutter
    .attr('stroke', 'none')
    .attr('fill', 'none')
    .attr('x', 1)
    .attr('y', 1)
    .attr('rx', radius)
    .attr('ry', radius)
    .attr('width', svgwidth - 2)
    .attr('height', svgheight - 2);

  marked
    .attr('fill', `url(#gradient-${random})`)
    .attr('stroke', 'none')
    .attr('x', 1)
    .attr('y', 1)
    .attr('height', svgheight - 2);

  c1
    .attr('r', radius)
    .attr('cy', svgheight/2)
    .attr('fill', cr[0])
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .style('cursor', 'grab');

  c2
    .attr('r', radius)
    .attr('cy', svgheight/2)
    .attr('fill', cr[cr.length-1])
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .style('cursor', 'grab');

  function drag_callback(c, cx, rx, w, callback) {
    c.attr('cx', cx);

    marked
      .attr('x', rx)
      .attr('width', w);

    if (typeof callback === 'function') callback(norm(cx).toFixed(2));
  };

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
};

function ea_svg_pie(co, data, outer, inner, colors, inner_text, create = true) {
  const width =  outer * 2,
        height = outer * 2;

  const pie = d3.pie()
        .value((d) => d[0])
        .sort(null);

  const arc = d3.arc()
        .innerRadius(((inner === null || inner === undefined || inner === false) ? outer - (outer/4) : inner))
        .outerRadius(outer - (outer/15));

  const container = d3.select(co);

  let svg = null;

  if (create) {
    svg = container.append("svg")
      .attr("width", width)
      .attr("height", height);
  }

  else
    svg = container.select('svg');

  let g = null;

  if (! create) {
    g = svg.append("g")
      .attr("transform", `translate(${ svg.attr('width') / 2 }, ${ svg.attr('height') / 2 })`);
  }

  else {
    g = svg.append("g")
      .attr("transform", `translate(${ outer }, ${ outer })`);
  }

  let path = g
      .datum(data)
      .selectAll("path")
      .data(pie).enter()
      .append("path")
      .attr("fill", (d,i) => colors[i])
      .attr("d", arc)
      .each(function(d) { this._current = d });

  const text = svg.append("text")
        .attr("dy", ".35em")
        .attr("font-size", `${ outer / 47 }em`)
        .attr("class", "monospace pie-center");

  function change(v) {
    let t = "";

    pie.value(d => t = d[v]);
    path = path.data(pie);

    path
      .transition()
      .duration(750)
      .attrTween("d", tween);

    if (typeof inner_text === "string")
      text.text(inner_text);

    else if (typeof inner_text === "function")
      text.text(inner_text(data, v));

    else
      text.text("");

    try {
      const box = text.node().getBBox();

      const x = (outer - (box['width']  / 2));
      const y = (outer + (box['height'] / 10));

      text
        .attr('transform', `translate(${ x }, ${ y })`);

    } catch (e) {
      console.log('due to a bug in FF... return.')
      return;
    }
  };

  function tween(a) {
    const i = d3.interpolate(this._current, a);
    this._current = i(0);
    return (t) => arc(i(t));
  };

  return {
    change: change,
    tween: tween,
    path: path
  };
};

function ea_svg_color_gradient(color_scale, r) {
  const radius = r || 6,
        svgwidth = 280,
        svgheight = (radius * 2) + 2,
        linewidth = radius * 2,
        svgmin = radius + 1,
        svgmax = svgwidth - radius - 1;

  const random = Math.random();

  const norm = d3.scaleLinear().domain([svgmin, svgmax]).range([0,1]);

  const svg = d3.select(document.createElementNS(d3.namespaces.svg, "svg"))
        .attr('class', 'svg-interval');

  const gradient = svg.append("defs")
        .append("linearGradient")
        .attr("id", `gradient-${random}`)
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "100%")
        .attr("y2", "0%")
        .attr("spreadMethod", "pad");

  const cr = color_scale().range();
  const cd = color_scale().domain();

  cr.forEach((v,i) => {
    gradient.append("stop")
      .attr("offset", `${cd[i] * 100}%`)
      .attr("stop-color", v)
      .attr("stop-opacity", 1);
  });

  const g = svg.append('g');

  const marked = g.append('rect');

  svg
    .attr('width', "100%")
    .attr('height', svgheight + 2);

  marked
    .attr('fill', `url(#gradient-${random})`)
    .attr('stroke', 'none')
    .attr('x', 1)
    .attr('y', 1)
    .attr('width', "100%")
    .attr('height', svgheight - 2);

  return svg.node();
};

function ea_svg_color_steps(color_scale, r) {
  const radius = r || 6,
        svgheight = (radius * 2) + 2,
        linewidth = radius * 2,
        svgmin = radius + 1;

  const svg = d3.select(document.createElementNS(d3.namespaces.svg, "svg"))
        .attr('class', 'svg-interval');

  const steps = [0, 0.25, 0.5, 0.75, 1];

  const g = svg.append('g');

  steps.forEach((v,i) => {
    g.append('rect')
      .attr('fill', color_scale()(v))
      .attr('stroke', 'none')
      .attr('x', `${(100/steps.length) * i}%`)
      .attr('width', `${100/steps.length}%`)
      .attr('height', svgheight)
  });

  svg
    .attr('width', "100%")
    .attr('height', svgheight + 2);

  return svg.node();
};

function ea_svg_interval(single, init, callback1, callback2, end_callback) {
  const radius = 5,
        svgwidth = 256,
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
    .attr('y', (svgheight / 2) - 1)
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

  function change(a,b) {
    // TODO: set the values from the outer world (preset/settings)
    console.log(a,b);
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
        .attr("width", size)
        .attr("height", size);

  container
    .append('path')
    .attr('d', 'M 3.3615425,10.115331 22.909683,0.94439892 27.851628,19.286265 0.83565943,23.350655 Z')
    .attr('fill', this.vectors.fill)
    .attr('fill-opacity', this.vectors.opacity)
    .attr('stroke', this.vectors.stroke)
    .attr('stroke-width', this.vectors.width * 2);

  return container.node();
};

function ea_svg_info() {
  return `
<svg width="14px" height="14px" viewBox="0 0 14 14">
  <g stroke="none" stroke-width="1" fill-rule="evenodd">
    <g transform="translate(-630.000000, -731.000000)">
      <path d="M636,737 L635,737 L635,738 L636,738 L636,741 L635,741 L635,742 L636,742 L638,742 L639,742 L639,741 L638,741 L638,737 L636,737 Z M637,745 C633.134007,745 630,741.865993 630,738 C630,734.134007 633.134007,731 637,731 C640.865993,731 644,734.134007 644,738 C644,741.865993 640.865993,745 637,745 Z M636,734 L636,736 L638,736 L638,734 L636,734 Z" id="info"></path>
    </g>
  </g>
</svg>
`;
};

function ea_svg_arrow() {
  return `
<svg width="12px" height="10px" viewBox="0 0 12 10">
  <g stroke="none" stroke-width="1" fill-rule="evenodd">
    <g transform="translate(-220.000000, -734.000000)" fill-rule="nonzero">
      <path d="M227,738.12132 L227,744 L225,744 L225,738.12132 L221.707107,741.414214 L220,740 L226,734 L232,740 L230.292893,741.414214 L227,738.12132 Z" id="arrow-down" transform="translate(226.000000, 739.000000) scale(1, -1) translate(-226.000000, -739.000000) "></path>
    </g>
  </g>
</svg>`;
};

function ea_svg_opacity() {
  return `
<svg width="14px" height="14px" viewBox="0 0 14 14">
  <g id="UI-Kit" transform="translate(-563.000000, -732.000000)" fill="#393F44">
    <path d="M574,734.970107 L574,741.029893 C573.726681,741.51753 573.389413,741.962365 573,742.352242 L573,733.647758 C573.389413,734.037635 573.726681,734.48247 574,734.970107 Z M571,732.330304 L571,743.669696 C570.679203,743.796241 570.344927,743.894735 570,743.962266 L570,732.037734 C570.344927,732.105265 570.679203,732.203759 571,732.330304 Z M568,744 C565.169158,743.556854 563,741.039325 563,738 C563,734.960675 565.169158,732.443146 568,732 L568,744 Z" id="Opacity"></path>
  </g>
</svg>
`;
};
