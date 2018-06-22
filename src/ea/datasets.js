function ea_datasets_scale_fn(ds) {
  var s = null;
  var r = ds.range || [0,1];
  var d = ds.domain || [0,1];
  var t = ds.tmp_domain;

  const lin = d3.scaleLinear()
        .domain(t || d)
        .range(r)

  switch (ds.scale) {
  case 'radio':
  case 'mobile':
  case 'livestock':
  case 'ironrooftop':
    s = (x) => (x === 255) ? -1 : lin(ea_districts[x][ds.scale]);
    break;

  case 'identity':
    s = d3.scaleIdentity()
      .domain(t || d)
      .range(r);
    break;

  case 'linear':
  default:
    s = lin.clamp(ds.clamp)
    break;
  }

  return s;
}

async function ea_datasets_load(ds,v) {
  ea_ui_dataset_loading(ds, true);

  await ds.parse.call(ds,v);

	ea_ui_dataset_loading(ds, false);
}

function ea_datasets_features(ds) {
  ea_client(ds, 'GET', null,
    (r) => {
      ds.features = r[0]['jsonb_build_object'].features;

      ea_map_load_features(
        ea_map,
        ds.features,
        ds.id,
        null
      );
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
      ds.symbol,
      null
    )
  }

  if (ds.features) load_em();
  else
    await ea_client(
      ds, 'GET', null,
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
    ds.raster = rasters[ds.band];

    ds.width = image.getWidth();
    ds.height = image.getHeight();

    ds.nodata = parseFloat(ds.tiff.fileDirectories[0][0].GDAL_NODATA);
  }

  return ds;
}

function ea_datasets_hexblob(hex) {
  var byteBuf = new Uint8Array(new ArrayBuffer(hex.length/2));

  for (var i = 0; i < hex.length; i += 2)
    byteBuf[i/2] = parseInt(hex.slice(i, i+2), 16);

  const blob = new Blob([byteBuf], {type: "image/tiff"});
  // ea_fake_download(blob);

  return blob;
}

async function ea_datasets_tiff_stream() {
  const ds = this;

  if (ds.raster) ;
  else {
    var data = null;

    await ea_client(ds, 'GET', null, (r) => data = r);

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
    var data = null;

    const payload = { };
    payload[ds.unit] = v || ds.init;

    await ea_client(ds, 'POST', payload, (r) => data = r);

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
  else await ea_datasets_tiff(ds, GeoTIFF.fromUrl, ds.url);

  return ds;
}

async function ea_datasets_districts_tiff() {
  await ea_datasets_tiff_url.call(this);

  ea_datasets_collection.forEach(d => {
    if (['radio', 'mobile', 'livestock', 'ironrooftop'].indexOf(d.id) > -1)
      d.raster = this.raster;
  })
}

function ea_datasets_districts() {
  d3.request('./data/districts-data.csv')
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
