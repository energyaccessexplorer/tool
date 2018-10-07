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

  case 'key-delta': {
    s = x => (ea_districts[x][o] < t[0] || ea_districts[x][o] > t[1]) ? -1 : 1;
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

async function ea_datasets_points() {
  return ea_datasets_geojson.call(this, _ => {
    if (ea_mapbox.getSource(this.id)) {
      ea_mapbox.setLayoutProperty(this.id, 'visibility', 'visible');
      return;
    }

    ea_mapbox.addSource(this.id, {
      "type": "geojson",
      "data": this.features
    });

    ea_mapbox.addLayer({
      "id": this.id,
      "type": "circle",
      "source": this.id,
      "paint": {
        "circle-radius": 3,
        "circle-color": this.polygons.fill || 'cyan',
        "circle-stroke-width": 1,
        "circle-stroke-color": this.polygons.stroke || 'black',
      },
    }, ea_mapbox.first_symbol);
  });
};

async function ea_datasets_polygons() {
  return ea_datasets_geojson.call(this, _ => {
    if (ea_mapbox.getSource(this.id)) {
      ea_mapbox.setLayoutProperty(this.id, 'visibility', 'visible');
      return;
    }

    ea_mapbox.addSource(this.id, {
      "type": "geojson",
      "data": this.features
    });

    ea_mapbox.addLayer({
      "id": this.id,
      "type": "line",
      "source": this.id,
      "paint": {
        "line-width": 2,
        "line-color": this.polygons.fill || 'cyan',
      },
    }, ea_mapbox.first_symbol);
  });
};

async function ea_datasets_geojson(callback) {
  const ds = this;

  if (ds.features)
    callback();

  else {
    const endpoint = ds.polygons.endpoint;

    if (!endpoint) {
      console.warn(`Dataset '${ds.id}' should have a polygons (maybe a file-association missing). Endpoint is: `, endpoint);
      return ds;
    }

    const url = endpoint.match('^http') ? endpoint :
          `${ea_settings.endpoint_base}/${ea_ccn3}/${endpoint}`;

    await ea_client(
      url, 'GET', null,
      async r => {
        ds.features = r;
        callback();
      }
    );
  }

  return ds;
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

async function ea_datasets_tiff_url() {
  const ds = this;

  if (ds.raster) return ds;

  const endpoint = ds.heatmap.endpoint;

  const url = endpoint.match('^http') ? endpoint :
        `${ea_settings.endpoint_base}/${ea_ccn3}/${endpoint}`;

  await fetch(url)
    .then(ea_client_check)
    .then(r => r.blob())
    .then(b => ea_datasets_tiff(ds, b));

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

function ea_datasets_districts(ds) {
  let endpoint = `${ea_settings.endpoint_base}/${ea_ccn3}/districts-data.csv`;

  d3.csv(endpoint, function(d) {
    const o = { oid: +d[ds.configuration.oid] };

    Object.keys(ds.configuration.options).forEach(k => o[k] = +d[k] || d[k]);

    return o;
  })
    .then(data => {
      ea_districts = data;

      // hack: so we can access them by oid (as an array, they are
      // generally a sequence starting at 1)
      //
      ea_districts.unshift({ oid: 0 });
    })
    .catch(e => {
      console.warn(`${endpoint} raised an error and several datasets might depend on this. Bye!`);
    })
};
