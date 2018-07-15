async function ea_init(tree, collection, bounds) {
  const preload_list = [];
  const active_list = [];

  tree.forEach(a => a.subcategories.forEach(b => b.datasets.filter(c => {
    const ds = collection.find(d => d.id === c.id);

    ds.band = c.band || 0;
    ds.active = (c.active === true) || false;
    ds.weight = c.weight || 2;

    c.preload ? preload_list.push(c.id) : null;
    c.active  ? active_list.push(c.id) : null;
  })));

  ea_controls_tree(tree, collection);

  (async () => {
    for (var id of active_list)
      await ea_datasets_activate(collection.find(d => d.id === id), true);

    for (var id of preload_list)
      await ea_datasets_load(collection.find(d => d.id === id));
  })();

  ea_map_setup(bounds);

  const dummy = collection.find(d => d.id === "dummy");
  await dummy.parse();
  ea_canvas_setup(dummy);

  ea_ui_app_loading(false);
}

/*
 * An analysis is really a new dataset "ds" consisting of a selection of
 * weighed datasets.
 */

function ea_analysis() {
  const c = ea_datasets_collection;
  const t0 = performance.now();

  // we use a dataset as a template just for code-clarity.
  //
  const tmp = c.find(d => d.id === 'dummy');

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
    color_scale: "jet",
  };

  const filtered = c.filter(d => (d.active && d.raster));

  ea_canvas.style['opacity'] = (filtered.length === 0) ? 0 : 1;

  if (!filtered.length) return tmp;

  const scales = filtered.map(d => ea_datasets_scale_fn(d));

  const full_weight = filtered.reduce(
    (a,c,k) => ((c.datatype === "boolean") ? a : c.weight + a), 0);

  for (var i = 0; i < ds.raster.length; i++) {
    const t = filtered.reduce((a, c, k, l) => {
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
}

function ea_fake_download(blob) {
  const a = document.createElement('a');
  document.body.appendChild(a);

  a.style = "display:none;";

  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = "ea_download";
  a.click();

  window.URL.revokeObjectURL(url);
}
