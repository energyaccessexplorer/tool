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

function ea_current_config() {
  const state = ea_state_sync();
  const config = {
    geography_id: location.get_query_param('id'),
    analysis_type: state.output,
    datasets: []
  };

  for (let i of state.inputs) {
    let d = DS.get(i);
    let c = {};

    c.id = d.dataset_id;
    c.category = d.id;
    c.weight = d.weight;
    c.domain = d.domain.map(x => +x);

    config.datasets.push(c);
  }

  let blob = new Blob([JSON.stringify(config)], { type: "application/octet-stream;charset=utf-8" });

  fake_download(URL.createObjectURL(blob), `energyaccessexplorer-${state.output}.json`);

  return config;
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
