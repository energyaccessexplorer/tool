function ea_opacity_tweak() {
  const dl = location.get_query_param('datasets-layers').split(',');

  const tweak = (dl.length === 1 &&
                 (dl[0] === 'subcounties' || dl[0] === 'districts'));

  ea_mapbox ?
    ea_mapbox.setPaintProperty('canvas-layer', 'raster-opacity', (tweak ? 0.2 : 1)) :
  (ea_canvas ? ea_canvas.style.opacity = (tweak ? 0.2 : 1) : null)
};

async function ea_init(tree, collection, bounds) {
  let datasets_layers_param = location.get_query_param('datasets-layers');
  let datasets_layers;

  if (!datasets_layers_param) datasets_layers = [];
  else datasets_layers = datasets_layers_param.split(',');

  tree.forEach(cat => cat.subcategories.forEach(sub => sub.datasets.filter(d => {
    const ds = collection.find(x => x.id === d.id);

    if (!ds) {
      console.warn(`Dataset '${d.id}' not found:`, ds);
      return false;
    }

    ds.invert = d.invert;
    ds.category = cat.name;
  })));

  collection.forEach(d => {
    if (d.configuration && d.configuration.mutant) {
      let m = collection.find(x => x.id === d.configuration.mutant_targets[0]);

      d.polygons = m.polygons;
      d.heatmap = m.heatmap;
    }

    d.weight = d.weight || 2;
    d.active = (datasets_layers.indexOf(d.id) > -1);

    if (typeof d.heatmap.color_scale === 'undefined')
      d.heatmap.color_scale = ea_default_color_scheme;

    if (d.heatmap.endpoint)
      d.heatmap.parse = ea_datasets_tiff_url;

    if (d.polygons && d.polygons.shape_type === 'points')
      d.polygons.parse = ea_datasets_points;

    if (d.polygons && d.polygons.shape_type === 'polygons')
      d.polygons.parse = ea_datasets_polygons;

    d.color_scale_fn = function() {
      return d3.scaleLinear()
        .domain(plotty.colorscales[d.heatmap.color_scale].positions)
        .range(plotty.colorscales[d.heatmap.color_scale].colors)
        .clamp(d.heatmap.clamp || false);
    }
  });

  ea_controls_tree(tree, collection);

  ea_dummy = {
    id: "dummy",
    description: "Dummy dataset",

    heatmap: {
      endpoint: "districts.tif",
      parse: ea_datasets_tiff_url,
    },
  };

  await ea_dummy.heatmap.parse.call(ea_dummy);

  ea_dummy.raster = new Uint16Array(ea_dummy.width * ea_dummy.height).fill(ea_dummy.nodata);

  ea_layout_map(bounds, [ea_dummy.width, ea_dummy.height]);
  ea_map_setup(bounds);

  ea_canvas_setup(ea_dummy);

  (async _ => {
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

async function ea_country_init(ccn3) {
  let country = null;
  let it = null;

  await ea_client(
    `${ea_settings.database}/countries?ccn3=eq.${ccn3}`,
    'GET', 1,
    r => country = r
  );

  await ea_client(
    `${ea_settings.database}/datasets?country_id=eq.${country.id}&select=*,heatmap_file(*),polygons_file(*),category(*)`, 'GET', null,
    r => {
      const collection = r.map(e => {
        let heatmap = e.category.heatmap;
        if (heatmap && e.heatmap_file) heatmap.endpoint = e.heatmap_file.endpoint;

        let polygons = e.category.polygons;
        if (polygons && e.polygons_file) polygons.endpoint = e.polygons_file.endpoint;

        if (e.category.configuration && e.category.configuration.mutant) console.log('mutant: ', e.category_name, e.id);
        else if (!e.heatmap_file && !e.polygons_file) return undefined;

        let help = null;

        if (e.category.metadata && (e.category.metadata.why || e.category.metadata.what)) {
          help = {};

          help['why'] = e.category.metadata.why;
          help['what'] = e.category.metadata.what;
        }

        return {
          "name_long": e.category.name_long,
          "description": e.category.description,
          "description_long": e.category.description_long,
          "heatmap": heatmap,
          "polygons": polygons,
          "id": e.category.name,
          "unit": e.category.unit,
          "metadata": e.metadata,
          "configuration": e.category.configuration,
          "help": help
        };
      });

      const datasets_collection = collection.filter(d => d);

      ea_datasets_districts(
        datasets_collection
          .find(d => d.id === 'districts' || d.id === 'subcounties'));

      it = {
        category_tree: country.category_tree,
        datasets_collection: datasets_collection,
        country_bounds: country.bounds
      };
    });

  return it;
};

/*
 * An analysis is really a new dataset "ds" consisting of a selection of
 * weighed datasets.
 */

function ea_analysis(type) {
  const t0 = performance.now();

  const collection = ea_active_heatmaps(type);

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

  if (!collection.length) return tmp;

  const scales = collection.map(d => ea_datasets_scale_fn(d, type));

  const full_weight = collection
        .reduce((a,c,k) => ((c.heatmap.scale === "key-delta") ? a : c.weight + a), 0);

  for (var i = 0; i < ds.raster.length; i++) {
    const t = collection.reduce((a, c, k, l) => {
      // On this reduce loop, we 'annihilate' points that come as -1
      // (or nodata) since we wouldn't know what value to assign for
      // the analysis. We assume they have been clipped out.
      //
      if (a === -1) return -1;

      const v = c.raster[i];
      if (v === c.nodata) return -1;

      // If the scaling function clamped, the following wont
      // happen. But if there the values are outside our analysis
      // domain, we assume clipping by setting -1 (nodata).
      //
      const sv = scales[k](v);
      if (sv < 0 || sv > 1) return -1;

      if (c.heatmap.scale === "key-delta")
        return a;
      else
        return (sv * c.weight) + a;
    }, 0);

    ds.raster[i] = (t === -1) ? t : t / full_weight;
  }

  console.log("Finished ea_analysis in:", performance.now() - t0);

  return ds;
};

function ea_active_heatmaps(type) {
  let cat;

  if (['supply', 'demand'].indexOf(type) > -1)
    cat = d => d.category === type;

  else if (['eai', 'ani'].indexOf(type) > -1)
    cat = d => true;

  else
    cat = d => d.id === type;

  return ea_datasets_collection
    .filter(d => d.active && cat(d));
};

function ea_draw_first_active_nopolygons(coll) {
  let rd = null;

  for (let t of coll) {
    let x = ea_datasets_collection.find(d => d.id === t && !d.polygons);
    if (x) { rd = x; break; }
  }

  if (rd) ea_canvas_plot(ea_analysis(rd.id));
  else ea_canvas_plot(ea_analysis(ea_dummy));
};

function ea_sort_canvas_svg(coll) {
  const head = ea_datasets_collection.find(d => d.id === coll[0]);

  if (!head) return;

  const maparea = document.querySelector('#maparea');

  const svg = maparea.querySelector('#svg-map');
  const mbc = maparea.querySelector('#mapbox-container');

  if (head.polygons) maparea.insertBefore(mbc, svg)
  else maparea.insertBefore(svg, mbc)
};

async function ea_overlord(msg) {
  if (!msg) throw "Argument Error: Overlord: I have nothing to do!";
  if (typeof msg.caller === 'undefined' || !msg.caller) throw "Argument Error: Overlord: Who is the caller?";

  let heatmaps_layers;
  let datasets_layers;

  let mode = location.get_query_param('mode');
  let heatmaps_layers_param = location.get_query_param('heatmaps-layers');
  let datasets_layers_param = location.get_query_param('datasets-layers');

  /* TODO: remove any {datasets}_layers that are not in the collection */

  if (Object.keys(ea_indexes).indexOf(heatmaps_layers_param) > -1) {
    heatmaps_layers = heatmaps_layers_param;
  } else {
    heatmaps_layers = "eai";
    history.replaceState(
      null, null,
      location.set_query_param('heatmaps-layers', heatmaps_layers)
    );
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
    /* TODO: these are the global objects. Fix it: remove. */

    ea_ccn3 = location.get_query_param('ccn3');
    ea_map = null;
    ea_plot = null;
    ea_datasets_collection = null;
    ea_mapbox = null;
    ea_dummy = null;
    ea_canvas = null;

    console.log("EA Overlord: init!");

    const it = await ea_country_init(ea_ccn3);
    ea_datasets_collection = it.datasets_collection;

    ea_views_init();
    ea_layers_init();

    ea_init(it.category_tree, it.datasets_collection, it.country_bounds)

    break;
  }

  case "mode": {
    var t = msg.target;

    if (t === "heatmaps") {
      ea_layers_heatmaps(heatmaps_layers);

      datasets_layers.forEach(i => {
        var x;

        if (x = ea_datasets_collection.find(d => d.id === i)) {
          if (typeof x.polygons !== 'undefined') {
            ea_mapbox.setLayoutProperty(i, 'visibility', 'none');
          }
        }
      });

      ea_canvas_plot(ea_analysis(heatmaps_layers));
    }

    else if (t === "datasets") {
      ea_layers_datasets(datasets_layers);

      datasets_layers.forEach(i => {
        var x;

        if (x = ea_datasets_collection.find(d => d.id === i)) {
          if (x.polygons) x.polygons.parse.call(x);
        }
      });

      ea_draw_first_active_nopolygons(datasets_layers);
    }

    else {
      throw `Argument Error: Overlord: Could not set/find the mode '${mode}'.`;
    }

    history.replaceState(null, null, location.set_query_param('mode', t));

    break;
  }

  case "dataset": {
    const ds = msg.target;

    ds.active ?
      datasets_layers.unshift(ds.id) :
      datasets_layers.splice(datasets_layers.indexOf(ds.id), 1); // REMOVE()

    datasets_layers = [...new Set(datasets_layers)]; // UNIQUE()

    if (mode === "heatmaps") {
      ea_layers_heatmaps(heatmaps_layers);

      if (typeof ds.heatmap !== "undefined")
        ds.active ? await ds.heatmap.parse.call(ds) : null

      ea_canvas_plot(ea_analysis(heatmaps_layers));
    }

    else if (mode === "datasets") {
      ea_layers_datasets(datasets_layers);

      if (ds.polygons) {
        if (ds.active)
          await ds.polygons.parse.call(ds);
        else
          if (ea_mapbox.getSource(ds.id)) ea_mapbox.setLayoutProperty(ds.id, 'visibility', 'none');
      }

      ea_draw_first_active_nopolygons(datasets_layers);
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

    ea_opacity_tweak(datasets_layers);

    break;
  }

  case "heatmap": {
    if (mode === "heatmaps") {
      ea_canvas_plot(ea_analysis(msg.heatmap));

      history.replaceState(
        null, null,
        location.set_query_param('heatmaps-layers', msg.heatmap)
      );
    }

    else {
      throw `Argument Error: Overlord: Could set the mode ${mode}`;
    }

    break;
  }

  case "sort": {
    if (mode === "datasets") {
      ea_layers_update_datasets(msg.layers);

      history.replaceState(
        null, null,
        location.set_query_param('datasets-layers', msg.layers.toString())
      );

      ea_draw_first_active_nopolygons(msg.layers);
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
