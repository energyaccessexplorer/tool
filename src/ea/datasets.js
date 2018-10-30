async function ea_datasets_init(country_id, inputs, preset) {
  let collection = null;

  await ea_client(
    `${ea_settings.database}/datasets?country_id=eq.${country_id}&select=*,heatmap_file(*),polygons_file(*),csv_file(*),category(*)`, 'GET', null,
    r => {
      const map = r.map(e => {
        let heatmap, polygons, csv, help = null;

        if (e.heatmap_file) {
          heatmap = e.category.heatmap
          heatmap.endpoint = e.heatmap_file.endpoint;
        }

        if (e.polygons_file) {
          polygons = e.category.polygons;
          polygons.endpoint = e.polygons_file.endpoint;
        }

        if (e.csv_file) {
          csv = e.configuration.csv;
          csv.endpoint = e.csv_file.endpoint;
        }

        if (e.category.configuration && e.category.configuration.mutant) console.log('mutant: ', e.category_name, e.id);
        else if (!e.heatmap_file && !e.polygons_file) return undefined;

        if (e.category.metadata && (e.category.metadata.why || e.category.metadata.what)) {
          help = {};

          help['why'] = e.category.metadata.why;
          help['what'] = e.category.metadata.what;
        }

        let name_long = e.category.name_long;
        if (e.configuration && e.configuration.name_override)
          name_long = e.configuration.name_override;

        const o = {
          "name_long": name_long,
          "description": e.category.description,
          "description_long": e.category.description_long,
          "csv": csv,
          "heatmap": heatmap,
          "polygons": polygons,
          "id": e.category.name,
          "unit": e.category.unit,
          "metadata": e.metadata,
          "configuration": e.category.configuration,
          "help": help
        };

        let pp = {};

        if (e.presets && e.presets.length) {
          e.presets.forEach(p => {
            return pp[p.name] = {
              "weight": p.weight,
              "min": p.min,
              "max": p.max
            };
          });
        }
        else if (e.category.presets && e.category.presets.length) {
          e.category.presets.forEach(p => {
            return pp[p.name] = {
              "weight": p.weight,
              "min": p.min,
              "max": p.max
            };
          });
        }

        let ppempty = Object.keys(pp).length === 0;
        let p = pp[preset]

        if (!ppempty && p) {
          o.weight = p.weight;
          // o.init_domain = [p.min, p.max];
          o.init_domain = null;
        } else {
          o.weight = 2;
          o.init_domain = null;
        }

        if (inputs.length) {
          o.active = (inputs.indexOf(e.category.name) > -1)
        } else {
          o.active = (!ppempty && p);
        }

        o.presets = pp;

        return o;
      });

      collection = map.filter(d => d)

      for (var d of collection) {
        if (d.configuration && d.configuration.mutant) {
          let m = collection.find(x => x.id === d.configuration.mutant_targets[0]);

          if (!m) {
            flash()
              .type(null)
              .timeout(0)
              .title(`'${d.id}' dataset is misconfigured.`)
              .message(`Removing it because I cannot find host dataset: ${d.configuration.mutant_targets[0]}.`)();

            delete collection[collection.indexOf(d)];

            continue;
          } else {
            d.polygons = m.polygons;
            d.heatmap = m.heatmap;
          }
        }

        if (d.csv)
          d.csv.parse = ea_datasets_csv;

        if (d.heatmap) {
          d.heatmap.parse = ea_datasets_tiff_url;
          d.heatmap.color_scale = ea_default_color_scheme;
        }

        if (d.polygons) {
          switch (d.polygons.shape_type) {
          case "points": {
            d.polygons.parse = ea_datasets_points;
            break;
          }

          case "polygons": {
            d.polygons.parse = ea_datasets_polygons;
            break;
          }
          }
        }

        d.color_scale_fn = function() {
          return d3.scaleLinear()
            .domain(plotty.colorscales[d.heatmap.color_scale].positions)
            .range(plotty.colorscales[d.heatmap.color_scale].colors)
            .clamp(d.heatmap.clamp || false);
        }
      }

      collection = collection.filter(d => d);
    });

  return collection;
};

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
  case 'identity': {
    s = d3.scaleIdentity()
      .domain(t || d)
      .range(r);
    break;
  }

  case 'key-linear': {
    s = x => {
      let z = ds.table[x];
      if (!z) return -1;

      return (!x || x === ds.nodata) ? -1 : lin.clamp(ds.heatmap.clamp)(z[o]);
    };
    break;
  }

  case 'key-delta': {
    s = x => {
      let z = ds.table[x];
      if (!z) return -1;

      return (z[o] < t[0] || z[o] > t[1]) ? -1 : 1;
    };
    break;
  }

  case 'linear':
  default: {
    s = lin.clamp(ds.heatmap.clamp);
    break;
  }
  }

  return s;
};

async function ea_datasets_load(ds) {
  if (!ds.id) throw `Argument Error: ${ds} does not look like a dataset`;

  ea_ui_dataset_loading(ds, true);

  if (!ds.heatmap || !ds.heatmap.parse) {
    console.warn(ds.id, "does not have a #heatmap.parse function set! I'm setting ds.heatmap to 'null'");
    ds.heatmap = null;
  }
  else
    await ds.heatmap.parse.call(ds);

  if (ds.csv) await ds.csv.parse.call(ds);

  ds.color_scale_svg = ea_svg_color_gradient(ds.color_scale_fn);

	ea_ui_dataset_loading(ds, false);
};

async function ea_datasets_active(ds, v) {
  if (!ds || !ds.id) {
    console.warn(ds);
    throw `Argument Error: '${ds}' does not look like a dataset`;
  }

  if (ds.active = v) await ea_datasets_load(ds);
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

async function ea_datasets_csv(callback) {
  const ds = this;

  if (ds.table) return;

  else {
    const endpoint = ds.csv.endpoint;

    if (!endpoint) {
      console.warn(`Dataset '${ds.id}' should have a csv (maybe a file-association missing). Endpoint is: `, endpoint);
      return ds;
    }

    const url = endpoint.match('^http') ? endpoint :
          `${ea_settings.endpoint_base}/${ea_ccn3}/${endpoint}`;

    d3.csv(url, function(d) {
      const o = { oid: +d[ds.csv.oid] };
      Object.keys(ds.csv.options).forEach(k => o[k] = +d[k] || d[k]);
      return o;
    })
      .then(data => {
        // HACK: so we can access them by oid (as an array, they are
        // generally a sequence starting at 1)
        //
        if (data[0]['oid'] === 1) data.unshift({ oid: 0 });

        ds.table = data;
      })
      .catch(e => {
        console.warn(`${endpoint} raised an error and several datasets might depend on this. Bye!`);
      });
  }
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
