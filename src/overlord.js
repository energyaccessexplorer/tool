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
          .filter(d => d.active && !d.disabled)
          .map(d => d.id)
          .sort((x,y) => (state.inputs.indexOf(x) < state.inputs.indexOf(y)) ? -1 : 1);

    ea_state_set('inputs', a);

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
      ea_timeline_filter_valued_polygons();
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
    DS.list.forEach(async d => {
      if (d.timeline && d.active && d.vectors.features)
        ea_datasets_polygons_csv.call(d, ea_timeline_date(msg.target));
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

async function ea_overlord_view(state, msg) {
  const t = msg.target;
  const timeline = qs('#timeline');

  ea_state_set('view', t);

  await Promise.all(state.inputs.map(id => DST[id].turn(true, (t === 'inputs' || t === 'timeline'))));

  if (t === "outputs") {
    ea_indexes_list(state);

    ea_plot_active_analysis(state.output)
      .then(raster => ea_indexes_graphs(raster))
      .then(_ => {
        if (timeline) timeline.style.display = 'none';

        if (MAPBOX.getLayer('filtered-layer'))
          MAPBOX.setLayoutProperty('filtered-layer', 'visibility', 'none');

        MAPBOX.setLayoutProperty('output-layer', 'visibility', 'visible')
      });
  }

  else if (t === "timeline") {
    if (timeline) timeline.style.display = '';

    MAPBOX.setLayoutProperty('filtered-layer', 'visibility', 'none');
    MAPBOX.setLayoutProperty('output-layer', 'visibility', 'none');

    ea_cards(state.inputs);
    ea_cards_sort(state.inputs);
  }

  else if (t === "inputs") {
    if (MAPBOX.getLayer('output-layer'))
      MAPBOX.setLayoutProperty('output-layer', 'visibility', 'none');

    ea_cards(state.inputs);
    ea_cards_sort(state.inputs);
  }

  else if (t === 'filtered') {
    if (timeline) timeline.style.display = 'none';

    MAPBOX.setLayoutProperty('filtered-layer', 'visibility', 'visible');
    MAPBOX.setLayoutProperty('output-layer', 'visibility', 'none');

    ea_plot_active_analysis(state.output)
      .then(raster => ea_indexes_graphs(raster));

    TIMELINE_CURRENT_DATE = TIMELINE_DATES.slice(-1)[0];
    ea_timeline_filter_valued_polygons();
  }

  else {
    throw `Argument Error: Overlord: Could not set/find the view '${state.view}'.`;
  }

  ea_view_right_pane(t);
};

async function ea_overlord_dataset(state, msg) {
  const ds = msg.target;

  const inputs = state.inputs;

  if (ds.active) {
    inputs.unshift(ds.id);
  } else {
    inputs.splice(inputs.indexOf(ds.id), 1);
  }

  if (state.view === "inputs" || state.view === "timeline") {
    await ds.turn(ds.active, true);
    ds.raise();
    ea_plot_active_analysis(state.output);
  } else {
    await ds.turn(ds.active, false);
  }

  if (state.view === "outputs") {
    ea_indexes_list(state);
    ea_plot_active_analysis(state.output).then(raster => ea_indexes_graphs(raster));
  }

  const _inputs = [...new Set(inputs)];
  ea_cards(_inputs);
  ea_state_set('inputs', _inputs);

  if (maybe(TIMELINE_CURRENT_DATE) && _inputs.length) {
    const datasets = DS.list.filter(d => d.active && d.timeline && maybe(d, 'csv', 'data'));

    if (TIMELINE_DISTRICT)
      ea_timeline_lines_draw(datasets, TIMELINE_DISTRICT);
  } else {
    const rp = qs('#right-pane');
    qs('#district-header', rp).innerText = "";
    if (TIMELINE_LINES) TIMELINE_LINES.svg.remove();
  }
};

function ea_overlord_init(state) {
  ea_views_init();
  ea_indexes_init(state);

  if (TIMELINE) ea_timeline_init();

  if (!MOBILE && !TIMELINE) ea_nanny_init(state);
};

function ea_overlord_refresh(state) {
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

  if (!TIMELINE) return;

  if (!MAPBOX.getSource('filtered-source')) {
    MAPBOX.addSource('filtered-source', {
      "type": 'geojson',
      "data": DST['boundaries'].vectors.features
    });
  }

  if (!MAPBOX.getLayer('filtered-layer')) {
    MAPBOX.addLayer({
      "id": 'filtered-layer',
      "source": 'filtered-source',
      "type": 'fill',
      "layout": {
        "visibility": "none",
      },
      "paint": {
        "fill-color": "#0571B0",
        "fill-outline-color": "black",
        "fill-opacity": [ "case", [ "boolean", [ "get", "__hidden" ], false ], 0, 1 ]
      },
    }, MAPBOX.first_symbol);
  }
};

function ea_overlord_map_click(state, msg) {
  const e = msg.event;

  const b = DST['boundaries'];
  let nodata = b.raster.nodata;

  const i = maybe(state, 'inputs', 0);
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

    if (typeof maybe(o, 'value') === 'number') {
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
    t  = DST[i];;

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

      if (typeof maybe(rc, 'value') === 'number' &&
          rc.value !== t.raster.nodata) {
        v = rc.value;

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

  else if (state.view === "timeline") {
    if (!t) return;

    if (t.vectors) {
      const et = MAPBOX.queryRenderedFeatures(e.point)[0];
      if (!et) return;

      if (et.source === i) {
        const datasets = DS.list.filter(d => d.active && d.timeline && maybe(d, 'csv', 'data'));
        ea_timeline_lines_draw(datasets, (TIMELINE_DISTRICT = et.properties['District']));
      }
    }
  }
};
