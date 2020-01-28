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
};

function ea_overlord_refresh(state) { };

async function ea_overlord_view(state, msg) {
  await Promise.all(state.inputs.map(id => DS.get(id).turn(true, true)));

  ea_cards(state.inputs);
  ea_cards_sort(state.inputs);
};

async function ea_overlord_dataset(state, msg) {
  const ds = msg.target;

  let inputs = state.inputs;

  if (ds.active) {
    state.inputs.unshift(ds.id);
  } else {
    state.inputs.splice(state.inputs.indexOf(ds.id), 1);
  }

  await ds.turn(ds.active, true);
  ds.raise();

  inputs = [...new Set(inputs)];
  ea_cards(inputs);
  ea_state_set('inputs', inputs);

  if (state.inputs.length) {
    const datasets = DS.all.filter(d => d.active && d.timeline && d.csv.data);

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

  const b = DS.get('boundaries');
  let nodata = b.raster.nodata;

  const i = state.inputs[0];
  let t = DS.get(i);

  if (!t) return;

  if (t.vectors) {
    const et = MAPBOX.queryRenderedFeatures(e.point)[0];
    if (!et) return;

    if (et.source === i) {
      const datasets = DS.all.filter(d => d.active && d.timeline && d.csv.data);
      ea_timeline_lines_draw(datasets, (TIMELINE_DISTRICT = et.properties['District']));
    }
  }
};
async function ea_datasets_polygons_csv_timeline(t) {
  const opts = {
    k: t || TIMELINE_CURRENT_DATE || TIMELINE_DATES[TIMELINE_DATES.length - 1],
  };

  ea_datasets_polygons_csv.call(this, opts);
};

async function ea_datasets_polygons_csv_column() {
  const k = this.config.column;

  const opts = {
    k: k,
  };

  ea_datasets_polygons_csv.call(this, opts);
};

