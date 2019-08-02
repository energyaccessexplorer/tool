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
 *   - the shortname of an index: eai, ani, demand or supply. Some datasets behave
 *     differently depending on this.
 *
 * returns DS to be plotted onto a canvas
 */

function ea_analysis(list, type) {
  const t0 = performance.now();

  const it = new Float32Array(list[0] ? list[0].raster.data.length : 0).fill(-1);

  // Get smart on the filters:
  //
  // - Disregard datasets which have no scale_fn (eg. boundaries).
  // - Disregard datasets which are filters and use the entire domain (useless).
  // - Place the filters first. This will return -1's sooner and make our loops faster.
  //
  list = list
    .filter(d => {
      if (typeof d.scale_fn(type) !== 'function') return false;

      if (d.heatmap.scale === 'key-delta' &&
          (d.domain[0] === d.heatmap.domain.min && d.domain[1] === d.heatmap.domain.max)) return false;

      return true;
    })
    .sort((x,y) => x.heatmap.scale === "key-delta" ? -1 : 1);

  // Add up how much demand and supply datasets will account for. Then, just
  // below, these values will be split into 50-50 of the total analysis.
  //
  const tots = list
        .reduce((a,d) => {
          if (d.indexname) a[d.indexname] += d.weight;
          return a;
        }, { "supply": 0, "demand": 0 });

  const weights = {};

  list.forEach(d => {
    if (d.indexname)
      weights[d.id] = d.weight / (tots[d.indexname] * 2);
  });

  // Each dataset has a different scaling function. We cache these to optimise
  // the huge loop we are about to do.
  //
  const scales = list.map(d => d.scale_fn(type));

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
        .reduce((a,c) => ((c.heatmap.scale === "key-delta") ? a : c.weight + a), 0);

  if (list.length === 1 && full_weight === 0) return it;

  for (var i = 0; i < it.length; i += 1) {
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

      const sv = scales[j](v);

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

  for (var i = 0; i < it.length; i += 1) {
    const r = it[i];
    it[i] = (r === -1) ? -1 : f(r);
  }

  log("Finished ea_analysis in:", performance.now() - t0, weights, tots);

  return it;
};

/*
 * ea_plot_active_analysis
 *
 * Utility.
 *
 * @param "type" string. ID or indexname.
 * @param "cs" string. Default color_theme to 'ea'.
 */

async function ea_plot_active_analysis(type, cs = 'ea') {
  const list = ea_list_filter_type(type);

  const raster = await ea_analysis(list, type);
  ea_canvas_plot(raster);

  qs('#canvas-output-select').value = type;
  qs('#indexes-pane .index-graphs-title').innerText = ea_indexes[type]['name'];
  qs('#index-graphs-description').innerText = ea_indexes[type]['description'];

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
