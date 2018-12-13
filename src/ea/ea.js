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

  const tots = collection
        .reduce((a,d) => {
          a[d.indexname] += d.weight;
          a[d.id] = d.indexname;
          return a;
        }, { "supply": 0, "demand": 0 });

  const weights = {};

  collection.forEach(d => weights[d.id] = d.weight / (tots[d.indexname] * 2));

  const scales = collection.map(d => ea_datasets_scale_fn(d, type));

  let min = 1;
  let max = 0;

  // NOTICE: if there is only one dataset which has no weight in calculations
  // (boundaries with key-delta scale function, for example), we do NOT want an
  // fully black raster to show as the result. We return the transparent one "A"
  // instead.
  //
  const full_weight = collection
        .reduce((a,c) => ((c.heatmap.scale === "key-delta") ? a : c.weight + a), 0);

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

      a = (sv * weights[c.id]) + a;
    }

    if (a !== -1) {
      if (a > max) max = a;
      if (a < min) min = a;
    }

    A.raster[i] = a;
  }

  var f = d3.scaleQuantize().domain([min,max]).range([0, 0.25, 0.5, 0.75, 1]);

  for (var i = 0; i < A.raster.length; i++) {
    const r = A.raster[i];
    A.raster[i] = (r === -1) ? -1 : f(r);
  }

  console.log("Finished ea_analysis in:", performance.now() - t0, weights, tots);

  return A;
};

async function ea_overlord(msg) {
  if (!msg) throw "Argument Error: Overlord: I have nothing to do!";
  if (typeof msg.caller === 'undefined' || !msg.caller) throw "Argument Error: Overlord: Who is the caller?";

  let output_canvas = document.querySelector('canvas#output');

  const state = ea_state_sync();

  switch (msg.type) {
  case "init": {
    document.body.append(output_canvas = elem('<canvas id="output" style="display: none;">'));

    const ccn3 = location.get_query_param('ccn3');
    let country; await ea_client(`${ea_settings.database}/countries?ccn3=eq.${ccn3}`, 'GET', 1, r => country = r);

    /* TODO: these are the global objects. Fix it: remove. */
    ea_mapbox = null;
    ea_category_tree = country.category_tree;

    const collection = await ea_datasets_init(country.id, state.inputs, state.preset);

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

      document.querySelector('#controls-wrapper')
        .insertBefore(ea_controls(b), document.querySelector('#controls'));
    }

    const inputs = collection
      .filter(t => t.active)
      .map(x => x.id)
      .sort((a,b) => (state.inputs.indexOf(a) < state.inputs.indexOf(b)) ? -1 : 1);

    state.set_inputs_param(inputs);

    ea_presets_init(state.preset);
    ea_views_init();
    ea_layers_init();

    ea_controls_tree(country.category_tree, DS.list);

    ea_layout_map(country.bounds);
    ea_map_setup(country.bounds);

    await Promise.all(inputs.map(id => DS.named(id).turn(true, false)));

    mapbox_change_theme(ea_settings.mapbox_theme);

    ea_ui_app_loading(false);

    break;
  }

  case "mode": {
    let t = msg.target;

    state.set_mode_param(t);

    if (t === "outputs") {
      ea_layers_outputs(state.output);

      state.inputs.forEach(i => {
        let x; if (x = DS.named(i)) x.hide();
      });

      ea_canvas_plot(ea_analysis(state.output), output_canvas);

      ea_mapbox.setLayoutProperty('canvas-layer', 'visibility', 'visible');
    }

    else if (t === "inputs") {
      ea_mapbox.setLayoutProperty('canvas-layer', 'visibility', 'none');

      ea_layers_inputs(state.inputs);

      await Promise.all(state.inputs.map(id => DS.named(id).turn(true, true)));

      ea_layers_sort_inputs(state.inputs);
    }

    else {
      throw `Argument Error: Overlord: Could not set/find the mode '${state.mode}'.`;
    }

    break;
  }

  case "input": {
    const ds = msg.target;

    state.set_preset_param(null);

    ds.active ?
      state.inputs.unshift(ds.id) :
      state.inputs.splice(state.inputs.indexOf(ds.id), 1); // REMOVE()

    const inputs = [...new Set(state.inputs)]; // UNIQUE()

    if (state.mode === "outputs") {
      await ds.turn(ds.active, false);

      ea_layers_outputs(state.output);
      ea_canvas_plot(ea_analysis(state.output), output_canvas);
    }

    else if (state.mode === "inputs") {
      await ds.turn(ds.active, true);

      ea_layers_inputs(inputs);
      ds.raise();
    }

    else {
      throw `Argument Error: Overlord: Could not set the mode ${state.mode}`;
    }

    state.set_output_param();
    state.set_inputs_param();

    break;
  }

  case "output": {
    if (state.mode === "outputs") {
      ea_canvas_plot(ea_analysis(msg.heatmap), output_canvas);
      state.set_output_param(msg.heatmap);
    }

    else {
      throw `Argument Error: Overlord: Could set the mode ${state.mode}`;
    }

    break;
  }

  case "preset": {
    if (!msg.value) throw `Argument error: Overlord: Could not set ${msg.value} preset`;

    const inputs = DS.list.filter(d => ea_presets_set(d, msg.value)).map(d => d.id);

    if (state.mode === "outputs") {
      ea_layers_outputs(state.output);
      await Promise.all(DS.list.map(d => d.turn(d.active, false)));
      ea_canvas_plot(ea_analysis(state.output), output_canvas);
    }

    else if (state.mode === "inputs") {
      await Promise.all(DS.list.map(d => d.turn(d.active, true)));
      ea_layers_inputs(inputs);
    }

    state.set_inputs_param(inputs);

    break;
  }

  case "sort": {
    if (state.mode === "inputs") {
      ea_layers_sort_inputs(msg.layers);
      state.set_inputs_param(msg.layers);
    }

    else if (state.mode === "outputs") {
      console.info("Overlord: Sorting in outputs mode has no efect... OK.");
    }

    else {
      throw `Argument Error: Overlord: Could set the mode ${state.mode}`;
    }

    break;
  }

  case "refresh": {
    ea_overlord({
      "type": "mode",
      "target": state.mode,
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
