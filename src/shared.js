NORM_STOPS = d3.range(0, 1.000000001, 0.25);

function ea_layout_init() {
  if (!GEOGRAPHY.timeline) qs('#timeline').remove();

  const n = qs('nav');
  const p = qs('#playground');
  const w = qs('#mobile-switcher');

  const m = qs('#maparea', p);
  const b = qs('#mapbox-container', m);
  const v = qs('#views', m);
  const t = qs('#timeline');

  const c = qs('#controls-wrapper', p);
  const r = qs('#right-pane', p);

  const d = qs('#drawer', r);

  function set_heights() {
    const h = window.innerHeight - n.clientHeight - (MOBILE ? w.clientHeight : 0);

    p.style['height'] =
      c.style['height'] =
      m.style['height'] =
      b.style['height'] =
      r.style['height'] = h + "px";

    b.style['height'] = (h - (MOBILE ? v.clientHeight : 0)) + "px";

    if (t) b.style['height'] = m.style['height'] = h - t.clientHeight + "px";
  };

  if (MOBILE) m.style['width'] = screen.width + "px";

  document.body.onresize = set_heights;

  set_heights();

  const oc = el_tree(
    [ ce('div', null, { id: 'bottom-right-container-output', class: 'bottom-right-container' }), [
      [ ce('select', null, { id: 'canvas-output-select' }) ],
      [ ce('canvas', null, { id: 'output' }) ]
    ]]
  );

  const gc = el_tree(
    [ ce('div', null, { id: 'bottom-right-container-graphs', class: 'bottom-right-container' }), [
      [ ce('h3', null, { id: 'district-header', class: "header" }) ],
      [ ce('div', null, { id: 'district-graph', class: "graphs" }) ]
    ]]
  );

  if (GEOGRAPHY.timeline) {
    qs('#filtered-pane').append(oc);
    qs('#cards-pane').append(gc);
  } else {
    qs('#cards-pane').append(oc);
  }
};

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
