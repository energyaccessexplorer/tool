/*
 * ea_state_sync
 *
 * Gather the parameters from the current URL, clean them up, set the defaults
 *
 * returns an Object with the handled params and their set_ methods.
 */

function ea_state_sync() {
  let mode, output, inputs, preset;

  let mode_param = location.get_query_param('mode');
  let output_param = location.get_query_param('output');
  let inputs_param = location.get_query_param('inputs');
  let preset_param = location.get_query_param('preset');

  function set_mode_param(m) {
    history.replaceState(null, null, location.set_query_param('mode', (m || mode)));
  };

  function set_output_param(o) {
    history.replaceState(null, null, location.set_query_param('output', (o || output)));
  };

  function set_inputs_param(i) {
    history.replaceState(null, null, location.set_query_param('inputs', (i || inputs).toString()));
  };

  function set_preset_param(p) {
    document.querySelector('#controls-preset').value = (p || 'custom');
    history.replaceState(null, null, location.set_query_param('preset', (p || 'custom')));
  };

  if (Object.keys(ea_indexes).includes(output_param)) {
    output = output_param;
  } else {
    output = "eai";
    set_output_param();
  }

  if (!inputs_param) {
    inputs = [];
    set_inputs_param();
  } else {
    inputs = inputs_param.split(',');
  }

  if (Object.keys(ea_views).includes(mode_param)) {
    mode = mode_param;
  } else {
    mode = 'outputs';
    set_mode_param();
  }

  if (['market','planning', 'investment', 'custom'].includes(preset_param)) {
    preset = preset_param;
  } else {
    preset = 'custom';
    set_preset_param();
  }

  return {
    mode: mode,
    set_mode_param: set_mode_param,
    output: output,
    set_output_param: set_output_param,
    inputs: inputs,
    set_inputs_param: set_inputs_param,
    preset: preset,
    set_preset_param: set_preset_param,
  };
};

/*
 * ea_canvas_plot
 *
 * Just a shorthand to plotty.plot
 * (see https://github.com/santilland/plotty.git)
 *
 * @param "raster" []numbers
 * @param "canvas" a canvas element (if null, will default to canvas#output)
 * @param "color_scale" string. name of the color scale to draw.
 *
 * returns a plotty object.
 */

function ea_canvas_plot(raster, canvas, color_scale = 'ea') {
  const A = DS.named('boundaries');

  if (!raster.length) {
    console.warn("ea_canvas_plot: no raster given. Filling up with a blank (transparent) one...");
    raster = new Float32Array(A.raster.length).fill(-1);
  };

  if (!canvas) canvas = document.querySelector('canvas#output');

  const plot = new plotty.plot({
    canvas: canvas,
    data: raster,
    width: A.width,
    height: A.height,
    domain: [0,1],
    noDataValue: -1,
    colorScale: color_scale,
  });

  plot.render();

  return plot;
};

/*
 * ea_summary
 *
 * Given the current dataset selection, calculate the population impact through
 * the 'population' dataset on all Indexes. Draw some pie graphs and a modal
 * about it.
 *
 * This is triggered by the "Snapshot" button.
 */

async function ea_summary() {
  const pop = DS.named('population');
  await pop.load('heatmap');
  const p = pop.raster;

  const content = elem(`
<div>
  <div style="text-transform: uppercase; margin: 0 -1.2em 1.2em -1.2em; padding-left: 1.2em; padding-bottom: 1.2em; border-bottom: 1px solid lightgray;">Share of population for each index and category<div>
</div>`);

  const graphs_tab = elem(`<div class="tab"></div>`);
  const graphs = elem(`<div id="graphs"></div>`);
  graphs_tab.appendChild(graphs);

  const sizes = {
    "eai": 100,
    "ani": 100,
    "demand": 50,
    "supply": 50,
  };

  const summary = {};

  const nodata = pop.nodata;

  Object.keys(ea_indexes).forEach(idxn => {
    let raster = ea_analysis(ea_list_filter_type(idxn), idxn);

    var f = d3.scaleQuantize().domain([0,1]).range(ea_default_color_domain);

    let a = new Float32Array(raster.length).fill(-1);

    for (var i = 0; i < raster.length; i++) {
      const r = raster[i];
      a[i] = (r === -1) ? -1 : f(r);
    }

    let groups = [0, 0, 0, 0, 0];

    for (let i = 0; i < a.length; i++) {
      let x = a[i];
      let v = p[i];
      let t = 0;

      if (v == nodata) continue;

      if (x >= 0   && x < 0.2) t = 0;
      else if (x >= 0.2 && x < 0.4) t = 1;
      else if (x >= 0.4 && x < 0.6) t = 2;
      else if (x >= 0.6 && x < 0.8) t = 3;
      else if (x >= 0.8 && x <= 1)  t = 4;

      groups[t] += v;
    }

    let total = groups.reduce((a,b) => a + b, 0);
    let percs = groups.reduce((a,b) => { a.push(b/total); return a; }, []);

    summary[idxn] = groups;

    console.log(idxn, percs, groups);

    if (percs.includes(NaN)) return;

    let pie = ea_svg_pie(percs.map(x => [x]), 75, 0, ea_default_color_stops, null);

    let e = elem(`
<div style="text-align: center; margin: 0 1em; max-width: 150px;">
  <div class="pie-svg-container"></div>
  <div class="indexname">${ea_indexes[idxn]}</div>
</div>`);

    pie.change(0);
    e.querySelector('.pie-svg-container').appendChild(pie.svg);

    graphs.appendChild(e);
  });

  const s = ea_default_color_stops;

  const legend = elem(`
<div class="number-labels">
  <div style="background-color: ${s[0]}">0-20</div>
  <div style="background-color: ${s[1]}">20-40</div>
  <div style="background-color: ${s[2]}">40-60</div>
  <div style="background-color: ${s[3]}">60-80</div>
  <div style="background-color: ${s[4]}">80-100</div>
</div>`);

  const table = elem(`
<table class="summary tab hidden">
<thead>
  <tr class="number-labels-row">
    <th></th>
    <th style="background-color: ${s[0]}">0-20</th>
    <th style="background-color: ${s[1]}">20-40</th>
    <th style="background-color: ${s[2]}">40-60</th>
    <th style="background-color: ${s[3]}">60-80</th>
    <th style="background-color: ${s[4]}">80-100</th>
  </tr>
</thead>

<tbody></tbody>
</table`);

  const tbody = table.querySelector('tbody');

  for (var k of Object.keys(summary)) {
    let tr = document.createElement('tr')

    tr.innerHTML = `
<td class="index-name">${ea_indexes[k]}</td>
<td>${(summary[k][0]).toLocaleString()}</td>
<td>${(summary[k][1]).toLocaleString()}</td>
<td>${(summary[k][2]).toLocaleString()}</td>
<td>${(summary[k][3]).toLocaleString()}</td>
<td>${(summary[k][4]).toLocaleString()}</td>`;

    tbody.appendChild(tr);
  }

  const switcho = elem(`<button class="big-green-button">Summary Table</button>`);
  switcho.addEventListener("click", _ => {
    for (let e of content.querySelectorAll('.tab'))
      e.classList.toggle('hidden');
  });

  content.appendChild(graphs_tab);
  graphs_tab.appendChild(legend);

  content.appendChild(table);
  content.appendChild(switcho);

  ea_modal.set({
    header: "Snapshot",
    content: content,
    footer: null
  }).show();

  return content;
};

/*
 * ea_summary_wrapper
 *
 * A hack. For javascript reasons, ea_ui_app_loading does not get executed in a
 * blocking manner.
 */

function ea_summary_wrapper() {
  const prom = new Promise((resolve, rej) => {
    ea_ui_app_loading(true);
    setTimeout(_ => resolve("Success!"), 100);
  });

  prom
    .then(ea_summary)
    .then(_ => ea_ui_app_loading(false));
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

  return DS.list.filter(d => d.active && idxn(d));
};

/*
 * ea_plot_active_analysis
 *
 * Utility.
 *
 * @param "type" string. ID or indexname.
 * @param "cs" string. Default color_scale to 'ea'.
 */

function ea_plot_active_analysis(type, cs = 'ea') {
  const list = ea_list_filter_type(type);

  const raster = ea_analysis(list, type);
  ea_canvas_plot(raster);

  // 'animate' is set to false on mapbox's configuration, since we don't want
  // mapbox eating the CPU at 60FPS for nothing.
  //
  // TODO: remove this hack. find a better way to redraw the canvas. as of v0.50
  // there doesn't seem to be a good way to do this... mapboxgl should return
  // promises. It doesn't.
  //
  let canvas_source = ea_mapbox.getSource('canvas-source');
  if (canvas_source) {
    canvas_source.raster = raster;
    canvas_source.play();
    setTimeout(_ => {
      canvas_source.pause();
    }, 1000);
  }
};

/*
 * ea_coordinates_in_raster
 *
 * Transform a set of coordinates to the "relative position" inside a raster
 * that is bound to an area
 *
 * @param "coords" int[2]. Coordinates in Longitude/Latitude to be transformed.
 * @param "bounds" int[2][2]. Bounding box containing the raster data.
 * @param "raster" { width int, height int, novalue numeric, array numeric[] }
 *        full description.
 */

function ea_coordinates_raster(coords, bounds, raster) {
  if (coords.length !== 2)
    throw Error(`ea_coordinates_raster: expected and array of length 2. Got ${coords}`);

  const cw = bounds[1][0] - bounds[0][0];
  const ch = bounds[1][1] - bounds[2][1];

  let x = (coords[0] - bounds[0][0]);
  let y = (bounds[0][1] - coords[1]); // yes, right that is.

  a = null;

  if ((x > 0 && x < cw &&
       y > 0 && y < ch ))
  {
    a = {
      x: Math.floor((x * raster.width) / cw),
      y: Math.floor((y * raster.height) / ch)
    }

    let v = raster.array[(a.y * raster.width) + a.x];

    a.value = v === raster.nodata ? null : v;
  }

  return a;
};

function ea_pointer(dict, prop, event) {
  const t = document.createElement('table');
  dict.forEach(e => t.appendChild(elem(`<td>${e.target}</td><td>${prop[e.dataset]}</td>`, 'tr')));

  mapbox_pointer(t, event.originalEvent.pageX, event.originalEvent.pageY)
};
