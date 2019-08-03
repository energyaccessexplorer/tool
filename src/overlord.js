/*
 * ea_overlord
 *
 * Connects the entire app, changes states and updates components accordingly.
 *
 * Any communication between the app's components:
 *   - controls
 *   - inputs
 *   - map
 *   - datasets
 *   ... etc. should be done via this function.
 *
 * @param "msg" object.
 *
 *   type (required)
 *      init: init the app. doh!
 *      view: set the entire app between {outputs, inputs} views
 *      dataset: change params or (de)activate a DS
 *      index: change the currently shown index
 *      preset: change the preset
 *      sort: sort the selected datasets (inputs)
 *      refresh: a auxiliary to re-set the view
 *      map: handle user-map interactions
 *
 *      Each type might (and will) do different things depending on the
 *      current view.
 *
 *   target
 *      Is context specific to the type. They are obvious:
 *
 *      init: null
 *      view: "inputs" or "outputs"
 *      dataset: a DS object
 *      index: "demand", "supply", "eai" or "ani"
 *      preset: "market", "planning", "investment", or "custom"
 *      sort: an array with the ID's of the active datasets
 *      refresh: "inputs" or "outputs"
 *      map: "click"
 *
 *   caller (required)
 *      The name of the function calling ea_overlord. Useful for debugging
 *      and behavioural decisions based on it.
 * }
 *
 * returns nothing
 */

async function ea_overlord(msg) {
  if (!msg) throw "Argument Error: Overlord: I have nothing to do!";
  if (typeof msg.caller === 'undefined' || !msg.caller) throw "Argument Error: Overlord: Who is the caller?";

  const state = ea_state_sync();

  switch (msg.type) {
  case "init": {
    const id = location.get_query_param('id');

    ea_layout_init();

    GEOGRAPHY = (await fetch(`${ea_settings.database}/geographies?id=eq.${id}`).then(r => r.json()))[0];
    MAPBOX = mapbox_setup();

    await ea_datasets_init(GEOGRAPHY.id, state.inputs, state.preset, bounds => {
      mapbox_fit(bounds);
      mapbox_change_theme(ea_settings.mapbox_theme);
    });

    const a = DS.all
          .map(d => {
            // dsinput and dscontrols might have already been created by items_init
            //
            d.input_el = d.input_el || new dsinput(d);
            d.controls_el = d.controls_el || new dscontrols(d);
            return d;
          })
          .filter(d => d.active)
          .map(d => d.id)
          .sort((x,y) => (state.inputs.indexOf(x) < state.inputs.indexOf(y)) ? -1 : 1);

    state.set_inputs_param(a);

    ea_views_init();
    ea_inputs_init();
    ea_indexes_init(state);
    ea_controls_init(state);
    ea_nanny_init(state);

    ea_loading(false);

    break;
  }

  case "view": {
    let t = msg.target;

    state.set_view_param(t);

    await Promise.all(state.inputs.map(id => DS.get(id).turn(true, (t === 'inputs'))));

    if (t === "outputs") {
      ea_indexes_list(state);

      ea_plot_active_analysis(state.output)
        .then(raster => ea_indexes_graphs(raster))
        .then(_ => MAPBOX.setLayoutProperty('output-layer', 'visibility', 'visible'));
    }

    else if (t === "inputs") {
      if (MAPBOX.getLayer('output-layer'))
        MAPBOX.setLayoutProperty('output-layer', 'visibility', 'none');

      ea_inputs(state.inputs);

      ea_inputs_sort(state.inputs);
    }

    else {
      throw `Argument Error: Overlord: Could not set/find the view '${state.view}'.`;
    }

    right_pane(t);

    break;
  }

  case "dataset": {
    const ds = msg.target;

    const resort = !["ea_controls_range", "ea_controls_weight"].includes(msg.caller);

    state.set_preset_param(null);

    ds.active ?
      (resort && state.inputs.unshift(ds.id)) :
      state.inputs.splice(state.inputs.indexOf(ds.id), 1); // REMOVE()

    const inputs = [...new Set(state.inputs)]; // UNIQUE()

    if (state.view === "outputs") {
      await ds.turn(ds.active, false);

      ea_indexes_list(state);
      ea_plot_active_analysis(state.output).then(raster => ea_indexes_graphs(raster));
    }

    else if (state.view === "inputs") {
      await ds.turn(ds.active, true);

      ea_inputs(inputs);

      if (resort) ds.raise();

      ea_plot_active_analysis(state.output);
    }

    else {
      throw `Argument Error: Overlord: Could not set the view ${state.view}`;
    }

    state.set_output_param();
    state.set_inputs_param(inputs);

    break;
  }

  case "index": {
    state.set_output_param(msg.target);
    ea_plot_active_analysis(msg.target).then(raster => ea_indexes_graphs(raster));

    break;
  }

  case "preset": {
    if (!msg.target) throw `Argument error: Overlord: Could not set ${msg.target} preset`;

    const inputs = DS.all.filter(d => ea_controls_presets_set(d, msg.target)).map(d => d.id);

    if (state.view === "outputs") {
      ea_indexes_list(state);
      await Promise.all(DS.all.map(d => d.turn(d.active, false)));
      ea_plot_active_analysis(state.output);
    }

    else if (state.view === "inputs") {
      await Promise.all(DS.all.map(d => d.turn(d.active, true)));
      ea_inputs(inputs);
    }

    state.set_preset_param(msg.target);
    state.set_inputs_param(inputs);

    break;
  }

  case "sort": {
    if (state.view === "inputs") {
      ea_inputs_sort(msg.target);
      state.set_inputs_param(msg.target);
    }

    else if (state.view === "outputs") {
      log("Overlord: Sorting in outputs view has no efect... OK.");
    }

    else {
      throw `Argument Error: Overlord: Could set the view ${state.view}`;
    }

    break;
  }

  case "refresh": {
    ea_overlord({
      "type": "view",
      "target": state.view,
      "caller": "ea_overlord refresh"
    });

    break;
  }

  case "map": {
    if (msg.target === "click") {
      const e = msg.event;

      const b = DS.get('boundaries');
      let nodata = b.raster.nodata;

      let t;

      if (state.view === "outputs") {
        t = {
          raster: {
            data: MAPBOX.getSource('output-source').raster
          },
          category: {},
          name: "Analysis"
        };
        nodata = -1;
      }

      else {
        const i = state.inputs[0];
        t = DS.get(i);

        if (!t) return;

        if (t.features) {
          const et = MAPBOX.queryRenderedFeatures(e.point)[0];
          if (!et) return;

          log("Feature Properties:", et.properties);

          if (et.source === i) {
            let at;

            if (!(at = t.config.features_attr_map)) {
              warn("Dataset is not configured to display info. (configuration.features_attr_map)");
              return;
            }

            if (at) table_pointer(at, et.properties, e);
          }

          return;
        }
        else if (t.data) {
          // go on... next part applies to outputs.
        }
      }

      const rc = ea_coordinates_in_raster(
        [e.lngLat.lng, e.lngLat.lat],
        MAPBOX.coords,
        {
          data: t.raster.data || t.data,
          width: b.raster.width,
          height: b.raster.height,
          nodata: nodata
        }
      );

      if (rc && rc.value !== null) {
        v = rc.value;

        if (t.heatmap) v = v * t.heatmap.factor;

        table_pointer([{
          "target": t.name,
          "dataset": "value"
        }], {
          "value": `${v.toFixed(2)} <code>${t.category.unit || ''}</code>`
        }, e);
      }
      else {
        log("No value on raster.", rc);
      }

      break;
    }
  }

  default:
    throw `Overlord: I don't know message type '${msg.type}'`
  }

  if (typeof msg.callback === 'function') msg.callback();
};

/*
 * ea_state_sync
 *
 * Gather the parameters from the current URL, clean them up, set the defaults
 *
 * returns an Object with the handled params and their set_ methods.
 */

function ea_state_sync() {
  let view, output, inputs, preset;

  let view_param = location.get_query_param('view');
  let output_param = location.get_query_param('output');
  let inputs_param = location.get_query_param('inputs');
  let preset_param = location.get_query_param('preset');

  function set_view_param(m) {
    history.replaceState(null, null, location.set_query_param('view', (m || view)));
  };

  function set_output_param(o) {
    history.replaceState(null, null, location.set_query_param('output', (o || output)));
  };

  function set_inputs_param(i) {
    history.replaceState(null, null, location.set_query_param('inputs', (i || inputs).toString()));
  };

  function set_preset_param(p) {
    qs('#controls-preset').value = (p || 'custom');
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

  if (Object.keys(ea_views).includes(view_param)) {
    view = view_param;
  } else {
    view = 'outputs';
    set_view_param();
  }

  if (['market','planning', 'investment', 'custom'].includes(preset_param)) {
    preset = preset_param;
  } else {
    preset = 'custom';
    set_preset_param();
  }

  return {
    view: view,
    set_view_param: set_view_param,
    output: output,
    set_output_param: set_output_param,
    inputs: inputs,
    set_inputs_param: set_inputs_param,
    preset: preset,
    set_preset_param: set_preset_param,
  };
};
