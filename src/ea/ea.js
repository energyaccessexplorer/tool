async function ea_init() {
  (async () => {
    const l = ea_datasets_collection
          .slice(1)
          .filter((d) => d.preload || d.active);

    if (l.length)
      for (var ds of l) {
        if (ds.preload)
          await ea_datasets_load(ds);
        if (ds.active)
          await ea_datasets_activate(ds, true);
      }
  })();

  const dummy = ea_datasets_collection.find(d => d.id === "dummy");
  await dummy.parse();
  ea_canvas_setup(dummy);
  ea_ui_app_loading(false);
}

/*
 * An analysis is really a new dataset "ds" consisting of a selection of
 * weighed datasets.
 */

function ea_analysis() {
  var t0 = performance.now();

  // we use a dataset as a template just for code-clarity.
  //
  var tmp = ea_datasets_collection.find(d => d.id === 'dummy');

  if (!tmp.raster) {
    console.warn("No raster template. Return.");
    return null;
  }

  var ds = {
    id: `analysis-${Date.now()}`,
    domain: [0,1],
    width: tmp.width,
    height: tmp.height,
    raster: new Float32Array(tmp.raster.length),
    nodata: -1,
    color_scale: "jet",
  };

  var filtered = ea_datasets_collection.filter(d => (d.active && d.raster));

  ea_canvas.style['opacity'] = (filtered.length === 0) ? 0 : 1;

  if (!filtered.length) return tmp;

  var scales = filtered.map(d => ea_datasets_scale_fn(d));

  var full_weight = filtered.reduce(
    (a,c,k) => ((c.datatype === "boolean") ? a : c.weight + a), 0);

  for (var i = 0; i < ds.raster.length; i++) {
    var t = filtered.reduce((a, c, k, l) => {
      if (a === -1) return -1;

      var v = c.raster[i];
      var d = c.domain;

      if (c.weight === Infinity)
        return (v === c.nodata) ? a : scales[k](v) * full_weight;

      var sv = scales[k](v);

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
  var a = document.createElement('a');
  document.body.appendChild(a);

  a.style = "display:none;";

  var url = URL.createObjectURL(blob);
  a.href = url;
  a.download = "ea_download";
  a.click();

  window.URL.revokeObjectURL(url);
}
