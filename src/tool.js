/*
 * ea_canvas_plot
 *
 * Just a shorthand to plotty.plot
 * (see https://github.com/santilland/plotty.git)
 *
 * @param "raster" []numbers
 * @param "canvas" a canvas element (if null, will default to canvas#output)
 * @param "color_theme" string. name of the color scale to draw.
 *
 * returns a plotty object.
 */

function ea_canvas_plot(data, canvas, color_theme = 'ea') {
  const A = DS.get('boundaries');

  if (!data.length) {
    warn("ea_canvas_plot: no raster given. Filling up with a blank (transparent) one...");
    data = new Float32Array(A.raster.data.length).fill(-1);
  };

  if (!canvas) canvas = qs('canvas#output');

  const plot = new plotty.plot({
    canvas: canvas,
    data: data,
    width: A.raster.width,
    height: A.raster.height,
    domain: [0,1],
    noDataValue: -1,
    colorScale: color_theme,
  });

  plot.render();

  return plot;
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

  a = null;

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

function table_pointer(dict, prop, event) {
  const t = document.createElement('table');
  dict.forEach(e => {
    t.append(el_tree([
      ce('tr'), [
        ce('td', ce('strong', e.target)),
        ce('td', prop[e.dataset])
      ]
    ]));
  });

  mapbox_pointer(t, event.originalEvent.pageX, event.originalEvent.pageY)
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

  if (state.inputs.length > 1) return;
  if (state.mode !== "inputs") return;

  const w = localStorage.getItem('needs-nanny');

  if (!w || !w.match(/false/)) ea_nanny.start();
};

function ea_nanny_force_start() {
  history.replaceState(null, null, location.set_query_param('inputs', 'boundaries'));
  history.replaceState(null, null, location.set_query_param('output', 'eai'));
  history.replaceState(null, null, location.set_query_param('mode', 'inputs'));

  DS.all.filter(d => d.active && d.id !== 'boundaries').forEach(d => d.turn(false, false));

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
  const m = qs('#maparea', p);
  const c = qs('#controls-wrapper', p);
  const r = qs('#right-pane', p);
  const o = qs('#canvas-output-container', r);
  const d = qs('#drawer', r);
  const l = qs('#inputs-list', r);

  function set_heights() {
    p.style['height'] =
      c.style['height'] =
      m.style['height'] =
      window.innerHeight - n.clientHeight + "px";

    l.style['height'] = p.clientHeight - (o.clientHeight + d.clientHeight + 4) + "px";
  };

  document.body.onresize = set_heights;

  set_heights();
};

function ea_views_init() {
  const el = qs('#views');

  Object.keys(ea_views).forEach(v => {
    const btn = ce('div', ea_views[v]['name'], { class: 'view up-title', ripple: '' });

    btn.addEventListener('mouseup', function(e) {
      qsa('#views .up-title', el).forEach(e => e.classList.remove('active'));

      setTimeout(_ => {
        ea_overlord({
          "type": "mode",
          "target": v,
          "caller": "ea_views_init",
        });

        btn.classList.add('active');
      }, 50);
    });

    if (location.get_query_param('mode') === v) btn.classList.add('active');

    el.append(btn);
  });
};

function ea_help() {
  const hm = qs('[bind=help-message]').cloneNode(true);
  hm.style.display = 'block';

  ea_modal.set({
    header: "Help",
    content: hm,
    footer: null
  }).show();
};
