function ea_datasets_scale_fn(ds, type) {
  let s = null;
  const d = (ds.heatmap.domain && [ds.heatmap.domain.min, ds.heatmap.domain.max]) || [0,1];
  const t = ds.tmp_domain;
  const v = ds.heatmap.scale;
  const o = ds.heatmap.scale_option;
  const r = ((typeof ds.invert !== 'undefined' && ds.invert.indexOf(type) > -1) ? [1,0] : [0,1]);

  const lin = d3.scaleLinear()
        .domain(t || d)
        .range(r)

  switch (v) {
  case 'key': {
    s = x => (!x || x === ds.nodata) ? -1 : lin(ea_districts[x][o]);
    break;
  }

  case 'identity': {
    s = d3.scaleIdentity()
      .domain(t || d)
      .range(r);
    break;
  }

  case 'linear':
  default: {
    s = lin.clamp(ds.heatmap.clamp)
    break;
  }
  }

  return s;
};

async function ea_datasets_load(ds, t) {
  if (!ds.id) throw `Argument Error: ${ds} does not look like a dataset`;

  ea_ui_dataset_loading(ds, true);

  if (!ds.heatmap.parse)
    console.error(ds.id, "does not have a #heatmap.parse function set!");

  await ds.heatmap.parse.call(ds);

  ds.color_scale_svg = ea_svg_color_gradient(ds.color_scale_fn);

	ea_ui_dataset_loading(ds, false);
};

async function ea_datasets_active(ds, v) {
  if (!ds || !ds.id) {
    console.warn(ds);
    throw `Argument Error: '${ds}' does not look like a dataset`;
  }

  if (ds.active = v) await ea_datasets_load(ds);

  ea_overlord({
    type: "dataset",
    target: ds,
    caller: "ea_datasets_active",
  });
};

async function ea_datasets_features(callback) {
  const ds = this;

  if (ds.features)
    callback();

  else {
    const endpoint = ds.polygons.endpoint;

    const url = endpoint.match('^http') ? endpoint :
          `${ea_path_root}data/${ea_ccn3}/${endpoint}`;

    await ea_client(
      url, 'GET', null,
      r => {
        switch (r.type) {
        case "Feature":
          ds.features = [r];
          break;

        case "FeatureCollection":
          ds.features = r.features;
          break;

        default:
          ea_ui_flash('error', 'Bad GeoJSON file', `'${ds.id}' fetched is not a "Feature" nor "FeatureCollection"`);
          ds.features = [];
          break;
        }

        callback.call(ds);
      }
    );
  }

  return ds;
};

async function ea_datasets_points() {
  return ea_datasets_features.call(this, _ => {
    ea_map_load_points({
      map: ea_map,
      features: this.features,
      cls: this.id,
      symbol: this.polygons.symbol,
      scale: 1
    })
  });
};

async function ea_datasets_polygons() {
  return ea_datasets_features.call(this, _ => {
    ea_map_load_features({
      map: ea_map,
      features: this.features,
      cls: this.id,
      scale: 1,
    });
  });
};

async function ea_datasets_tiff(ds, blob) {
  if (ds.raster) ;
  else {
    const tiff = await GeoTIFF.fromBlob(blob);
    const image = await tiff.getImage();
    const rasters = await image.readRasters();

    ds.tiff = tiff;
    ds.image = image;
    ds.raster = rasters[0];

    ds.width = image.getWidth();
    ds.height = image.getHeight();

    ds.nodata = parseFloat(ds.tiff.fileDirectories[0][0].GDAL_NODATA);
  }

  return ds;
};

function ea_datasets_hexblob(hex) {
  const byteBuf = new Uint8Array(new ArrayBuffer(hex.length/2));

  for (var i = 0; i < hex.length; i += 2)
    byteBuf[i/2] = parseInt(hex.slice(i, i+2), 16);

  const blob = new Blob([byteBuf], {type: "image/tiff"});
  // fake_download(blob);

  return blob;
};

async function ea_datasets_tiff_stream() {
  const ds = this;

  if (ds.raster) ;
  else {
    let data = null;

    await ea_client(`${ea_settings.database}/${ds.endpoint}`, 'GET', null, r => data = r);

    await ea_datasets_tiff(
      ds,
      (await ea_datasets_hexblob(data.tiff.slice(2))));
  }

  return ds;
};

async function ea_datasets_tiff_rpc_stream(v) {
  const ds = this;

  if (ds.raster) ;
  else {
    let data = null;

    const payload = { };
    payload[ds.unit] = v || ds.init;

    await ea_client(`${ea_settings.database}/${ds.endpoint}`, 'POST', payload, r => data = r);

    await ea_datasets_tiff(
      ds,
      (await ea_datasets_hexblob(data.tiff.slice(2))));
  }

  return ds;
};

async function ea_datasets_tiff_url() {
  const ds = this;

  if (ds.raster) return ds;

  const endpoint = ds.heatmap.endpoint;

  const url = endpoint.match('^http') ? endpoint :
    `${ea_path_root}data/${ea_ccn3}/${endpoint}`;

  await fetch(url)
    .then(ea_client_check)
    .then(r => r.blob())
    .then(b => ea_datasets_tiff(ds, b));

  return ds;
};

function ea_datasets_districts() {
  d3.request(`${ea_path_root}/data/${ea_ccn3}/districts-data.csv`)
    .mimeType("text/csv")
    .response(xhr => {
      ea_districts = d3.csvParse(xhr.responseText, d => {
        return {
          oid: +d.OBJECTID,
          district: d.District,
          region: d.Region,
          livestock: +d.Livestock,
          radio: +d.Radio,
          mobile: +d.Mobile,
          ironrooftop: +d.IronRooftop,
        }
      });

      ea_districts.unshift(null);
    }).get();
};
