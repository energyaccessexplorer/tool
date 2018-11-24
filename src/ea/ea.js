function ea_canvas_plot(A, c = ea_canvas) {
  if (!(A.id && A.raster)) throw `${A.id} is not a A! Bye.`;

  ea_current_analysis = A;

  const plot = new plotty.plot({
    canvas: c,
    data: A.raster,
    width: A.width,
    height: A.height,
    domain: A.domain,
    noDataValue: A.nodata,
    colorScale: A.color_scale,
  });

  plot.render();

  return plot;
};

function ea_analysis(type) {
  const t0 = performance.now();

  const collection = (function(t) {
    let idxn;

    if (['supply', 'demand'].indexOf(t) > -1)
      idxn = d => d.indexname === t;

    else if (['eai', 'ani'].indexOf(t) > -1)
      idxn = d => true;

    else
      idxn = d => d.id === t;

    return DS.list.filter(d => d.active && idxn(d));
  }).call(null, type);

  // we use a dataset as a template just for code-clarity.
  //
  const tmp = DS.named('boundaries');

  let cs = ea_default_color_scale;

  let single_input = DS.named(type);

  if (single_input) {
    cs = single_input.heatmap.color_scale;

    if (single_input.configuration && single_input.configuration.mutant)
      cs = DS.named(single_input.configuration.host).heatmap.color_scale;
  }

  const A = {
    id: `analysis-${Date.now()}`,
    domain: [0,1],
    width: tmp.width,
    height: tmp.height,
    raster: new Float32Array(tmp.raster.length).fill(-1),
    nodata: -1,
    color_scale: cs,
  };

  if (!collection.length) return A;

  const scales = collection.map(d => ea_datasets_scale_fn(d, type));

  const full_weight = collection
        .reduce((a,c) => ((c.heatmap.scale === "key-delta") ? a : c.weight + a), 0);

  let min = 1;
  let max = 0;

  // NOTICE: if there is only one dataset which has no weight in calculations
  // (boundaries with key-delta scale function, for example), we do NOT want an
  // fully black raster to show as the result. We return the transparent one "A"
  // instead.
  //
  if (collection.length === 1 && full_weight === 0) return A;

  for (var i = 0; i < A.raster.length; i++) {
    let a = 0;

    for (let j = 0; j < collection.length; j++) {
      let c = collection[j];

      // For the rest of the datasets, we 'annihilate' points that are already
      // as -1 (or nodata) since we wouldn't know what value to assign for the
      // analysis. In other words, if a dataset has a point has nodata, that
      // point is useless for the analysis as it is incomparable with other
      // datasets.
      //
      // We assume they have been clipped out.
      //
      if (a === -1) continue;

      const v = c.raster[i];
      if (v === c.nodata) {
        a = -1; continue;
      }

      const sv = scales[j](v);

      // Three options: within domain/range, clipping or clamping. This is where
      // the clipping happens. The clamping was done by the scaling function
      // above.
      //
      // If the scaling function clamped, the following will not happen. But if
      // the value falls outside our analysis domain, we clip it (-1 nodata).
      //
      if (sv < 0 || sv > 1) {
        a = -1; continue;
      }

      a = (sv * c.weight) + a;
    }

    const r = (a === -1) ? a : a / full_weight;

    if (r !== -1) {
      if (r > max) max = r;
      if (r < min) min = r;
    }

    A.raster[i] = r;
  }

  var f = d3.scaleQuantize().domain([min,max]).range([0, 0.25, 0.5, 0.75, 1]);

  for (var i = 0; i < A.raster.length; i++) {
    const r = A.raster[i];
    A.raster[i] = (r === -1) ? -1 : f(r);
  }

  console.log("Finished ea_analysis in:", performance.now() - t0);

  return A;
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
    ea_canvas = null;
    ea_category_tree = null;

    let country; await ea_client(`${ea_settings.database}/countries?ccn3=eq.${ea_ccn3}`, 'GET', 1, r => country = r);

    ea_category_tree = country.category_tree;
    const collection = await ea_datasets_init(country.id, inputs, preset);

    const b = collection.find(d => d.id === 'boundaries');

    if (!b) {
      flash()
        .type('error')
        .title("Misconfigured country")
        .message(`
It's missing a boundaries dataset. <b>I'm stoping here.</b>
Please reporty this to energyaccessexplorer@wri.org.
`)();

      throw `Country is missing a boundaries dataset.`;
    }

    else {
      await b.heatmap.parse.call(b);
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

    await (async _ => {
      for (var id of inputs) {
        let ds = DS.named(id);
        if (ds) await ds.turn(true, false);
      }

      ea_ui_app_loading(false);
    })();

    mapbox_change_theme(ea_settings.mapbox_theme);

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

      ea_canvas_plot(ea_analysis(output));

      ea_mapbox.setLayoutProperty('canvas-layer', 'visibility', 'visible');
    }

    else if (t === "inputs") {
      ea_mapbox.setLayoutProperty('canvas-layer', 'visibility', 'none');

      ea_layers_inputs(inputs);

      for (let i of inputs) {
        let x;
        if (x = DS.named(i)) {
          await x.turn(true, true);
        }
      }

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
      await ds.turn(ds.active, false);

      ea_layers_outputs(output);
      ea_canvas_plot(ea_analysis(output));
    }

    else if (mode === "inputs") {
      await ds.turn(ds.active, true);

      ea_layers_inputs(inputs);

      ds.raise()
    }

    else {
      throw `Argument Error: Overlord: Could not set the mode ${mode}`;
    }

    set_output_param();

    set_inputs_param();

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
    if (!msg.value) throw `Argument error: Overlord: Could not set ${msg.value} preset`;

    if (mode === "outputs") {
      ea_layers_outputs(output);

      for (let ds of DS.list) {
        ea_presets_set(ds, msg.value);
        await ds.load();
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
    }

    else if (mode === "outputs") {
      console.info("Overlord: Sorting in outputs mode has no efect... OK.");
    }

    else {
      throw `Argument Error: Overlord: Could set the mode ${mode}`;
    }

    break;
  }

  case "refresh": {
    ea_overlord({
      "type": "mode",
      "target": mode,
      "caller": "ea_overlord resort"
    });

    break;
  }

  default:
    throw `Overlord: I don't know message type '${msg.type}'`
  }

  // 'animate' is set to false on mapbox's configuration, since we don't want
  // mapbox eating the CPU at 60FPS for nothing.
  //
  // TODO: remove this hack. find a better way to redraw the canvas. as of v0.50
  // there doesn't seem to be a good way to do this... mapboxgl should return
  // promises. It doesn't.
  //
  let canvas_source = ea_mapbox.getSource('canvas-source');
  if (canvas_source) {
    canvas_source.play();
    setTimeout(_ => {
      canvas_source.pause();
    }, 1000);
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
