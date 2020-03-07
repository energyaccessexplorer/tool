/*
 * ea_analysis
 *
 * Given a list of DS's, their weights, domains and scaling functions; create a
 * new DS whose raster is a "normalised weighted average".
 *
 * @param "list" []DS. List of datasets to be processed.
 *
 * @param "type" string. That can be:
 *   - ID of a dataset, or
 *   - an index name
 *
 * returns DS to be plotted onto a canvas
 */

function ea_analysis(type) {
  const t0 = performance.now();

  const boundaries = DST['boundaries'];
  let list = ea_analysis_datasets(type);

  const it = new Float32Array(list.length ? boundaries.raster.data.length: 0).fill(-1);

  // There's nothing interesting about an analysis with only filters. Also,
  // filters return 1 so an silly (single-valued) analysis would be plotted.
  //
  if (list.every(d => ea_filters.includes(d.analysis_scale(type)))) return it;

  // Add up how much non-compound indexes datasets will account for. Then, just
  // below, these values will be split into equal proportions of the total
  // analysis.
  //
  const singles = {};
  for (let i in ea_indexes) if (!ea_indexes[i].compound) singles[i] = 0;

  const tots = list.reduce((a,d) => {
    if (ea_filters.indexOf(d.analysis_scale(type)) > -1) ;
    else if (d.index) a[d.index] += d.weight;

    return a;
  }, singles);

  for (let s in singles) if (singles[s] === 0) delete singles[s];

  const weights = {};
  list.forEach(d => {
    if (ea_filters.indexOf(d.analysis_scale(type)) > -1) weights[d.id] = 0;
    else {
      switch (type) {
      case "ani":
        weights[d.id] = d.index ? d.weight / Object.keys(tots).reduce((a,c) => tots[c] + a, 0) : 0;
        break;

      default:
        weights[d.id] = d.index ? d.weight / (tots[d.index] * Object.keys(singles).length) : 0;
        break;
      }
    }
  });

  // If the total weight is 0, ciao.
  //
  if (Object.keys(weights).reduce((a,c) => (weights[c] || 0) + a, 0) === 0)
    return it;

  // Each dataset has a different scaling function. We cache these to optimise
  // the huge loop we are about to do.
  //
  const afns = list.map(d => d.analysis_fn(type));

  // The values will be normalised. Initialise the values:
  //
  let min = 1;
  let max = 0;

  // NOTICE: if there is only one dataset which has no weight in calculations
  // (boundaries with key-delta scale function, for example), we do NOT want an
  // fully black raster to show as the result. We return the transparent raster.
  // instead.
  //
  const full_weight = list
        .reduce((a,c) => ((c.analysis_scale(type) === "key-delta") ? a : c.weight + a), 0);

  let nr = list.find(l => !maybe(l, 'raster', 'data'));
  if (nr) {
    console.warn(`Dataset '${nr.id}' has no raster.data (yet).`,
                 "Skipping this analysis since I suspect a race condition.",
                 "Telling O to wait for it...");

    O.wait_for(
      _ => nr.raster.data,
      _ => ea_plot_active_analysis(U.output).then(raster => ea_indexes_graphs(raster))
    );

    return it;
  }

  if (list.length === 1 && full_weight === 0) return it;

  for (let i = 0; i < it.length; i += 1) {
    let a = 0;

    for (let j = 0; j < list.length; j += 1) {
      let c = list[j];

      // For the rest of the datasets, we 'annihilate' points that are already
      // as -1 (or nodata) since we wouldn't know what value to assign for the
      // analysis. In other words, if a dataset has a point has nodata, that
      // point is useless for the analysis as it is incomparable with other
      // datasets.
      //
      // We assume they have been clipped out.
      //
      if (a === -1) continue;

      const v = c.raster.data[i];
      if (v === c.raster.nodata) {
        a = -1; continue;
      }

      const sv = afns[j](v);

      // Three options: within domain/range, clipping or clamping. This is where
      // the clipping happens. The clamping was done by the scaling function
      // above.
      //
      // If the scaling function clamped, the following will not happen. But if
      // the value falls outside our analysis domain, we clip it (-1 nodata).
      //
      if (sv < 0 || sv > 1) {
        a = -1; continue;
      }

      const w = weights[c.id];
      a = w ? (sv * w) + a : a;
    }

    // Record the new min/max values:
    //
    if (a !== -1) {
      if (a > max) max = a;
      if (a < min) min = a;
    }

    it[i] = a;
  }

  var f = d3.scaleLinear().domain([min,max]).range([0,1]);

  for (let i = 0; i < it.length; i += 1) {
    const r = it[i];
    it[i] = (r === -1) ? -1 : f(r);
  }

  log("Finished ea_analysis in:", performance.now() - t0, weights, tots);

  return it;
};

function ea_analysis_datasets(type) {
  return DS.list
    .filter(d => {
      return d.on
        && d.raster
        && d.analysis
        && d.analysis.indexes.find(i => i.index === type);
    })
    .filter(d => {
      // Discard datasets which have no analysis_fn (eg. boundaries).
      //
      if (typeof d.analysis_fn(type) !== 'function') return false;

      // Discard datasets which are filters and use the entire domain (useless).
      //
      if (ea_filters.includes(d.analysis_scale(type)) &&
          (d._domain[0] === d.raster.domain.min &&
           d._domain[1] === d.raster.domain.max))
        return false;

      return true;
    })
    .sort((x,y) => {
      // Place the filters first. They will return -1's sooner and make our
      // loops faster.
      //
      return (ea_filters.includes(x.analysis_scale(type))) ? 1 : -1;
    })
};

/*
 * ea_plot_active_analysis
 *
 * Utility.
 *
 * @param "type" string. ID or index name.
 * @param "cs" string. Default color_theme to 'ea'.
 */

async function ea_plot_active_analysis(type, cs = 'ea') {
  const raster = ea_analysis(type);
  ea_plot_outputcanvas(raster);

  const index = ea_indexes[type];

  if (!type || !index) {
    console.warn("ea_plot_active_analysis: Too early...",
                 "This is an initialisation bug.",
                 "Index type:", type);

    return raster;
  }

  qs('#canvas-output-select').value = type;
  qs('#index-graphs-title').innerText = index['name'];
  qs('#index-graphs-description').innerText = index['description'];

  // 'animate' is set to false on mapbox's configuration, since we don't want
  // mapbox eating the CPU at 60FPS for nothing.
  //
  let canvas_source = MAPBOX.getSource('output-source');
  if (canvas_source) {
    canvas_source.raster = raster;

    canvas_source.play();
    canvas_source.pause();
  }

  return raster;
};

async function raster_to_tiff(type) {
  const b = DST['boundaries'];

  const raster = await ea_analysis(type);

  const scale = d3.scaleLinear().domain([0,1]).range([0,254]);
  const fn = function(x) {
    if (x === -1) return 255;
    return scale(x);
  };

  const arr = new Uint8Array(raster.length).fill(255);
  for (let i = 0; i < raster.length; i += 1)
    arr[i] = fn(raster[i]);

  const metadata = {
    ImageWidth: b.raster.width,
    ImageLength: b.raster.height,
    ResolutionUnit: "1",
    XPosition: b.vectors.bounds[0],
    YPosition: b.vectors.bounds[1],
    ModelTiepoint: [ 0, 0, 0, b.vectors.bounds[0], b.vectors.bounds[3], 0 ],
    XResolution: "1",
    YResolution: "1",
    GDAL_NODATA: "255",
    ModelPixelScale: [(b.vectors.bounds[2] - b.vectors.bounds[0]) / b.raster.width, (b.vectors.bounds[3] - b.vectors.bounds[1]) / b.raster.height, 0]
  };

  const arrayBuffer = await GeoTIFF.writeArrayBuffer(arr, metadata);

  let blob = new Blob([arrayBuffer], { type: "application/octet-stream;charset=utf-8" });

  fake_download(URL.createObjectURL(blob), `energyaccessexplorer-${type}.tif`);

  return blob;
};
