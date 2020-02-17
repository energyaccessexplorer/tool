function table_data(dict, prop, event) {
  const t = document.createElement('table');
  dict.forEach(d => {
    t.append(el_tree([
      ce('tr'), [
        ce('td', ce('strong', d.target + ": &nbsp;")),
        ce('td', prop[d.dataset].toString())
      ]
    ]));
  });

  return t;
};

function ea_nanny_init(state) {
  window.ea_nanny = new nanny(ea_nanny_steps);

  if (state.inputs.length > 0) return;
  if (state.view !== "inputs") return;

  const w = localStorage.getItem('needs-nanny');

  if (!w || !w.match(/false/)) ea_nanny.start();
};

function ea_nanny_force_start() {
  const url = new URL(location);
  url.searchParams.set('inputs', '');
  url.searchParams.set('output', 'eai');
  url.searchParams.set('view', 'inputs');

  history.replaceState(null, null, url);

  DS.list.filter(d => d.active).forEach(d => d.turn(false, false));

  ea_view('inputs');
  ea_controls_select_tab(qs('#controls-tab-filters'), "filters");
  ea_modal.hide();

  ea_overlord({
    "type": "refresh",
    "target": null,
    "caller": "ea_nanny_force_start"
  });

  ea_nanny.start();
};

function ea_current_config() {
  const url = new URL(location);

  const state = ea_state_sync();
  const config = {
    geography_id: url.searchParams.get('id'),
    analysis_type: state.output,
    datasets: []
  };

  for (let i of state.inputs) {
    let d = DST[i];
    let c = {};

    c.id = d.dataset_id;
    c.category = d.id;
    c.weight = d.weight;
    c.domain = d.domain.map(x => +x);

    config.datasets.push(c);
  }

  let blob = new Blob([JSON.stringify(config)], { type: "application/octet-stream;charset=utf-8" });

  fake_download(URL.createObjectURL(blob), `energyaccessexplorer-${state.output}.json`);

  return config;
};

async function fake_download(url, name) {
  const a = document.createElement('a');
  a.href = url;
  a.target = "_blank";
  a.download = name ? name : '';
  a.style.display = 'none';

  document.body.appendChild(a);

  await delay(0.1);

  a.click();
  a.remove();
};

function ea_controls_dropdown() {
  const dropdownlist = [];

  if (!Object.keys(this.ds.metadata).every(k => !this.ds.metadata[k])) {
    dropdownlist.push({
      "content": "Dataset info",
      "action": _ => ea_dataset_modal(this.ds)
    });
  }

  if (this.weight_group) {
    dropdownlist.push({
      "content": "Toggle advanced controls",
      "action": _ => {
        if (!this.ds.active) this.ds.toggle();

        qs('.advanced-controls', this).style.display = (this.show_advanced = !this.show_advanced) ? 'block' : 'none';
      }
    });
  }

  dropdownlist.push({
    "content": "Reset default values",
    "action": _ => this.reset_defaults()
  });

  dropdownlist.push({
    "content": "Set values manually",
    "action": _ => qs('.manual-controls', this).style.display = 'flex'
  });

  // Enable this later when we are ready to let the users download the
  // original file.
  //
  // if (this.ds.download) {
  //   dropdownlist.push({
  //     "content": "Download dataset file",
  //     "action": _ => fake_download(this.ds.download, null)
  //   });
  // }
  //
  return dropdownlist;
};

function ea_overlord_init(state) {
  ea_views_init();
  ea_indexes_init(state);

  if (!MOBILE) ea_nanny_init(state);
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
};

async function ea_overlord_view(state, msg) {
  let t = msg.target;

  ea_state_set('view', t);

  await Promise.all(state.inputs.map(id => DST[id].turn(true, (t === 'inputs'))));

  if (t === "outputs") {
    ea_indexes_list(state);

    ea_plot_active_analysis(state.output)
      .then(raster => ea_indexes_graphs(raster))
      .then(_ => MAPBOX.setLayoutProperty('output-layer', 'visibility', 'visible'));
  }

  else if (t === "inputs") {
    if (MAPBOX.getLayer('output-layer'))
      MAPBOX.setLayoutProperty('output-layer', 'visibility', 'none');

    ea_cards(state.inputs);
    ea_cards_sort(state.inputs);
  }

  else {
    throw `Argument Error: Overlord: Could not set/find the view '${state.view}'.`;
  }

  right_pane(t);
};

async function ea_overlord_dataset(state, msg) {
  const ds = msg.target;

  let inputs = state.inputs;

  if (ds.active) {
    inputs.unshift(ds.id);
  }
  else {
    inputs.splice(inputs.indexOf(ds.id), 1);
  }

  if (state.view === "outputs") {
    await ds.turn(ds.active, false);

    ea_indexes_list(state);
    ea_plot_active_analysis(state.output).then(raster => ea_indexes_graphs(raster));
  }

  else if (state.view === "inputs") {
    await ds.turn(ds.active, true);

    ds.raise();

    ea_plot_active_analysis(state.output);
  }

  else {
    throw `Argument Error: Overlord: Could not set the view ${state.view}`;
  }

  inputs = [...new Set(inputs)];
  ea_cards(inputs);
  ea_state_set('inputs', inputs);
};

function ea_overlord_map_click(state, msg) {
  const e = msg.event;

  const b = DST['boundaries'];
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
    const i = state.inputs[0];
    t = DST[i];

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
};
