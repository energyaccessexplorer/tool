async function ea_init() {
  (async () => {
    var l = ea_datasets
        .slice(1)
        .filter((d) => d.preload)

    for (var d of l) await ea_datasets_load(d);
  })();

  const dummy = ea_datasets.find(d => d.id === "dummy");
  await dummy.parse();
  ea_canvas_setup(dummy);
  ea_ui_app_loading(false);
}

/*
 * An analysis is really a new dataset "ds" consisting of a selection of
 * weighed datasets.
 */

function ea_analysis() {
  // we use a dataset as a template just for code-clarity.
  //
  var tmp = ea_datasets.find(d => d.id === 'dummy');

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
    nodata: -1
  };

  var filtered = ea_datasets.filter(d => (d.active && d.raster));

  ea_canvas.style['opacity'] = (filtered.length === 0) ? 0 : 1;

  var scales = filtered.map(d => {
    return (d.scalefn().clamp) ?
      d.scalefn().clamp(ds.clamp) :
      d.scalefn();
  })

  var full_weight = filtered.reduce((a,c,k) => ((c.datatype === "boolean") ? a : c.weight + a), 0);

  var n1 = performance.now();

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

  console.log(performance.now() - n1);

  return ds;
}
