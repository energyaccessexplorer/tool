async function ea_init(tree, collection, bounds) {
  let datasets_layers_param = location.get_query_param('datasets-layers');
  let datasets_layers;

  if (!datasets_layers_param) {
    ea_overlord({ type: "init", caller: "ea_init", });
    datasets_layers = [];
  }

  else datasets_layers = datasets_layers_param.split(',');

  tree.forEach(cat => cat.subcategories.forEach(sub => sub.datasets.filter(d => {
    const ds = collection.find(x => x.id === d.id);

    if (!ds) {
      console.warn(`Dataset '${d.id}' not found:`, ds);
      return false;
    }

    ds.category = cat.name;
  })));

  collection.forEach(d => {
    if (d.type === 'mutant')
      d.views = collection.find(x => x.id === d.hosts[0]).views;

    d.weight = d.weight || 2;
    d.active = (datasets_layers.indexOf(d.id) > -1);

    if (typeof d.views.heatmaps.color_scale === 'undefined')
      d.views.heatmaps.color_scale = ea_default_color_scheme;

    if (d.views.heatmaps.url && d.views.heatmaps.url.match(/\.tif$/))
      d.views.heatmaps.parse = ea_datasets_tiff_url;

    if (d.views && d.views.heatmaps)
      d.views.heatmaps.band = d.views.heatmaps.band || 0;

    if (d.views.polygons && d.views.polygons.symbol && !d.views.polygons.parse)
      d.views.polygons.parse = ea_datasets_points;

    d.color_scale_fn = function() {
      return d3.scaleLinear()
        .domain(plotty.colorscales[d.views.heatmaps.color_scale].positions)
        .range(plotty.colorscales[d.views.heatmaps.color_scale].colors)
        .clamp(d.views.heatmaps.clamp || false);
    }
  });

  ea_controls_tree(tree, collection);

  ea_map_setup(bounds);

  ea_dummy = {
    id: "dummy",
    description: "Dummy dataset",

    views: {
      heatmaps: {
        url: "empty_8bui.tif",
        parse: ea_datasets_tiff_url,
        band: 0
      }
    },
  };

  await ea_dummy.views.heatmaps.parse.call(ea_dummy);

  ea_canvas_setup(ea_dummy);

  (async () => {
    for (var id of datasets_layers) {
      let ds = collection.find(d => d.id === id);
      if (typeof ds !== 'undefined') await ea_datasets_load(ds);
    }

    ea_overlord({
      type: "mode",
      target: location.get_query_param('mode'),
      caller: "ea_init_again",
    });
  })();

  ea_ui_app_loading(false);
};

/*
 * An analysis is really a new dataset "ds" consisting of a selection of
 * weighed datasets.
 */

function ea_analysis(collection) {
  const t0 = performance.now();

  // we use a dataset as a template just for code-clarity.
  //
  const tmp = ea_dummy;

  if (!tmp.raster) {
    console.warn("No raster template. Return.");
    return null;
  }

  const ds = {
    id: `analysis-${Date.now()}`,
    domain: [0,1],
    width: tmp.width,
    height: tmp.height,
    raster: new Float32Array(tmp.raster.length),
    nodata: -1,
    color_scale: ea_default_color_scheme,
  };

  ea_canvas.style['opacity'] = (collection.length === 0) ? 0 : 1;

  if (!collection.length) return tmp;

  const scales = collection.map(d => ea_datasets_scale_fn(d));

  const full_weight = collection
        .reduce((a,c,k) => ((c.datatype === "boolean") ? a : c.weight + a), 0);

  for (var i = 0; i < ds.raster.length; i++) {
    const t = collection.reduce((a, c, k, l) => {
      if (a === -1) return -1;

      const v = c.raster[i];
      const d = c.domain;

      if (c.weight === Infinity)
        return (v === c.nodata) ? a : scales[k](v) * full_weight;

      let sv = scales[k](v);

      sv = (sv < 0 || sv > 1) ? c.nodata : sv;

      if (sv === c.nodata) return -1;

      return (sv * c.weight) + a;
    }, 0);

    ds.raster[i] = (t === -1) ? t : t / full_weight;
  }

  console.log("Finished ea_analysis in:", performance.now() - t0);

  return ds;
};

function ea_active_heatmaps(category = 'eai') {
  var cat = d => category === 'eai' ? true : d.category === category;

  return ea_datasets_collection
    .filter(d => d.active && cat(d)); // && d.raster
};

async function ea_overlord(msg) {
  if (!msg) throw "Argument Error: Overlord: I have nothing to do!";
  if (typeof msg.caller === 'undefined' || !msg.caller) throw "Argument Error: Overlord: Who is the caller?";

  let heatmaps_layers;
  let datasets_layers;

  let mode = location.get_query_param('mode');
  let heatmaps_layers_param = location.get_query_param('heatmaps-layers');
  let datasets_layers_param = location.get_query_param('datasets-layers');

  if (!heatmaps_layers_param) {
    heatmaps_layers = ["eai", "supply", "demand"];
    history.replaceState(
      null, null,
      location.set_query_param('heatmaps-layers', heatmaps_layers.toString())
    );
  } else {
    heatmaps_layers = heatmaps_layers_param.split(',');
  }

  if (!datasets_layers_param) {
    datasets_layers = [];
    history.replaceState(
      null, null,
      location.set_query_param('datasets-layers', datasets_layers.toString())
    );
  } else {
    datasets_layers = datasets_layers_param.split(',');
  }

  if (!mode) {
    mode = 'heatmaps';
    history.replaceState(null, null, location.set_query_param('mode', mode));
  }

  switch (msg.type) {
  case "init": {
    console.log("Overlord: init");
    break;
  }

  case "mode": {
    var t = msg.target;

    if (t === "heatmaps") {
      ea_layers_heatmaps(heatmaps_layers);

      datasets_layers.forEach(i => {
        var x;

        if (x = ea_datasets_collection.find(d => d.id === i))
          (typeof x.views.polygons !== 'undefined') ? ea_map_unload(ea_map, x.id) : null;
      });

      ea_controls_blur_control_groups(false);

      ea_canvas_plot(ea_analysis(ea_active_heatmaps(heatmaps_layers[0])));
    }

    else if (t === "datasets") {
      ea_layers_datasets(datasets_layers);

      datasets_layers.forEach(i => {
        var x;

        if (x = ea_datasets_collection.find(d => d.id === i)) {
          if (typeof x.views.polygons !== 'undefined')
            x.views.polygons.parse.call(x);
        }
      });

      ea_controls_blur_control_groups(true);

      ea_canvas_plot(ea_dummy); // TODO: this is wrong.
    }

    else {
      throw `Argument Error: Overlord: Could not set/find the mode '${mode}'.`;
    }

    history.replaceState(null, null, location.set_query_param('mode', t));

    break;
  }

  case "dataset": {
    const ds = msg.target;

    (ds.active) ?
      datasets_layers.unshift(ds.id) :
      datasets_layers.remove(ds.id);

    datasets_layers = datasets_layers.unique();

    if (mode === "heatmaps") {
      ea_layers_heatmaps(heatmaps_layers);

      if (typeof ds.views.heatmaps !== "undefined")
        (ds.active) ? await ds.views.heatmaps.parse.call(ds) : null

      ea_canvas_plot(ea_analysis(ea_active_heatmaps(heatmaps_layers[0])));
    }

    else if (mode === "datasets") {
      ea_layers_datasets(datasets_layers);

      if (typeof ds.views.polygons !== "undefined")
        (ds.active) ? await ds.views.polygons.parse.call(ds) : ea_map_unload(ea_map, ds.id);
    }

    else {
      throw `Argument Error: Overlord: Could not set the mode ${mode}`;
    }

    history.replaceState(
      null, null,
      location.set_query_param('heatmaps-layers', heatmaps_layers.toString())
    );

    history.replaceState(
      null, null,
      location.set_query_param('datasets-layers', datasets_layers.toString())
    );

    break;
  }

  case "sort": {
    if (mode === "heatmaps") {
      ea_canvas_plot(ea_analysis(ea_active_heatmaps(msg.layers[0])));

      ea_controls_mingle(msg.layers);

      history.replaceState(
        null, null,
        location.set_query_param('heatmaps-layers', msg.layers.toString())
      );
    }

    else if (mode === "datasets") {
      ea_layers_update_datasets(msg.layers);

      history.replaceState(
        null, null,
        location.set_query_param('datasets-layers', msg.layers.toString())
      );
    }

    else {
      throw `Argument Error: Overlord: Could set the mode ${mode}`;
    }

    break;
  }

  default:
    throw `Overlord: I don't know message type '${msg.type}'`
  }
};
