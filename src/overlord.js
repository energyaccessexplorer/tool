class Overlord {
  constructor() {
    const o = {};

    for (let k in U.params) {
      let v = U[k];

      let arr = !U.params[k].length;

      if (!v || v === "") {
        o[k] = U.params[k][0] || [];
      } else {
        o[k] = arr ? v.split(',') : v;
      }

      // Force the default if tampered with.
      //
      if (!arr && !U.params[k].includes(v))
        o[k] = U.params[k][0];
    }

    this.state = o;

    U.params = o;
  };

  get o() {
    return this.state;
  };

  refresh() {
    ea_overlord_special_layers();
    this.view = O.o.view;
  };

  layers(v) {
    Promise.all(O.o.inputs.map(id => DST[id].turn(true, (v === 'inputs' || v === 'timeline'))));
  };

  dataset(_ds, arg, data) {
    let ds;

    switch (_ds.constructor.name) {
    case "DS":
      ds = _ds;
      break;

    case "string":
      ds = DST[i];
      break;

    default:
      console.error("O.dataset: Do not know what to do with", _ds);
      throw Error("O.dataset: ArgumentError.");
      break;
    }

    if (!ds) throw Error("ds was never set...");

    switch (arg) {
    case "domain":
      ds.__domain = data;
      ea_overlord_update_view();
      break;

    case "active":
      ds._active = data;
      break;

    case "disable":
    case "mutate":
    default:
      ea_overlord_dataset(ds);
      break;
    }
  };

  set datasets(arr) {
    ea_cards_sort(arr);
    U.inputs = arr;
  };

  set timeline(t) {
    DS.list.forEach(async d => {
      if (d.timeline && d.active && d.vectors.features)
        ea_datasets_polygons_csv.call(d, ea_timeline_date(t));
    })
  };

  get index() {
    const url = new URL(location);
    return url.searchParams.get('index');
  };

  set index(t) {
    U.output = t;
    ea_plot_active_analysis(t).then(raster => ea_indexes_graphs(raster));
  };

  get view() {
    const url = new URL(location);
    return url.searchParams.get('view');
  };

  set view(t) {
    U.view = t;

    this.layers(t);

    ea_overlord_update_view(t);

    ea_view_buttons(t);
    ea_view_right_pane(t);

    window.dispatchEvent(new Event('resize'));
  };

  map(interaction, event) {
    if (interaction === "click")
      ea_overlord_map_click(O.o, event);
  };
}

async function ea_init(callback) {
  const url = new URL(location);
  const id = url.searchParams.get('id');
  let params;

  GEOGRAPHY = await ea_api("geographies", { "id": `eq.${id}` }, { object: true });
  TIMELINE = maybe(GEOGRAPHY, 'configuration', 'timeline');

  if (TIMELINE) {
    TIMELINE_DATES = [];
    TIMELINE_CURRENT_DATE = null;
    TIMELINE_LINES = null;
    TIMELINE_DISTRICT = null;

    params = {
      "view": ['timeline', 'filtered', 'outputs'],
      "inputs": [],
      "output": ['eai'],
      "pack": [],
    };
  } else {
    qs('#timeline').remove();

    params = {
      "view": ['inputs', 'outputs'],
      "inputs": [],
      "output": ['eai', 'ani', 'demand', 'supply'],
      "pack": [],
    };
  }

  callback(url, params);

  MAPBOX = ea_mapbox();

  const {view, inputs, output, pack} = O.o;

  MOBILE = screen.width < 1152;
  ea_layout_init();

  await ea_datasets_init(GEOGRAPHY.id, inputs, pack, bounds => {
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
        .sort((x,y) => (inputs.indexOf(x) < inputs.indexOf(y)) ? -1 : 1);

  O.datasets = a;

  ea_cards_init(a);
  ea_controls_init(O.o);

  if (MOBILE) ea_mobile_init();

  ea_loading(false);

  ea_views_init();
  ea_indexes_init(O.o);

  if (TIMELINE) ea_timeline_init();

  if (!MOBILE && !TIMELINE) ea_nanny_init(O.o);
};

function ea_overlord_update_view(v) {
  const timeline = qs('#timeline');

  const {view, output, inputs} = O.o;

  switch (view) {
  case "outputs": {
    ea_indexes_list();

    ea_plot_active_analysis(output)
      .then(raster => ea_indexes_graphs(raster))
      .then(_ => {
        if (timeline) timeline.style.display = 'none';

        if (MAPBOX.getLayer('filtered-layer'))
          MAPBOX.setLayoutProperty('filtered-layer', 'visibility', 'none');

        MAPBOX.setLayoutProperty('output-layer', 'visibility', 'visible')
      });
    break;
  }

  case "inputs": {
    if (MAPBOX.getLayer('output-layer'))
      MAPBOX.setLayoutProperty('output-layer', 'visibility', 'none');

    ea_cards(inputs);
    ea_cards_sort(inputs);

    ea_plot_active_analysis(output);
    break;
  }

  case "filtered": {
    if (timeline) timeline.style.display = 'none';

    MAPBOX.setLayoutProperty('filtered-layer', 'visibility', 'visible');
    MAPBOX.setLayoutProperty('output-layer', 'visibility', 'none');

    ea_plot_active_analysis(output)
      .then(raster => ea_indexes_graphs(raster));

    TIMELINE_CURRENT_DATE = TIMELINE_DATES.slice(-1)[0];
    ea_timeline_filter_valued_polygons();
    break;
  }

  case "timeline": {
    if (timeline) timeline.style.display = '';

    MAPBOX.setLayoutProperty('filtered-layer', 'visibility', 'none');
    MAPBOX.setLayoutProperty('output-layer', 'visibility', 'none');

    ea_cards(inputs);
    ea_cards_sort(inputs);

    break;
  }

  default: {
    throw `Argument Error: Overlord: Could not set/find the view '${view}'.`;
    break;
  }
  }
};

async function ea_overlord_dataset(ds) {
  const {inputs, output, view} = O.o;

  if (ds.active) inputs.unshift(ds.id);
  else inputs.splice(inputs.indexOf(ds.id), 1);

  if (view === "inputs" || view === "timeline") {
    await ds.turn(ds.active, true);
    ds.raise();
    ea_plot_active_analysis(output);
  } else {
    await ds.turn(ds.active, false);
  }

  if (view === "outputs") {
    ea_indexes_list();
    ea_plot_active_analysis(output).then(raster => ea_indexes_graphs(raster));
  }

  const _inputs = [...new Set(inputs)];
  ea_cards(_inputs);
  O.datasets =  _inputs;

  if (!TIMELINE) return;

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

function ea_overlord_special_layers() {
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

function ea_overlord_map_click(state, e) {
  const b = DST['boundaries'];
  let nodata = b.raster.nodata;

  const {view, inputs, output} = state;

  const i = maybe(inputs, 0);
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

  if (view === "outputs") {
    t = {
      raster: {
        data: MAPBOX.getSource('output-source').raster
      },
      category: {},
      name: ea_indexes[output]['name']
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

  else if (view === "inputs") {
    t  = DST[i];

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

  else if (view === "timeline") {
    t  = DST[i];

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

const UProxyHandler = {
  get: function(o,p) {
    if (p === "params") return o.params;
    else return o.url.searchParams.get(p);
  },

  set: function(o,t,v) {
    switch (t) {
    case "inputs":
    case "output":
    case "view":
    case "pack":
      o.url.searchParams.set(t,v);
      break;

    case "params":
      for (p in v) {
        o.url.searchParams.set(p, v[p]);
      }
      break;

    default:
      throw TypeError(`U: I'm not allowed to set '${t}'`);
      break;
    }

    history.replaceState(null, null, o.url);

    return true;
  }
};
