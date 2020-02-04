NORM_STOPS = d3.range(0, 1.000000001, 0.25);

function ea_layout_init() {
  const n = qs('nav');
  const p = qs('#playground');
  const w = qs('#mobile-switcher');

  const m = qs('#maparea', p);
  const b = qs('#mapbox-container', m);
  const v = qs('#views', m);
  const t = qs('#timeline');

  const c = qs('#controls-wrapper', p);
  const r = qs('#right-pane', p);

  const i = qs('#indexes-pane', r);
  const f = qs('#filtered-pane', r);
  const l = qs('#cards-list', r);
  const o = qs('#bottom-right-container', r);
  const d = qs('#drawer', r);

  function set_heights() {
    const h = window.innerHeight - n.clientHeight - (MOBILE ? w.clientHeight : 0);

    p.style['height'] =
      c.style['height'] =
      m.style['height'] =
      b.style['height'] =
      r.style['height'] = h + "px";

    b.style['height'] = (h - (MOBILE ? v.clientHeight : 0)) + "px";

    if (i) i.style['height'] = h - d.clientHeight + "px";
    if (f) f.style['height'] = h - d.clientHeight + "px";
    if (l) l.style['height'] = h - ((o ? o.clientHeight : 0) + d.clientHeight + 4) + "px";
    if (t) b.style['height'] = m.style['height'] = h - t.clientHeight + "px";
  };

  if (MOBILE) m.style['width'] = screen.width + "px";

  document.body.onresize = set_heights;

  set_heights();
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

async function ea_view(v, btn) {
  const el = qs('#views');
  const btns = qsa('#views .up-title', el);

  btns.forEach(e => e.classList.remove('active'));

  await delay(0.1);

  ea_overlord({
    "type": "view",
    "target": v,
    "caller": "ea_views_init",
  });

  qs('#view-' + v).classList.add('active');
};

function ea_views_init() {
  const url = new URL(location);

  const el = qs('#views');

  for (let v in ea_views) {
    const btn = ce('div', ea_views[v]['name'], { class: 'view up-title', id: 'view-' + v, ripple: '' });

    btn.onclick = _ => ea_view(v);

    if (url.searchParams.get('view') === v) btn.classList.add('active');

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

function parseRGBA(str) {
  let c;

  if (!str) return [0, 0, 0, 255];

  if (str.match(/^#([A-Fa-f0-9]{3}){1,2}$/)) {
    c = str.substring(1).split('');

    if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];

    c = '0x' + c.join('');

    return [(c>>16)&255, (c>>8)&255, c&255, 255];
  }
  else if (c = str.match(/^rgba?\(([0-9]{1,3}),\ ?([0-9]{1,3}),\ ?([0-9]{1,3}),?\ ?([0-9]{1,3})?\)$/)) {
    return [+c[1], +c[2], +c[3], +c[4] || 255];
  }

  else
    throw new Error(`parseRGBA: argument ${str} doesn't match`);
};

/*
 * ea_state_sync
 *
 * Gather the parameters from the current URL, clean them up, set the defaults
 *
 * returns an Object with the handled params and their set_ methods.
 */

function ea_state_sync() {
  const url = new URL(location);
  const o = {}

  for (let k in ea_state_params) {
    let v = url.searchParams.get(k);

    let arr = !ea_state_params[k].length;

    if (!v || v === "") {
      o[k] = ea_state_params[k][0] || [];
    } else {
      o[k] = arr ? v.split(',') : v;
    }

    // Force the default if tampered with.
    //
    if (!arr && !ea_state_params[k].includes(v))
      o[k] = ea_state_params[k][0];

    url.searchParams.set(k, o[k]);
  }

  history.replaceState(null, null, url);

  return o;
};

function ea_state_set(k,a) {
  const url = new URL(location);

  let v = a || maybe(ea_state_params, k, 0) || "";

  url.searchParams.set(k,v);

  history.replaceState(null, null, url);

  return url.searchParams.get(k);
};

function has(element, attr) {
  return !(typeof element[attr] === 'undefined' || element[attr] === null);
};
