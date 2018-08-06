function ea_datasets_scale_fn(ds) {
  let s = null;
  const r = ds.views.heatmaps.range || [0,1];
  const d = ds.views.heatmaps.domain || [0,1];
  const t = ds.tmp_domain;
  const v = ds.views.heatmaps.scale;
  const o = ds.views.heatmaps.scale_option;

  const lin = d3.scaleLinear()
        .domain(t || d)
        .range(r)

  switch (v) {
  case 'key':
    s = (x) => (x === 255) ? -1 : lin(ea_districts[x][o]);
    break;

  case 'identity':
    s = d3.scaleIdentity()
      .domain(t || d)
      .range(r);
    break;

  case 'linear':
  default:
    s = lin.clamp(ds.views.heatmaps.clamp)
    break;
  }

  return s;
}

async function ea_datasets_load(ds, t) {
  if (!ds.id) throw `Argument Error: ${ds} does not look like a dataset`;

  ea_ui_dataset_loading(ds, true);

  if (ds.views.heatmaps.url && ds.views.heatmaps.url.match(/\.tif$/))
    ds.views.heatmaps.parse = ea_datasets_tiff_url;

  if (ds.views.polygons && ds.views.polygons.symbol && !ds.views.polygons.parse)
    ds.views.polygons.parse = ea_datasets_points;

  await ds.views.heatmaps.parse.call(ds);

  ds.color_scale_svg = ea_svg_color_gradient(ds.color_scale_fn);

	ea_ui_dataset_loading(ds, false);
}

async function ea_datasets_active(ds, v) {
  if (!ds || !ds.id) {
    console.warn(ds);
    throw `Argument Error: '${ds}' does not look like a dataset`;
  }

  if (ds.active = v)
    await ea_datasets_load(ds);
  else
    if (typeof ds.views.polygons !== 'undefined') ;

  ea_overlord({
    type: "dataset",
    target: ds,
    caller: "ea_datasets_active",
  });
}

function ea_datasets_features(ds) {
  ea_client(ds.endpoint, 'GET', null,
    (r) => {
      ds.features = r[0]['jsonb_build_object'].features;

      ea_map_load_features({
        map: ea_map,
        features: ds.features,
        cls: ds.id,
        scale: 1,
      });
    }
  );
}

async function ea_datasets_points() {
  const ds = this;

  const load_em = () => {
    ea_map_load_points(
      ea_map,
      ds.features,
      ds.id,
      ds.views.polygons.symbol,
      1
    )
  }

  if (ds.features) load_em();
  else
    await ea_client(
      `${ea_settings.database}/${ds.views.polygons.endpoint}`, 'GET', null,
      (r) => {
        ds.features = r[0]['jsonb_build_object'].features;
        load_em();
      }
    );

  return ds;
}

async function ea_datasets_tiff(ds, method, payload) {
  if (ds.raster) ;
  else {
    const tiff = await method(payload);
    const image = await tiff.getImage();
    const rasters = await image.readRasters();

    ds.tiff = tiff;
    ds.image = image;
    ds.raster = rasters[ds.views.heatmaps.band];

    ds.width = image.getWidth();
    ds.height = image.getHeight();

    ds.nodata = parseFloat(ds.tiff.fileDirectories[0][0].GDAL_NODATA);
  }

  return ds;
}

function ea_datasets_hexblob(hex) {
  const byteBuf = new Uint8Array(new ArrayBuffer(hex.length/2));

  for (var i = 0; i < hex.length; i += 2)
    byteBuf[i/2] = parseInt(hex.slice(i, i+2), 16);

  const blob = new Blob([byteBuf], {type: "image/tiff"});
  // fake_download(blob);

  return blob;
}

async function ea_datasets_tiff_stream() {
  const ds = this;

  if (ds.raster) ;
  else {
    let data = null;

    await ea_client(`${ea_settings.database}/${ds.endpoint}`, 'GET', null, (r) => data = r);

    await ea_datasets_tiff(
      ds,
      GeoTIFF.fromBlob,
      (await ea_datasets_hexblob(data[0]['tiff'].slice(2))));
  }

  return ds;
}

async function ea_datasets_tiff_rpc_stream(v) {
  const ds = this;

  if (ds.raster) ;
  else {
    let data = null;

    const payload = { };
    payload[ds.unit] = v || ds.init;

    await ea_client(`${ea_settings.database}/${ds.endpoint}`, 'POST', payload, (r) => data = r);

    await ea_datasets_tiff(
      ds,
      GeoTIFF.fromBlob,
      (await ea_datasets_hexblob(data[0]['tiff'].slice(2))));
  }

  return ds;
}

async function ea_datasets_tiff_url() {
  const ds = this;

  if (ds.raster) ;
  else await ea_datasets_tiff(ds, GeoTIFF.fromUrl, `${ea_path_root}data/${ea_ccn3}/${ds.views.heatmaps.url}`);

  return ds;
}

function ea_datasets_districts() {
  d3.request(`${ea_path_root}/data/${ea_ccn3}/districts-data.csv`)
    .mimeType("text/csv")
    .response((xhr) => {
      ea_districts = d3.csvParse(xhr.responseText, (d) => {
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
}
