NORM_STOPS = d3.range(0, 1.000000001, 0.25);

function ea_colorscale(opts) {
  let s;

  let {intervals,stops,domain} = opts;

  if (!stops || !stops.length)
    stops = ea_default_colorscale.stops;

  if (!domain || domain.length < 2)
    domain = NORM_STOPS;

  if (maybe(intervals, 'length')) {
    s = d3.scaleQuantile()
      .domain(domain = intervals)
      .range(stops);
  }
  else {
    s = d3.scaleLinear()
      .domain(d3.range(domain.min, domain.max + 0.0000001, (domain.max - domain.min) / (stops.length - 1)))
      .range(stops)
      .clamp(true);
  }

  return {
    domain: domain,
    fn: x => parseRGBA(s(x)),
    stops: stops,
    intervals: intervals,
    svg: ea_svg_color_steps(stops)
  };
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

function ea_svg_interval(opts = {}) {
  const {sliders, domain, init, steps, width, callback1, callback2, end_callback} = opts;

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

  if (sliders === "single") c1.remove();

  return {
    svg: svg.node(),
    change: change
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

function ea_svg_checkbox(init, callback) { // this is not used anywhere
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

function ea_view_buttons() {
  const el = qs('#views');
  const btns = qsa('#views .up-title', el);

  btns.forEach(e => e.classList.remove('active'));

  const t = qs('#view-' + U.view);
  if (t) t.classList.add('active');
};

function ea_view_right_pane() {
  const panes = ["cards", "indexes", "filtered"];

  const views = {
    "timeline": ["cards"],
    "inputs": ["cards"],
    "outputs": ["indexes"],
    "filtered": ["filtered"],
  };

  for (let pi of panes) {
    let p; if (!(p = qs(`#${pi}-pane`))) continue;
    p.style['z-index'] = (views[U.view].indexOf(pi) > -1) ? 1 : 0;
  }
};

function ea_views_init() {
  const el = qs('#views');

  for (let v in ea_views) {
    if (!U.params.view.includes(v)) continue;

    const btn = ce('div', ea_views[v]['name'], { class: 'view up-title', id: 'view-' + v, ripple: '' });

    if (U.view === v) btn.classList.add('active');

    btn.onclick = async _ => {
      await delay(0.2);
      O.view = v;
    };

    el.append(btn);
  }
};

function ea_dataset_modal(ds) {
  const b = ds.metadata;
  b['why'] = ds.category.metadata.why;

  const content = tmpl('#ds-info-modal', b);
  qs('#metadata-sources', content).href = ds.metadata.download_original_url;
  qs('#learn-more', content).href = ds.metadata.learn_more_url;

  ea_modal.set({
    header: ds.name,
    content: content,
    footer: null
  }).show();
};

async function ea_overview(cca3) {
  let r;

  await fetch('https://wri-public-data.s3.amazonaws.com/EnergyAccess/Country%20indicators/eae_country_indicators.csv')
    .then(r => r.text())
    .then(t => d3.csvParse(t))
    .then(d => {
      return r = d.find(x => x.cca3 === GEOGRAPHY.cca3);
    })

  if (r) {
    r['urban_population'] = (100 - r['rural_population']).toFixed(1);

    if (r['urban_electrification'] > 0) {
      let eru = ea_svg_pie(
        [
          [100 - r['urban_electrification']],
          [r['urban_electrification']]
        ],
        50, 0,
        [
          getComputedStyle(document.body).getPropertyValue('--the-light-green'),
          getComputedStyle(document.body).getPropertyValue('--the-green')
        ],
        "",
        x => x
      );

      r['urban_electrification_pie'] = eru.svg;
      eru.change(0);
    }

    if (r['rural_electrification'] > 0) {
      let err = ea_svg_pie(
        [
          [100 - (r['rural_electrification'])],
          [r['rural_electrification']]
        ],
        50, 0,
        [
          getComputedStyle(document.body).getPropertyValue('--the-light-green'),
          getComputedStyle(document.body).getPropertyValue('--the-green')
        ],
        "",
        x => x
      );

      r['rural_electrification_pie'] = err.svg;
      err.change(0);
    }

    ea_modal.set({
      header: r.name,
      content: tmpl('#country-overview', r),
      footer: ce(
        'div',
        "<strong>Source:</strong> World Bank, World Development Indicators (latest data) crosschecked with values reported by local stakeholders/partners.",
        { style: "font-size: small; max-width: 30em; margin-left: auto; margin-right: 0;" }
      ),
    }).show();
  }
};
