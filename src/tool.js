function ea_plot(opts) {
  const {canvas, data, width, height, domain, nodata, colorscale} = opts;

  const ctx = canvas.getContext("2d");
  const imagedata = ctx.createImageData(width, height);
  const imgd = imagedata.data;

  const s = d3.scaleLinear().domain(domain).range([0,255]);
  const cs = colorscale.data;

  canvas.width = width;
  canvas.height = height;

  for (let i = p = 0; i < data.length; i += 1, p += 4) {
    if (data[i] === nodata) continue;

    const c = Math.round(s(data[i]));

    imgd[p] = cs[c*4];;
    imgd[p+1] = cs[c*4+1];
    imgd[p+2] = cs[c*4+2];
    imgd[p+3] = 255;
  }

  ctx.putImageData(imagedata, 0, 0);

  return canvas;
};

/*
 * ea_plot_output
 *
 * @param "raster" []numbers
 * @param "canvas" a canvas element (if null, will default to canvas#output)
 */

function ea_plot_output(data, canvas = null) {
  const A = DS.get('boundaries');

  if (!data.length) {
    warn("ea_plot_output: no raster given. Filling up with a blank (transparent) one...");
    data = new Float32Array(A.raster.data.length).fill(-1);
  };

  ea_plot({
    canvas: canvas || qs('canvas#output'),
    data: data,
    width: A.raster.width,
    height: A.raster.height,
    domain: [0,1],
    nodata: -1,
    colorscale: ea_analysis_colorscale,
  });
};

/*
 * ea_list_filter_type
 *
 * Utility.
 *
 * @param "type" string. ID or indexname.
 */

function ea_list_filter_type(type) {
  let idxn;

  if (['supply', 'demand'].includes(type))
    idxn = d => d.indexname === type || d.indexname === null;

  else if (['eai', 'ani'].includes(type))
    idxn = d => true;

  else
    idxn = d => d.id === type;

  return DS.all.filter(d => d.active && idxn(d));
};

/*
 * ea_coordinates_raster
 *
 * Transform a set of coordinates to the "relative position" inside a raster
 * that is bound to an area
 *
 * @param "coords" int[2]. Coordinates in Longitude/Latitude to be transformed.
 * @param "bounds" int[2][2]. Bounding box containing the raster data.
 * @param "raster" { width int, height int, novalue numeric, array numeric[] }
 *        full description.
 */

function ea_coordinates_in_raster(coords, bounds, raster) {
  if (coords.length !== 2)
    throw Error(`ea_coordinates_raster: expected and array of length 2. Got ${coords}`);

  const cw = bounds[1][0] - bounds[0][0];
  const ch = bounds[1][1] - bounds[2][1];

  let x = (coords[0] - bounds[0][0]);
  let y = (bounds[0][1] - coords[1]); // yes, right that is.

  let a = null;

  if ((x > 0 && x < cw &&
       y > 0 && y < ch )) {
    a = {
      x: Math.floor((x * raster.width) / cw),
      y: Math.floor((y * raster.height) / ch)
    };

    let v = raster.data[(a.y * raster.width) + a.x];

    a.value = v === raster.nodata ? null : v;
  }

  return a;
};

function table_data(dict, prop, event) {
  const t = document.createElement('table');
  dict.forEach(d => {
    t.append(el_tree([
      ce('tr'), [
        ce('td', ce('strong', d.target + ": &nbsp;")),
        ce('td', prop[d.dataset].toString())
      ]
    ]));
  });

  return t;
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

function interval_index(v, arr, clamp) {
  // TODO: implement non-clamp?
  //
  for (let i = 0; i < arr.length-1; i += 1) {
    if (v >= arr[i] && v <= arr[i+1]) return i;
  }

  return -1;
};

function right_pane(t) {
  qs('#inputs-pane').style.display = (t === 'inputs') ? '' : 'none';
  qs('#indexes-pane').style.display = (t === 'outputs') ? '' : 'none';
};

function ea_nanny_init(state) {
  window.ea_nanny = new nanny(ea_nanny_steps);

  if (state.inputs.length > 0) return;
  if (state.view !== "inputs") return;

  const w = localStorage.getItem('needs-nanny');

  if (!w || !w.match(/false/)) ea_nanny.start();
};

function ea_nanny_force_start() {
  history.replaceState(null, null, location.set_query_param('inputs', ''));
  history.replaceState(null, null, location.set_query_param('output', 'eai'));
  history.replaceState(null, null, location.set_query_param('view', 'inputs'));

  DS.all.filter(d => d.active).forEach(d => d.turn(false, false));

  ea_view('inputs');
  ea_controls_select_tab(qs('#controls-tab-filters'), "filters");
  ea_modal.hide();

  ea_overlord({
    "type": "refresh",
    "target": null,
    "caller": "ea_nanny_force_start"
  });

  ea_nanny.start();
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

    l.style['height'] = h - (o.clientHeight + d.clientHeight + 4) + "px";
  };

  if (MOBILE) m.style['width'] = screen.width + "px";

  document.body.onresize = set_heights;

  set_heights();
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

async function fake_download(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.target = "_blank";
  a.download = name ? name : '';
  a.style.display = 'none';

  document.body.appendChild(a);

  await delay(0.1);

  a.click();
  a.remove();
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
