/*
 * ea_overlord
 *
 * Connects the entire app, changes states and updates components accordingly.
 *
 * Any communication between the app's components:
 *   - controls
 *   - cards
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
 *      timeline-change: react to the slider
 *      index: change the currently shown index
 *      sort: sort the selected datasets (cards)
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
 *      index: eg: "demand", "supply", "eai" or "ani"
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
  if (!msg.caller) throw "Argument Error: Overlord: Who is the caller?";

  const state = ea_state_sync();

  switch (msg.type) {
  case 'init': {
    const url = new URL(location);
    const id = url.searchParams.get('id');

    MOBILE = screen.width < 1152;

    ea_layout_init();

    GEOGRAPHY = await ea_api("geographies", { "id": `eq.${id}` }, { object: true });
    MAPBOX = mapbox_setup();

    await ea_datasets_init(GEOGRAPHY.id, state.inputs, state.pack, bounds => {
      const b = mapbox_fit(bounds);

      const l = b[0];
      const r = b[2];
      const d = b[1];
      const u = b[3];

      MAPBOX.coords = [[l,u], [r,u], [r,d], [l,d]];

      mapbox_change_theme(ea_settings.mapbox_theme);
    });

    const a = DS.list
          .filter(d => !d.disabled)
          .map(d => {
            // dscard and dscontrols might have already been created by items_init
            //
            d.card = d.card || new dscard(d);
            d.controls = d.controls || new dscontrols(d);
            return d;
          })
          .filter(d => d.active)
          .map(d => d.id)
          .sort((x,y) => (state.inputs.indexOf(x) < state.inputs.indexOf(y)) ? -1 : 1);

    ea_state_set('inputs', a);

    ea_controls_sort_datasets(GEOGRAPHY.configuration.sort_datasets);

    ea_cards_init(a);
    ea_controls_init(state);

    if (MOBILE) ea_mobile_init();

    ea_loading(false);

    ea_overlord_init(state);

    break;
  }

  case 'view': {
    await ea_overlord_view(state, msg);

    window.dispatchEvent(new Event('resize'));

    break;
  }

  case 'dataset': {
    ea_overlord_dataset(state, msg);

    break;
  }

  case 'controls': {
    if (state.view === "outputs") {
      ea_indexes_list(state);
      ea_plot_active_analysis(state.output).then(raster => ea_indexes_graphs(raster));
    }

    else if (state.view === "inputs") {
      ea_plot_active_analysis(state.output);
    }

    else if (state.view === "filtered") {
      ea_filter_valued_polygons();
    }

    else if (state.view === "timeline") {
    }

    break;
  }

  case 'index': {
    ea_state_set('output', msg.target);
    ea_plot_active_analysis(msg.target).then(raster => ea_indexes_graphs(raster));

    break;
  }

  case 'timeline-change': {
    DS.list.forEach(d => {
      if (d.timeline && d.active && d.vectors.features)
        ea_datasets_polygons_csv_timeline.call(d, msg.target);
    });

    break;
  }

  case 'sort': {
    ea_cards_sort(msg.target);
    ea_state_set('inputs', msg.target);

    break;
  }

  case 'refresh': {
    ea_overlord_refresh(state);

    ea_overlord({
      "type": "view",
      "target": state.view,
      "caller": "ea_overlord refresh"
    });

    break;
  }

  case 'map': {
    if (msg.target === "click") {
      ea_overlord_map_click(state, msg);
    }

    break;
  }

  default:
    throw `Overlord: I don't know message type '${msg.type}'`
  }

  if (typeof msg.callback === 'function') msg.callback();
};
