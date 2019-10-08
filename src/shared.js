function ea_layout_init() {
  const n = qs('nav');
  const p = qs('#playground');
  const w = qs('#mobile-switcher');

  const m = qs('#maparea', p);
  const b = qs('#mapbox-container', m);
  const v = qs('#views', m);

  const c = qs('#controls-wrapper', p);
  const r = qs('#right-pane', p);

  const l = qs('#inputs-list', r);
  const o = qs('#canvas-output-container', r);
  const d = qs('#drawer', r);

  function set_heights() {
    const h = window.innerHeight - n.clientHeight - (MOBILE ? w.clientHeight : 0);

    p.style['height'] =
      c.style['height'] =
      m.style['height'] =
      r.style['height'] = h + "px";

    b.style['height'] = (h - (MOBILE ? v.clientHeight : 0)) + "px";

    l.style['height'] = h - ((o ? o.clientHeight : 0) + d.clientHeight + 4) + "px";
  };

  if (MOBILE) m.style['width'] = screen.width + "px";

  document.body.onresize = set_heights;

  set_heights();
};

function ea_colorscale(opts) {
  const w = 256;

  let s = d3.scaleLinear()
      .domain(opts.domain.map(i => i * 255))
      .range(opts.stops)
      .clamp(true);

  const a = new Uint8Array(w*4).fill(-1);
  for (let i = 0; i < a.length; i += 4) {
    let color = s(i/4).match(/rgb\((.*)\)/)[1].split(',').map(x => parseInt(x));

    a[i] = color[0];
    a[i+1] = color[1];
    a[i+2] = color[2];
    a[i+3] = 255;
  }

  return {
    stops: opts.stops,
    domain: opts.domain,
    data: a,
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
  const el = qs('#views');

  Object.keys(ea_views).forEach(v => {
    const btn = ce('div', ea_views[v]['name'], { class: 'view up-title', id: 'view-' + v, ripple: '' });

    btn.onclick = _ => ea_view(v);

    if (location.get_query_param('view') === v) btn.classList.add('active');

    el.append(btn);
  });
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

function date_valid(d) {
  return d instanceof Date && !isNaN(d);
};

function interval_index(v, arr, clamp) {
  // TODO: implement non-clamp?
  //
  for (let i = 0; i < arr.length-1; i += 1) {
    if (v >= arr[i] && v <= arr[i+1]) return i;
  }

  return -1;
};

function hex_to_rgba(str) {
  let c;
  if (str.match(/^#([A-Fa-f0-9]{3}){1,2}$/)) {
    c = str.substring(1).split('');

    if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];

    c = '0x' + c.join('');

    return [(c>>16)&255, (c>>8)&255, c&255, 255];
  }

  throw new Error("hex_to_rgba: argument doesn't match");
};
