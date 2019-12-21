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
 *      view: set the entire app between {} views
 *      dataset: change params or (de)activate a DS
 *      timeline-change: react to the slider
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
 *      dataset: a DS object
 *      sort: an array with the ID's of the active datasets
 *      refresh: "inputs"
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
    await Promise.all(state.inputs.map(id => DS.get(id).turn(true, true)));

    ea_inputs(state.inputs);
    ea_inputs_sort(state.inputs);

    window.dispatchEvent(new Event('resize'));

    break;
  }

  case 'dataset': {
    const ds = msg.target;

    ds.active ?
      state.inputs.unshift(ds.id) :
      state.inputs.splice(state.inputs.indexOf(ds.id), 1); // REMOVE()

    const inputs = [...new Set(state.inputs)]; // UNIQUE()

    await ds.turn(ds.active, true);
    ds.raise();

    state.set_inputs_param(inputs);

    // const rp = qs('#right-pane');
    // elem_empty(rp);
    //
    // if (ds.active && ds.category.timeline) {
    //   rp.prepend(ds.multiline.svg);
    // }
    // else if (state.inputs.length) {
    //   const nd = DS.get(state.inputs[0]);
    //
    //   if (nd.category.timeline)
    //     rp.prepend(nd.multiline.svg);
    // }
    //
    if (state.inputs.length) {
      const datasets = DS.all.filter(d => d.active && d.category.timeline && d.csv.data);

      if (TIMELINE_DISTRICT)
        ea_timeline_lines_draw(datasets, TIMELINE_DISTRICT);

      // const d = DS.get(state.inputs[0]);
      //
      // const colors = {};
      // datasets.forEach(d => colors[d.id] = d.csv.config.color_stops.slice(-1));
      //
      // TIMELINE_BARS = ea_svg_bars({
      //   keys: datasets.map(x => x.id),
      //   data: ea_timeline_bars_prepare(datasets),
      //   colors: colors,
      //   group_by: 'OBJECTID',
      //   width: 350,
      //   height: 300,
      //   domain: [0,100]
      // });
      //
      // rp.append(TIMELINE_BARS.svg);
    }

    ea_inputs(state.inputs);

    break;
  }

  case 'timeline-change': {
    const dsid = state.inputs[0];
    const ds = DS.get(dsid);

    // const datasets = DS.all.filter(d => d.active && d.category.timeline && d.csv.data);
    // if (TIMELINE_BARS) TIMELINE_BARS.setvalues(ea_timeline_bars_prepare(datasets));

    DS.all.forEach(d => {
      if (!d.category.timeline || !d.vectors.features) return;
      ea_datasets_polygons_csv_timeline.call(d, msg.target);
    });

    break;
  }

  case 'sort': {
    ea_inputs_sort(msg.target);
    state.set_inputs_param(msg.target);

    break;
  }

  case 'refresh': {
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

      const i = state.inputs[0];
      let t = DS.get(i);

      if (!t) return;

      if (t.vectors) {
        const et = MAPBOX.queryRenderedFeatures(e.point)[0];
        if (!et) return;

        if (et.source === i) {
          // t.bar.highlight(et.properties['District']);
          // t.multiline.highlight(et.properties['District'], new Date(TIMELINE_CURRENT_DATE));
          // if (TIMELINE_BARS) TIMELINE_BARS.highlight(et.properties['District']);
          // if (TIMELINE_LINES) TIMELINE_LINES.newdata();

          const datasets = DS.all.filter(d => d.active && d.category.timeline && d.csv.data);
          // datasets.forEach(d => colors[d.id] = d.csv.config.color_stops.slice(-1));

          ea_timeline_lines_draw(datasets, (TIMELINE_DISTRICT = et.properties['District']));
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

  let view, inputs;

  let view_param = url.searchParams.get('view');
  let inputs_param = url.searchParams.get('inputs');

  function set_inputs_param(i) {
    url.searchParams.set('inputs', (i || inputs).join('.'));
    history.replaceState(null, null, url);
  };

  if (!inputs_param) {
    inputs = [];
    set_inputs_param();
  } else {
    inputs = inputs_param.split('.');
  }

  return {
    inputs: inputs,
    set_inputs_param: set_inputs_param,
  };
};

async function ea_overlord_init(state) {
  const url = new URL(location);
  const id = url.searchParams.get('id');

  MOBILE = screen.width < 1152;

  ea_layout_init();

  GEOGRAPHY = (await fetch(`${ea_settings.database}/geographies?id=eq.${id}`).then(r => r.json()))[0];
  MAPBOX = mapbox_setup();

  await ea_datasets_init(GEOGRAPHY.id, state.inputs, null, bounds => {
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

  // const dsid = state.inputs[0];
  // if (dsid && dsid !== "") {
  //   const ds = DS.get(dsid);
  //
  //   if (ds.category.timeline) {
  //     await until(_ => ds.layer);
  //     ds.raise();
  //   }
  // }

  ea_inputs_init();
  ea_timeline_init();
  ea_controls_init(state);

  if (MOBILE) ea_mobile_init();

  ea_loading(false);
};
