function ea_opacity_tweak() {
  const dl = location.get_query_param('inputs').split(',');

  const tweak = (dl.length === 1 && (dl[0] === 'boundaries'));

  ea_mapbox ?
    ea_mapbox.setPaintProperty('canvas-layer', 'raster-opacity', (tweak ? 0.2 : 1)) :
    (ea_canvas ? ea_canvas.style.opacity = (tweak ? 0.2 : 1) : null)
};

function ea_canvas_plot(ds) {
  if (!ds) return;

  ea_current_analysis = ds;

  const plot = new plotty.plot({
    canvas: ea_canvas,
    data: ds.raster,
    width: ds.width,
    height: ds.height,
    domain: ds.domain,
    noDataValue: ds.nodata,
    colorScale: ds.color_scale,
  });

  plot.render();

  return plot;
};

/*
 * An analysis is really a new dataset "ds" consisting of a selection of
 * weighed datasets.
 */

function ea_analysis(type) {
  const t0 = performance.now();

  const collection = ea_active_heatmaps(type);

  // we use a dataset as a template just for code-clarity.
  //
  const tmp = ea_dummy;

  if (!tmp.raster) {
    console.warn("No raster template. Return.");
    return null;
  }

  let cs = ea_default_color_scale;

  let single_input = DS.named(type);

  if (single_input) {
    cs = single_input.heatmap.color_scale;

    if (single_input.configuration && single_input.configuration.mutant)
      cs = DS.named(single_input.configuration.host).heatmap.color_scale;
  }

  const ds = {
    id: `analysis-${Date.now()}`,
    domain: [0,1],
    width: tmp.width,
    height: tmp.height,
    raster: new Float32Array(tmp.raster.length),
    nodata: -1,
    color_scale: cs,
  };

  if (!collection.length) return tmp;

  const scales = collection.map(d => ea_datasets_scale_fn(d, type));

  const full_weight = collection
        .reduce((a,c,k) => ((c.heatmap.scale === "key-delta") ? a : c.weight + a), 0);

  let min = 1;
  let max = 0;

  for (var i = 0; i < ds.raster.length; i++) {
    const t = collection.reduce((a, c, k, l) => {
      // On this reduce loop, we 'annihilate' points that come as -1
      // (or nodata) since we wouldn't know what value to assign for
      // the analysis. We assume they have been clipped out.
      //
      if (a === -1) return -1;

      const v = c.raster[i];
      if (v === c.nodata) return -1;

      // If the scaling function clamped, the following wont
      // happen. But if there the values are outside our analysis
      // domain, we assume clipping by setting -1 (nodata).
      //
      const sv = scales[k](v);
      if (sv < 0 || sv > 1) return -1;

      if (c.heatmap.scale === "key-delta")
        return a;
      else
        return (sv * c.weight) + a;
    }, 0);

    const r = (t === -1) ? t : t / full_weight;

    if (r !== -1) {
      if (r > max) max = r;
      if (r < min) min = r;
    }

    ds.raster[i] = r;
  }

  var f = d3.scaleQuantize().domain([min,max]).range([0, 0.25, 0.5, 0.75, 1]);

  for (var i = 0; i < ds.raster.length; i++) {
    const r = ds.raster[i];
    ds.raster[i] = (r === -1) ? -1 : f(r);
  }

  console.log("Finished ea_analysis in:", performance.now() - t0);

  return ds;
};

function ea_active_heatmaps(type) {
  let cat;

  if (['supply', 'demand'].indexOf(type) > -1)
    cat = d => d.category === type;

  else if (['eai', 'ani'].indexOf(type) > -1)
    cat = d => true;

  else
    cat = d => d.id === type;

  return DS.list.filter(d => d.active && cat(d));
};

function ea_draw_first_active_nopolygons(list) {
  let rd = null;

  for (let t of list.slice(0)) {
    let x = DS.list.find(d => d.id === t && !d.polygons && !d.collection);
    if (x) { rd = x; break; }
  }

  if (rd) ea_canvas_plot(ea_analysis(rd.id));
  else ea_canvas_plot(ea_analysis(ea_dummy));
};

async function ea_overlord(msg) {
  if (!msg) throw "Argument Error: Overlord: I have nothing to do!";
  if (typeof msg.caller === 'undefined' || !msg.caller) throw "Argument Error: Overlord: Who is the caller?";

  let mode;
  let output;
  let inputs;
  let preset;

  let mode_param = location.get_query_param('mode');
  let output_param = location.get_query_param('output');
  let inputs_param = location.get_query_param('inputs');
  let preset_param = location.get_query_param('preset');

  let canvas_source;

  function set_mode_param(m) {
    history.replaceState(null, null, location.set_query_param('mode', (m || mode)));
  }

  function set_output_param(o) {
    history.replaceState(null, null, location.set_query_param('output', (o || output)));
  };

  function set_inputs_param(i) {
    history.replaceState(null, null, location.set_query_param('inputs', (i || inputs).toString()));
  };

  function set_preset_param(p) {
    document.querySelector('#controls-preset').value = (p || 'custom');
    history.replaceState(null, null, location.set_query_param('preset', (p || 'custom')));
  }

  if (Object.keys(ea_indexes).indexOf(output_param) > -1) {
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

  if (ea_views.indexOf(mode_param) > -1) {
    mode = mode_param;
  } else {
    mode = 'outputs';
    set_mode_param();
  }

  if (['market','planning', 'investment', 'custom'].indexOf(preset_param) > -1) {
    preset = preset_param;
  } else {
    preset = 'custom';
    set_preset_param();
  }

  switch (msg.type) {
  case "init": {
    /* TODO: these are the global objects. Fix it: remove. */

    ea_ccn3 = location.get_query_param('ccn3');
    ea_map = null;
    ea_mapbox = null;
    ea_dummy = null;
    ea_canvas = null;

    let country; await ea_client(`${ea_settings.database}/countries?ccn3=eq.${ea_ccn3}`, 'GET', 1, r => country = r);
    const collection = await ea_datasets_init(country.id, inputs, preset);

    const boundaries_ds = collection.find(d => d.id === 'boundaries');

    if (!boundaries_ds) {
      flash()
        .type('error')
        .title("Misconfigured country")
        .message(`
It's missing a boundaries dataset. <b>I'm stoping here.</b>
Please reporty this to energyaccessexplorer@wri.org.
`)();

      return;
    }

    {
      ea_dummy = {
        id: "dummy",
        description: "Dummy dataset",

        heatmap: {
          endpoint: boundaries_ds.heatmap.endpoint,
          parse: ea_datasets_tiff_url,
        },
      };

      (async _ => {
        await ea_dummy.heatmap.parse.call(ea_dummy);
        ea_dummy.raster = new Uint16Array(ea_dummy.width * ea_dummy.height).fill(-1);
      })();
    }

    inputs = collection
      .filter(t => t.active)
      .map(x => x.id)
      .sort((a,b) => (inputs.indexOf(a) < inputs.indexOf(b)) ? -1 : 1);

    set_inputs_param();

    ea_presets_init(preset);
    ea_views_init();
    ea_layers_init();

    ea_controls_tree(country.category_tree, DS.list);

    ea_layout_map(country.bounds);
    ea_map_setup(country.bounds);

    // STRANGE: force the canvas to 2d...
    //
    ea_canvas.getContext('2d');

    (async _ => {
      for (var id of inputs) {
        let ds = DS.named(id);
        if (ds) await ds.load('heatmap', 'polygons', 'csv');
      }

      ea_overlord({
        type: "mode",
        target: mode,
        caller: "ea_init",
        callback: _ => {
          ea_overlord({
            type: "sort",
            target: mode,
            layers: inputs,
            caller: "ea_init callback",
          });
        }
      });

      ea_ui_app_loading(false);
    })();

    break;
  }

  case "mode": {
    let t = msg.target;

    set_mode_param(t);

    if (t === "outputs") {
      ea_layers_outputs(output);

      inputs.forEach(i => {
        let x; if (x = DS.named(i)) x.hide();
      });

      ea_opacity_tweak(inputs);

      ea_canvas_plot(ea_analysis(output));
    }

    else if (t === "inputs") {
      ea_layers_inputs(inputs);

      for (let i of inputs) {
        let x;
        if (x = DS.named(i)) {
          await x.turn(true, true);
        }
      }

      ea_draw_first_active_nopolygons(inputs);

      ea_layers_sort_inputs(inputs);
    }

    else {
      throw `Argument Error: Overlord: Could not set/find the mode '${mode}'.`;
    }

    break;
  }

  case "input": {
    const ds = msg.target;

    set_preset_param(null);

    ds.active ?
      inputs.unshift(ds.id) :
      inputs.splice(inputs.indexOf(ds.id), 1); // REMOVE()

    inputs = [...new Set(inputs)]; // UNIQUE()

    if (mode === "outputs") {
      ea_layers_outputs(output);
      await ds.turn(ds.active, false);
      ea_canvas_plot(ea_analysis(output));
    }

    else if (mode === "inputs") {
      ea_layers_inputs(inputs);
      await ds.turn(ds.active, true);
      ea_draw_first_active_nopolygons(inputs);
    }

    else {
      throw `Argument Error: Overlord: Could not set the mode ${mode}`;
    }

    set_output_param();

    set_inputs_param();

    ea_opacity_tweak(inputs);

    break;
  }

  case "output": {
    if (mode === "outputs") {
      ea_canvas_plot(ea_analysis(msg.heatmap));
      set_output_param(msg.heatmap);
    }

    else {
      throw `Argument Error: Overlord: Could set the mode ${mode}`;
    }

    break;
  }

  case "preset": {
    set_preset_param(msg.value);

    if (!msg.value) return;

    if (mode === "outputs") {
      ea_layers_outputs(output);

      for (let ds of DS.list) {
        ea_presets_set(ds, msg.value);
        await ds.load('heatmap', 'polygons');
      }

      ea_canvas_plot(ea_analysis(output));
    }

    else if (mode === "inputs") {
      for (let ds of DS.list) {
        let r = ea_presets_set(ds, msg.value);
        if (r) ds.show(); else ds.hide();
      };
    }

    inputs = DS.list.filter(t => t.active).map(x => x.id)

    ea_layers_inputs(inputs);
    set_inputs_param(inputs);

    break;
  }

  case "sort": {
    if (mode === "inputs") {
      ea_layers_sort_inputs(msg.layers);
      set_inputs_param(msg.layers);
      ea_draw_first_active_nopolygons(msg.layers);
    }

    else if (mode === "outputs") {
      console.info("Overlord: Sorting in outputs mode has no efect... OK.");
    }

    else {
      throw `Argument Error: Overlord: Could set the mode ${mode}`;
    }

    break;
  }

  default:
    throw `Overlord: I don't know message type '${msg.type}'`
  }

  canvas_source = ea_mapbox.getSource('canvas-source');

  // 'animate' is set to false on mapbox's configuration, since we don't want
  // mapbox eating the CPU at 60FPS for nothing.
  //
  // TODO: remove this hack. find a better way to redraw the canvas. as of v0.50
  // there doesn't seem to be a good way to do this...
  //
  if (canvas_source) {
    canvas_source.play();
    setTimeout(_ => canvas_source.pause, 300);
  }

  if (typeof msg.callback === 'function') msg.callback();
};

function ea_summary() {
  const summary = {};

  for (var k of Object.keys(ea_indexes)) {
    let a = ea_analysis(k);

    summary[k] = {
      "low":      a.raster.filter(x => x >= 0   && x < 0.2).length,
      "low-med":  a.raster.filter(x => x >= 0.2 && x < 0.4).length,
      "med":      a.raster.filter(x => x >= 0.4 && x < 0.6).length,
      "med-high": a.raster.filter(x => x >= 0.6 && x < 0.8).length,
      "high":     a.raster.filter(x => x >= 0.8 && x <= 1).length,
    };
  }

  const table = elem(`
<table class="summary">
<thead>
  <tr><th></th> <th>0-20</th> <th>20-40</th> <th>40-60</th> <th>60-80</th> <th>80-100</th></tr>
</thead>

<tbody></tbody>
</table`);

  const tbody = table.querySelector('tbody');

  for (var k of Object.keys(summary)) {
    let tr = document.createElement('tr')

    tr.innerHTML = `
<td class="index-name">${ea_indexes[k]}</td>
<td>${summary[k]['low']}</td>
<td>${summary[k]['low-med']}</td>
<td>${summary[k]['med']}</td>
<td>${summary[k]['med-high']}</td>
<td>${summary[k]['high']}</td>
`;

    tbody.appendChild(tr);
  }

  modal()
    .header('Index Summaries')
    .content(table)();

  return summary;
};
