TIMELINE_DATES = [];
TIMELINE_CURRENT_DATE = null;
TIMELINE_LINES = null;
TIMELINE_DISTRICT = null;

async function ea_timeline_init() {
  await until(_ => TIMELINE_DATES.length > 0);

  const steps = TIMELINE_DATES.map(x => parseInt(x.replace('(^[0-9]{4}-)', '\1')));

  const parent = qs('#timeline');
  const padding = 100;

  const tl = ea_svg_timeline_slider({
    steps: steps,
    width: parent.clientWidth - padding,
    init: steps.length - 1,
    parent: parent,
    dragging: function(x) {
      const t = TIMELINE_DATES.find(i => i.match(x));

      if (TIMELINE_CURRENT_DATE === t) return;
      else TIMELINE_CURRENT_DATE = t;

      ea_overlord({
        "type": "timeline-change",
        "target": t,
        "caller": "timeline_init dragging"
      });
    }
  });

  tl.svg.style.left = (padding / 2) + "px";
  parent.append(tl.svg);

  return tl;
};

function ea_timeline_lines_draw(datasets, district) {
  const series = datasets.reduce((a,c) => {
    return a.concat(c.csv.data.filter(r => r['District'] === district).map(r => {
      return {
        values: TIMELINE_DATES.map(k => (r[k] === "" ? undefined : +r[k])),
        name: c.id,
        color: c.colorscale.stops.slice(-1)
      };
    }));
  }, []);

  if (TIMELINE_LINES)
    TIMELINE_LINES.svg.remove();

  const average = datasets.map(i => {
    return {
      name: i['id'],
      values: TIMELINE_DATES.map(d => i.csv.data.map(r => +r[d])).map(x => x.reduce((a,c) => a + c, 0) / x.length)
    }
  });

  TIMELINE_LINES = ea_svg_multiline({
    data: {
      series: series,
      dates: TIMELINE_DATES.map(d3.utcParse("%Y-%m-%d"))
    },
    color: "green",
    width: 350,
    height: 250,
    message: function(m,i,a) {
      return el_tree([
        document.createElement('table'), [
          [ ce('tr'), [
            ce('td', ce('strong', "District value: &nbsp;")),
            ce('td', a.toString())
          ]],
          [ ce('tr'), [
            ce('td', ce('strong', "State Average: &nbsp;")),
            ce('td', (Math.round(average.find(x => x.name === m.name).values[i] * 100) / 100).toString())
          ]]
        ]
      ]);
    }
  });

  const rp = qs('#right-pane');

  qs('#district-header', rp).innerText = district;
  qs('#district-graph', rp).append(TIMELINE_LINES.svg);
};

function ea_controls_dropdown() {
  const dropdownlist = [];

  if (!Object.keys(this.ds.metadata).every(k => !this.ds.metadata[k])) {
    dropdownlist.push({
      "content": "Dataset info",
      "action": _ => ea_dataset_modal(this.ds)
    });
  }

  return dropdownlist;
};

function ea_overlord_init(state) {
  ea_timeline_init();
  ea_views_init();
};

function ea_overlord_refresh(state) {
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

async function ea_overlord_view(state, msg) {
  let t = msg.target;

  ea_state_set('view', t);

  await Promise.all(state.inputs.map(id => DST[id].turn(true, (t === 'timeline'))));

  if (t === "outputs") {
    qs('#timeline').style.height = '0';
  }

  else if (t === 'filtered') {
    qs('#timeline').style.height = '0';
    MAPBOX.setLayoutProperty('filtered-layer', 'visibility', 'visible');
    TIMELINE_CURRENT_DATE = TIMELINE_DATES.slice(-1)[0];
    ea_filter_valued_polygons();
  }

  else if (t === "timeline") {
    qs('#timeline').style.height = '';
    MAPBOX.setLayoutProperty('filtered-layer', 'visibility', 'none');

    ea_cards(state.inputs);
    ea_cards_sort(state.inputs);
  }
};

async function ea_overlord_dataset(state, msg) {
  const ds = msg.target;

  let inputs = state.inputs;

  if (ds.active) {
    state.inputs.unshift(ds.id);
  } else {
    state.inputs.splice(state.inputs.indexOf(ds.id), 1);
  }

  if (state.view === 'timeline') {
    await ds.turn(ds.active, true);
    ds.raise();
  } else {
    await ds.turn(ds.active, false);
  }

  inputs = [...new Set(inputs)];
  ea_cards(inputs);
  ea_state_set('inputs', inputs);

  if (state.inputs.length) {
    const datasets = DS.list.filter(d => d.active && d.timeline && maybe(d, 'csv', 'data'));

    if (TIMELINE_DISTRICT)
      ea_timeline_lines_draw(datasets, TIMELINE_DISTRICT);
  } else {
    const rp = qs('#right-pane');
    qs('#district-header', rp).innerText = "";
    if (TIMELINE_LINES) TIMELINE_LINES.svg.remove();
  }
};

function ea_overlord_map_click(state, msg) {
  const e = msg.event;

  const b = DST['boundaries'];
  let nodata = b.raster.nodata;

  const i = state.inputs[0];
  let t = DST[i];

  if (!t) return;

  if (t.vectors) {
    const et = MAPBOX.queryRenderedFeatures(e.point)[0];
    if (!et) return;

    if (et.source === i) {
      const datasets = DS.list.filter(d => d.active && d.timeline && maybe(d, 'csv', 'data'));
      ea_timeline_lines_draw(datasets, (TIMELINE_DISTRICT = et.properties['District']));
    }
  }
};

async function ea_datasets_polygons_csv_timeline(t) {
  const opts = {
	key: t || TIMELINE_CURRENT_DATE || TIMELINE_DATES[TIMELINE_DATES.length - 1],
  };

  await until(_ => this.csv.data);

  this.domain[0] = d3.min([].concat(...TIMELINE_DATES.map(d => this.csv.data.map(r => +r[d]))));
  this.domain[1] = d3.max([].concat(...TIMELINE_DATES.map(d => this.csv.data.map(r => +r[d]))));

  this._domain = JSON.parse(JSON.stringify(this.domain));
  this.domain_init = JSON.parse(JSON.stringify(this.domain));

  ea_datasets_polygons_csv.call(this, opts);
};

function ea_filter_valued_polygons() {
  const datasets = DS.list.filter(d => d.active && d.csv.data && d.datatype.match("-(fixed|timeline)"));

  function m(d,r) {
    const c = d.config.column;

    if (d.timeline)
      return +r[TIMELINE_CURRENT_DATE] >= d._domain[0] && +r[TIMELINE_CURRENT_DATE] <= d._domain[1];
    else if (c)
      return +r[c] >= d._domain[0] && +r[c] <= d._domain[1];
  };

  const arr = datasets.map(d => d.csv.data.filter(r => m(d,r)).map(r => +r[d.csv.key]));

  if (!arr.length) return;

  const result = arr[0].filter(e => arr.every(a => a.includes(e)));

  const source = MAPBOX.getSource('filtered-source');

  const b = DST.boundaries;
  const fs = source._data.features;

  for (let i = 0; i < fs.length; i += 1)
    fs[i].properties.__hidden = !result.includes(+fs[i].properties[b.vectors.key]);

  source.setData(source._data);
};
