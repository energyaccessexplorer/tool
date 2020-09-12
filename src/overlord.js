import {DS} from './ds.js';
import * as indexes from './indexes.js';
import * as cards from './cards.js';
import * as controls from './controls.js';
import * as views from './views.js';

import {
  polygons_csv,
  polygons_feature_info,
} from './dsparse.js';

import {
  plot_active as analysis_plot_active,
} from './analysis.js';

import {
  fit as mapbox_fit,
  init as mapbox_init,
  change_theme as mapbox_change_theme,
  pointer as mapbox_pointer,
  zoomend as mapbox_zoomend,
  dblclick as mapbox_dblclick,
} from './mapbox.js';

import {
  init as timeline_init,
  lines_draw as timeline_lines_draw,
  lines_update as timeline_lines_update,
  filter_valued_polygons as timeline_filter_valued_polygons,
} from './timeline.js';


class Overlord {
  layers() {
    Promise.all(U.inputs.map(id => DST.get(id).active(true, ['inputs', 'timeline'].includes(U.view))));
  };

  dataset(_ds, arg, data) {
    let ds;

    switch (_ds.constructor.name) {
    case "DS":
      ds = _ds;
      break;

    case "String":
      ds = DST.get(_ds);
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
      break;

    case "weight":
      ds.weight = data;
      break;

    case "active":
      ds.active(data, ['inputs', 'timeline'].includes(U.view));

      let arr = U.inputs;
      if (ds.on) arr.unshift(ds.id);
      else arr.splice(arr.indexOf(ds.id), 1);

      O.datasets = arr;

      timeline_lines_update();
      break;

    case "mutate":
      this.layers();
      break;

    case "disable":
    default:
      break;
    }

    load_view();
  };

  set datasets(arr) {
    U.inputs = arr;
    O.sort();
  };

  set timeline(t) {
    U.timeline = t;

    DS.array.forEach(async d => {
      if (d.on && d.datatype === 'polygons-timeline')
        polygons_csv.call(d, t);
    })
  };

  set index(t) {
    U.output = t;
    analysis_plot_active(t).then(raster => indexes.graphs(raster));
  };

  set view(t) {
    U.view = t;
    O.layers();
    load_view();

    views.buttons();
    views.right_pane();

    window.dispatchEvent(new Event('resize'));
  };

  set subgeo(t) {
    if (!t) {
      U.subgeo = '';
      O.dataset('boundaries', 'domain', DST.get('boundaries').domain);
      return;
    }

    U.subgeo = t;
    O.dataset('boundaries', 'domain', [t, t]);
  };

  map(interaction, event) {
    if (interaction === "click")
      map_click(event);
  };

  async sort() {
    const a = U.inputs;
    await Promise.all(a.map(d => until(_ => MAPBOX.getLayer(d))));

    for (let i = 0; i < a.length; i++)
      MAPBOX.moveLayer(a[i], a[i-1] || MAPBOX.first_symbol);
  };

  async wait_for(func, finish) {
    await until(func); finish();
  };
};

/*
 * dsinit
 *
 * 1. fetch the datasets list from the API
 * 2. generate DS objects
 * 3. initialise mutants and collections
 *
 * @param "id" uuid
 * @param "inputs" string[] with DS.id's
 * @param "pack" string ("all" ...)
 * @param "callback" function to run with the boundaries
 *
 * returns DS[]
 */

async function dsinit(id, inputs, pack, callback) {
  let select = ["*", "category:categories(*)", "df:_datasets_files(*,file:files(*))"];

  let bounds;
  let boundaries_id;

  await ea_api.get("geography_boundaries", { "geography_id": `eq.${id}` }, { one: true })
    .catch(_ => {
      ea_flash.push({
        type: 'error',
        timeout: 10000,
        title: "Geography error",
        message: `
Failed to get the 'boundaries' dataset.
This is fatal.

Thanks for all the fish.`
      });

      const l = qs('#app-loading');
      qs('.spinner', l).style.animation = 'none';
      qs('.spinner', l).style.borderTop = 'none';
      qs('p', l).innerHTML = "Failed &nbsp; <code>:(</code>";

      qs('#playground').remove();

      throw Error("No 'boundaries' dataset. Ciao.");
    })
    .then(r => boundaries_id = r.id);

  const bp = {
    "id": `eq.${boundaries_id}`,
    "select": select,
    "df.active": "eq.true"
  };

  await ea_api.get("datasets", bp, { one: true })
    .then(async e => {
      let ds = new DS(e);

      ds.on = false;

      await ds.load('csv');
      await ds.load('vectors');
      await ds.load('raster');

      if (!(bounds = ds.vectors.bounds)) throw `'boundaries' dataset has no vectors.bounds`;

      if (ds.config.column_name) {
        for (let r of ds.csv.data)
          BOUNDARIES[r[ds.config.column]] = r[ds.config.column_name];
      }
    });

  pack = maybe(pack, 'length') ? pack : 'all';

  const p = {
    "geography_id": `eq.${id}`,
    "select": select,
    "pack": `eq.${pack}`,
    "online": "eq.true",
    "df.active": "eq.true"
  };

  await ea_api.get("datasets", p)
    .then(r => r.filter(d => d.category.name !== 'boundaries'))
    .then(r => r.map(e => new DS(e, inputs.includes(e.category.name))));

  U.params.inputs = [...new Set(DS.array.map(e => e.id))];

  // We need all the datasets to be initialised _before_ setting
  // mutant/collection attributes (order is never guaranteed)
  //
  DS.array.filter(d => d.mutant).forEach(d => d.mutant_init());
  DS.array.filter(d => d.items).forEach(d => d.items_init());

  callback(bounds);
};

async function init() {
  const url = new URL(location);
  const id = url.searchParams.get('id');

  GEOGRAPHY = await ea_api.get("geographies", { "id": `eq.${id}` }, { one: true });
  GEOGRAPHY.timeline = maybe(GEOGRAPHY, 'configuration', 'timeline');
  GEOGRAPHY.timeline_dates = maybe(GEOGRAPHY, 'configuration', 'timeline_dates');

  let params = 'default';

  if (GEOGRAPHY.timeline)
    params = 'timeline';

  MOBILE = screen.width < 1152;
  ea_layout_init();

  MAPBOX = mapbox_init();

  U = new Proxy({ url: url, params: ea_params[params] }, UProxyHandler);
  O = new Overlord();

  await dsinit(GEOGRAPHY.id, U.inputs, U.pack, bounds => {
    MAPBOX.coords = mapbox_fit(bounds);
    mapbox_change_theme(ea_settings.mapbox_theme);
  });

  O.index = U.output;

  cards.init();
  controls.init();

  if (MOBILE) ea_mobile_init();

  views.init();
  indexes.init();

  until(_ => DS.array.filter(d => d.on).every(d => d.loading === false)).then(O.sort);

  if (GEOGRAPHY.timeline) timeline_init();

  if (!MOBILE && !GEOGRAPHY.timeline) ea_nanny_init();

  ea_loading(false);
};

function load_view() {
  const timeline = qs('#timeline');

  const {view, output, inputs} = U;

  special_layers();

  switch (view) {
  case "outputs": {
    indexes.list();

    analysis_plot_active(output)
      .then(raster => indexes.graphs(raster))
      .then(_ => {
        if (timeline) timeline.style.display = 'none';

        if (MAPBOX.getLayer('filtered-layer'))
          MAPBOX.setLayoutProperty('filtered-layer', 'visibility', 'none');

        MAPBOX.setLayoutProperty('output-layer', 'visibility', 'visible');
      });
    break;
  }

  case "inputs": {
    if (MAPBOX.getLayer('output-layer'))
      MAPBOX.setLayoutProperty('output-layer', 'visibility', 'none');

    cards.update(inputs);

    analysis_plot_active(output);
    break;
  }

  case "filtered": {
    if (timeline) timeline.style.display = 'none';

    MAPBOX.setLayoutProperty('filtered-layer', 'visibility', 'visible');
    MAPBOX.setLayoutProperty('output-layer', 'visibility', 'none');

    analysis_plot_active(output)
      .then(raster => indexes.graphs(raster));

    timeline_filter_valued_polygons();
    break;
  }

  case "timeline": {
    if (timeline) timeline.style.display = '';

    MAPBOX.setLayoutProperty('filtered-layer', 'visibility', 'none');
    MAPBOX.setLayoutProperty('output-layer', 'visibility', 'none');

    cards.update(inputs);
    O.sort();

    break;
  }

  default: {
    throw `Argument Error: Overlord: Could not set/find the view '${view}'.`;
    break;
  }
  }
};

function special_layers() {
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

  if (!GEOGRAPHY.timeline) return;

  if (!MAPBOX.getSource('filtered-source')) {
    MAPBOX.addSource('filtered-source', {
      "type": 'geojson',
      "data": DST.get('boundaries').vectors.features
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

    mapbox_dblclick('filtered-layer');
    mapbox_zoomend('filtered-layer');
  }
};

function map_click(e) {
  const b = DST.get('boundaries');
  let nodata = b.raster.nodata;

  const {view, inputs, output} = U;

  const i = maybe(inputs, 0);
  let t;

  function vectors_click(callback) {
    const et = MAPBOX.queryRenderedFeatures(e.point)[0];
    if (!et) return;

    if (et.source === i) {
      if (typeof callback === 'function') callback(et);

      if (INFOMODE)
        polygons_feature_info.call(t, et, e);
    }
  };

  function raster_click() {
    if (!INFOMODE) return;

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
      const v = rc.value;

      const vv = (v%1 === 0) ? v : v.toFixed(2);

      const td = table_data([{
        "target": t.name,
        "dataset": "value"
      }], {
        "value": `${vv} <code>${t.category.unit || ''}</code>`
      });

      table_add_lnglat(td, [e.lngLat.lng, e.lngLat.lat]);

      mapbox_pointer(
        td,
        e.originalEvent.pageX,
        e.originalEvent.pageY
      );
    }
    else {
      console.log("No value (or nodata value) on raster.", rc);
    }
  };

  if (view === "outputs") {
    if (!INFOMODE) return;

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

      table_add_lnglat(td, [e.lngLat.lng, e.lngLat.lat]);

      mapbox_pointer(
        td,
        e.originalEvent.pageX,
        e.originalEvent.pageY
      );
    }

    else {
      console.log("No value on raster.", o);
    }
  }

  else if (view === "inputs") {
    t  = DST.get(i);

    if (!t) return;

    if (t.vectors) vectors_click();

    else if (t.raster.data) raster_click();
  }

  else if (view === "timeline") {
    t  = DST.get(i);

    if (!t) return;

    if (t.vectors) vectors_click(p => {
      if (p.properties['District']) U.subgeoname = p.properties['District'];
      timeline_lines_draw();
    });

    else if (t.raster.data) raster_click();
  }
};

const UProxyHandler = {
  get: function(o,p) {
    const i = o.url.searchParams.get(p);

    let v;
    switch (p) {
    case "params": {
      v = o.params;
      break;
    }

    case "inputs": {
      if (!i || i === "") v = [];
      else v = i.split(',').filter(e => o.params.inputs.indexOf(e) > -1);
      break;
    }

    default: {
      v = (i === "" ? null : i);
      break;
    }
    }

    return v;
  },

  set: function(o,t,v) {
    switch (t) {
    case "output":
    case "view": {
      if (!o.params[t].includes(v)) v = o.params[t][0];
      o.url.searchParams.set(t,v);
      break;
    }

    case "timeline": {
      o.url.searchParams.set(t, v || GEOGRAPHY.timeline_dates.slice(-1)[0]);
      break;
    }

    case "subgeo":
    case "subgeoname":
    case "pack": {
      o.url.searchParams.set(t,v);
      break;
    }

    case "inputs": {
      o.url.searchParams.set(t, [...new Set(v)]);
      break;
    }

    case "params": {
      for (p in v) {
        if (!o.params[p].includes(v[p])) continue;
        o.url.searchParams.set(p, v[p]);
      }
      break;
    }

    default: {
      throw TypeError(`U: I'm not allowed to set '${t}'`);
      break;
    }
    }

    history.replaceState(null, null, o.url);

    return true;
  }
};

export {
  init
};
