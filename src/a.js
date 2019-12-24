function ea_plot(opts) {
  const {canvas, data, width, height, nodata, colorscale} = opts;

  const ctx = canvas.getContext("2d");
  const imagedata = ctx.createImageData(width, height);
  const imgd = imagedata.data;

  canvas.width = width;
  canvas.height = height;

  for (let i = p = 0; i < data.length; i += 1, p += 4) {
    if (data[i] === nodata) continue;

    const c = colorscale.fn(data[i]);

    if (!c) continue;

    imgd[p] = c[0];
    imgd[p+1] = c[1];
    imgd[p+2] = c[2];
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
    idxn = d => d.indexname === type || !d.indexname;

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
 * NOTE: mercator only.
 *
 * @param "coords" int[2]. Coordinates in Longitude/Latitude to be transformed.
 * @param "bounds" int[2][2]. Bounding box containing the raster data.
 * @param "raster" { width int, height int, novalue numeric, array numeric[] }
 *        full description.
 */

function ea_coordinates_in_raster(coords, bounds, raster) {
  if (coords.length !== 2)
    throw Error(`ea_coordinates_raster: expected and array of length 2. Got ${coords}`);

  const hs = d3.scaleLinear().domain([bounds[0][0], bounds[1][0]]).range([0, raster.width]);
  const vs = d3.scaleLinear().domain([bounds[1][1], bounds[2][1]]).range([0, raster.height]);

  const plng = Math.floor(hs(coords[0]));
  const plat = Math.floor(vs(coords[1]));

  let a = null;

  if ((plng > 0 && plng < raster.width &&
       plat > 0 && plat < raster.height )) {
    a = { x: coords[0], y: coords[1] };

    const v = raster.data[(plat * raster.width) + plng];
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
  qs('#cards-pane').style.display = (t === 'inputs') ? '' : 'none';
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
  const url = new URL(location);
  url.searchParams.set('inputs', '');
  url.searchParams.set('output', 'eai');
  url.searchParams.set('view', 'inputs');

  history.replaceState(null, null, url);

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

function ea_current_config() {
  const url = new URL(location);

  const state = ea_state_sync();
  const config = {
    geography_id: url.searchParams.get('id'),
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

function ea_controls_dropdown() {
  const dropdownlist = [];

  if (!Object.keys(this.ds.metadata).every(k => !this.ds.metadata[k])) {
    dropdownlist.push({
      "content": "Dataset info",
      "action": _ => ea_dataset_modal(this.ds)
    });
  }

  if (this.weight_group) {
    dropdownlist.push({
      "content": "Toggle advanced controls",
      "action": _ => {
        if (!this.ds.active) this.ds.toggle();

        qs('.advanced-controls', this).style.display = (this.show_advanced = !this.show_advanced) ? 'block' : 'none';
      }
    });
  }

  dropdownlist.push({
    "content": "Reset default values",
    "action": _ => this.reset_defaults()
  });

  // Enable this later when we are ready to let the users download the
  // original file.
  //
  // if (this.ds.download) {
  //   dropdownlist.push({
  //     "content": "Download dataset file",
  //     "action": _ => fake_download(this.ds.download, null)
  //   });
  // }
  //
  return dropdownlist;
};

function ea_category_filter(d) {
  return d.category.name !== 'boundaries';
};
