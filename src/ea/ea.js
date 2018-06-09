function ea_plot(ds) {
  if (!ds) return;

  var canvas = ea_canvas;

  const plot = new plotty.plot({
    canvas,
    data: ds.raster,
    width: ds.width,
    height: ds.height,
    domain: ds.domain,
    noDataValue: ds.nodata,
    colorScale: "bluered"
  });

  plot.render();

  return plot;
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

async function ea_dataset_load(ds,v) {
  ea_dataset_loading(ds, true);

  await ds.parse(v);

	ea_dataset_loading(ds, false);
}

async function ea_lazy_load_datasets(array) {
  for (var ds of array)
    await ea_dataset_load(ds);
}

async function ea_dataset_tiff(ds, method, payload) {
  if (!ds.raster || !ds.image) {
    const tiff = await method(payload);
    const image = await tiff.getImage();
    const rasters = await image.readRasters();

    ds.tiff = tiff;
    ds.image = image;
    ds.raster = rasters[ds.band];

    ds.width = image.getWidth();
    ds.height = image.getHeight();

    ds.nodata = parseFloat(ds.tiff.fileDirectories[0][0].GDAL_NODATA);
  }

  return ds;
}

async function ea_dataset_tiff_stream(ds, data) {
  if (!ds.raster || !ds.image) {
    var hex = data[0]['tiff'].slice(2);
    var byteBuf = new Uint8Array(new ArrayBuffer(hex.length/2));

    for (var i = 0; i < hex.length; i += 2)
      byteBuf[i/2] = parseInt(hex.slice(i, i+2), 16);

    // ea_fake_download(new Blob([byteBuf], {type: "image/tiff"}));

    await ea_dataset_tiff(ds, GeoTIFF.fromBlob, (new Blob([byteBuf], {type: "image/tiff"})));
  }

  return ds;
}

async function ea_dataset_tiff_url(ds) {
  if (!ds.raster || !ds.image) {
  await ea_dataset_tiff(ds, GeoTIFF.fromUrl, ds.url);
  }

  return ds;
}

function ea_init() {
  var q = d3.queue();

  for (var ds of ea_datasets) {
    if (ds.id === "dummy") {
      q.defer(async function(cb) {
        await ds.parse();
        ea_app_loading(false);
        cb(null);
      });
    }
  }

  q.awaitAll(error => { });
}
