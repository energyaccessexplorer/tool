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
  case 'init': {
    ea_overlord_init(state);
    break;
  }

  case 'view': {
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

    window.dispatchEvent(new Event('resize'));

    break;
  }

  case 'dataset': {
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

  case 'index': {
    state.set_output_param(msg.target);
    ea_plot_active_analysis(msg.target).then(raster => ea_indexes_graphs(raster));

    break;
  }

  case 'preset': {
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

  case 'sort': {
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

  case 'refresh': {
    if (!MAPBOX.getSource('output-source')) {
      MAPBOX.addSource('output-source', {
        "type": 'canvas',
        "canvas": 'output',
        "animate": false,
        "coordinates": MAPBOX.coords
      });
    }

    if (!MAPBOX.getLayer('output-layer')) {
      MAPBOX.addLayer({
        "id": 'output-layer',
        "source": 'output-source',
        "type": 'raster',
        "layout": {
          "visibility": "none",
        },
        "paint": {
          "raster-resampling": "nearest",
        }
      }, MAPBOX.first_symbol);
    }

    ea_overlord({
      "type": "view",
      "target": state.view,
      "caller": "ea_overlord refresh"
    });

    break;
  }

  case 'map': {
    if (msg.target === "click") {
      const e = msg.event;

      const b = DS.get('boundaries');
      let nodata = b.raster.nodata;

      let t;

      function add_lnglat(td, lnglat = [0, 0]) {
        td.append(el_tree([ce('tr'), [ce('td', "&nbsp;"), ce('td', "&nbsp;")]]));

        td.append(el_tree([
          ce('tr'), [
            ce('td', "longitude"),
            ce('td', ce('code', lnglat[0].toFixed(2)))
          ]
        ]));

        td.append(el_tree([
          ce('tr'), [
            ce('td', "latitude"),
            ce('td', ce('code', lnglat[1].toFixed(2)))
          ]
        ]));
      };

      if (state.view === "outputs") {
        t = {
          raster: {
            data: MAPBOX.getSource('output-source').raster
          },
          category: {},
          name: ea_indexes[state.output]['name']
        };
        nodata = -1;

        const o = ea_coordinates_in_raster(
          [e.lngLat.lng, e.lngLat.lat],
          MAPBOX.coords,
          {
            data: t.raster.data,
            width: b.raster.width,
            height: b.raster.height,
            nodata: nodata
          }
        );

        if (o && o.value !== null) {
          let f = d3.scaleQuantize().domain([0,1]).range(["Low", "Low-Medium", "Medium", "Medium-High", "High"]);

          let td = table_data([{
            "target": t.name,
            "dataset": "value"
          }], {
            "value": f(o.value)
          });

          add_lnglat(td, [e.lngLat.lng, e.lngLat.lat]);

          mapbox_pointer(
            td,
            e.originalEvent.pageX,
            e.originalEvent.pageY
          );
        }
        else {
          log("No value on raster.", o);
        }
      }

      else if (state.view === "inputs") {
        const i = state.inputs[0];
        t = DS.get(i);

        if (!t) return;

        if (t.vectors) {
          const et = MAPBOX.queryRenderedFeatures(e.point)[0];
          if (!et) return;

          log("Feature Properties:", et.properties);

          if (et.source === i) {
            let at;

            if (at = t.config.features_attr_map) {
              let td = table_data(at, et.properties);
              add_lnglat(td, [e.lngLat.lng, e.lngLat.lat]);

              mapbox_pointer(
                td,
                e.originalEvent.pageX,
                e.originalEvent.pageY
              );
            }
            else {
              warn("Dataset is not configured to display info. (configuration.features_attr_map)");
            }
          }

          return;
        }
        else if (t.raster.data) {
          const rc = ea_coordinates_in_raster(
            [e.lngLat.lng, e.lngLat.lat],
            MAPBOX.coords,
            {
              data: t.raster.data,
              width: t.raster.width,
              height: t.raster.height,
              nodata: nodata
            }
          );

          if (rc && rc.value !== null && rc.value !== t.raster.nodata) {
            v = rc.value;

            if (t.raster.config) v = v * t.raster.config.factor;

            const vv = (v%1 === 0) ? v : v.toFixed(2);

            const td = table_data([{
              "target": t.name,
              "dataset": "value"
            }], {
              "value": `${vv} <code>${t.category.unit || ''}</code>`
            });

            add_lnglat(td, [e.lngLat.lng, e.lngLat.lat]);

            mapbox_pointer(
              td,
              e.originalEvent.pageX,
              e.originalEvent.pageY
            );
          }
          else {
            log("No value (or nodata value) on raster.", rc);
          }
        }
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
  const url = new URL(location);

  let view, output, inputs, preset;

  let view_param = url.searchParams.get('view');
  let output_param = url.searchParams.get('output');
  let inputs_param = url.searchParams.get('inputs');
  let preset_param = url.searchParams.get('preset');

  function go(fn) {
    fn();
    history.replaceState(null, null, url);
  };

  function set_view_param(m) {
    url.searchParams.set('view', (m || view));
  };

  function set_output_param(o) {
    url.searchParams.set('output', (o || output));
  };

  function set_inputs_param(i) {
    url.searchParams.set('inputs', (i || inputs).join('.'));
  };

  function set_preset_param(p) {
    qs('#controls-preset').value = (p || 'custom');
    url.searchParams.set('preset', (p || 'custom'));
  };

  if (Object.keys(ea_indexes).includes(output_param)) {
    output = output_param;
  } else {
    output = "eai";
    go(set_output_param);
  }

  if (!inputs_param) {
    inputs = [];
    go(set_inputs_param);
  } else {
    inputs = inputs_param.split('.');
  }

  if (Object.keys(ea_views).includes(view_param)) {
    view = view_param;
  } else {
    view = 'inputs';
    go(set_view_param);
  }

  if (['market', 'planning', 'investment', 'custom'].includes(preset_param)) {
    preset = preset_param;
  } else {
    preset = 'custom';
    go(set_preset_param);
  }

  return {
    view: view,
    set_view_param: _ => go(set_view_param),
    output: output,
    set_output_param: _ => go(set_output_param),
    inputs: inputs,
    set_inputs_param: _ => go(set_inputs_param),
    preset: preset,
    set_preset_param: _ => go(set_preset_param),
  };
};

async function ea_overlord_init(state) {
  const url = new URL(location);
  const id = url.searchParams.get('id');

  MOBILE = screen.width < 1152;

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
          d.input = d.input || new dsinput(d);
          d.controls = d.controls || new dscontrols(d);
          return d;
        })
        .filter(d => d.active)
        .map(d => d.id)
        .sort((x,y) => (state.inputs.indexOf(x) < state.inputs.indexOf(y)) ? -1 : 1);

  state.set_inputs_param(a);

  ea_controls_sort_datasets(GEOGRAPHY.configuration.sort_datasets);

  ea_views_init();
  ea_inputs_init();
  ea_indexes_init(state);
  ea_controls_init(state);

  if (!MOBILE) ea_nanny_init(state);
  if (MOBILE) ea_mobile_init();

  ea_loading(false);
};