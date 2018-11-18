window.DSTable = {};

class DS {
  constructor(e, preset, inputs) {
    this.id = e.category.name;

    this.name_long = (e.configuration && e.configuration.name_override) ?
      e.configuration.name_override :
      e.category.name_long;

    if (e.category.unit)
      this.unit = e.category.unit;

    this.metadata = e.metadata;

    this.configuration = e.configuration;

    this.mutant = !!(e.configuration && e.configuration.mutant);

    this.collection = !!(e.configuration && e.configuration.collection);

    if (e.heatmap_file) {
      this.heatmap = e.category.heatmap
      this.heatmap.endpoint = e.heatmap_file.endpoint;
      this.heatmap.parse = ea_datasets_tiff_url;

      this.gen_color_scale();
    }

    if (e.vectors_file) {
      this.vectors = e.category.vectors;
      this.vectors.endpoint = e.vectors_file.endpoint;

      switch (this.vectors.shape_type) {
      case "points": {
        this.vectors.symbol_svg = ea_svg_symbol(this.vectors.fill, { width: 1, color: this.vectors.stroke });
        this.vectors.parse = ea_datasets_points;
        break;
      }

      case "polygons": {
        this.vectors.symbol_svg = ea_svg_symbol(this.vectors.fill, { width: 3, color: this.vectors.stroke });
        this.vectors.parse = ea_datasets_polygons;
        break;
      }

      case "lines": {
        this.vectors.symbol_svg = ea_svg_symbol('none', { width: 3, color: this.vectors.stroke });
        this.vectors.parse = ea_datasets_lines;
        break;
      }
      }
    }

    if (e.csv_file) {
      this.csv = e.configuration.csv;
      this.csv.endpoint = e.csv_file.endpoint;
      this.csv.parse = ea_datasets_csv;
    }

    if (e.category.metadata && (e.category.metadata.why || e.category.metadata.what)) {
      this.help = {};

      this.help['why'] = e.category.metadata.why;
      this.help['what'] = e.category.metadata.what;
    }

    // TODO: this does not seem correct here. 'inputs' and 'presets' arguments
    // to this constructor feels messy.
    //
    this.presets = {};

    if (e.presets && e.presets.length) {
      e.presets.forEach(p => {
        return this.presets[p.name] = {
          "weight": p.weight,
          "min": p.min,
          "max": p.max
        };
      });
    }

    else if (e.category.presets && e.category.presets.length) {
      e.category.presets.forEach(p => {
        return this.presets[p.name] = {
          "weight": p.weight,
          "min": p.min,
          "max": p.max
        };
      });
    }

    let presetsempty = Object.keys(this.presets).length === 0;
    let p = this.presets[preset]

    if (!presetsempty && p) {
      this.weight = p.weight;
      // o.init_domain = [p.min, p.max];
      this.init_domain = null;
    } else {
      this.weight = 2;
      this.init_domain = null;
    }

    if (inputs.length) {
      this.active = (inputs.indexOf(e.category.name) > -1)
    } else {
      this.active = (!presetsempty && p);
    }
  };

  mutant_init() {
    if (!this.mutant) throw `${this.id} is not a mutant. Bye.`

    let m = DS.named(this.configuration.mutant_targets[0]);

    this.configuration.host = m.id;
    this.vectors = m.vectors;
    this.heatmap = m.heatmap;

    this.color_scale_svg = m.color_scale_svg;
    this.color_scale_fn = m.color_scale_fn;
  };

  async mutate(host) {
    if (!this.mutant) throw `${this.id} is not a mutant.`;

    if (!this.configuration.mutant_targets.includes(host.id))
      throw `${this.id} is not configured to mutate into ${host.id}.`

    this.raster = undefined;
    this.vectors = undefined;
    this.heatmap = undefined;
    this.height = undefined;
    this.width = undefined;
    this.image = undefined;
    this.tiff = undefined;

    this.configuration.host = host.id;
    this.vectors = host.vectors;
    this.color_scale_svg = host.color_scale_svg;
    this.color_scale_fn = host.color_scale_fn;

    await host.heatmap.parse.call(host);

    this.heatmap = host.heatmap;
    this.raster = host.raster;
    this.image = host.image;

    return this;
  };

  collection_init() {
    if (!this.collection) throw `${this.id} is not a collection. Bye.`
  };

  gen_color_scale() {
    if (this.configuration && this.configuration.mutant) return;

    let cs = this.heatmap.color_stops;
    let c = ea_default_color_scale;
    let d = ea_default_color_domain;

    if (!cs || !cs.length)
      this.heatmap.color_stops = cs = ea_default_color_stops;
    else {
      d = Array(cs.length).fill(0).map((x,i) => (0 + i * (1/(cs.length-1))));
      plotty.addColorScale((c = this.id), cs.reverse(), d);
    }

    this.heatmap.color_scale = c;

    this.color_scale_fn = _ => {
      return d3.scaleLinear()
        .domain(d)
        .range(cs)
        .clamp(this.heatmap.clamp || false);
    };

    this.color_scale_svg = ea_svg_color_steps(this.color_scale_fn, 3);
  };

  async show() {
    if (ea_mapbox.getLayer(this.id))
      ea_mapbox.setLayoutProperty(this.id, 'visibility', 'visible');

    else if (this.collection)
      for (let i of this.configuration.collection) await DS.named(i).show();
  };

  async hide() {
    if (ea_mapbox.getSource(this.id))
      ea_mapbox.setLayoutProperty(this.id, 'visibility', 'none');

    else if (this.collection)
      for (let i of this.configuration.collection) await DS.named(i).hide();
  };

  async turn(v, draw) {
    if (v && this.vectors) await this.load('vectors');
    if (v && this.heatmap) await this.load('heatmap');
    if (v && this.csv) await this.load('csv');

    if (v && draw)
      this.show();
    else
      this.hide();

    if (this.collection)
      for (let i of this.configuration.collection) await DS.named(i).turn(v, draw);
  };

  async load(...args) {
    ea_ui_dataset_loading(this, true);

    for (let a of args)
      if (this[a]) await this[a].parse.call(this);

    if (this.collection)
      for (let i of this.configuration.collection) await DS.named(i).load(...args);

    ea_ui_dataset_loading(this, false);
  };

  async raise() {
    if (this.vectors)
      ea_mapbox.moveLayer(this.id, ea_mapbox.first_symbol);

    else if (!this.vectors && !this.collection)
      ea_mapbox.moveLayer('canvas-layer', ea_mapbox.first_symbol);

    if (this.collection) {
      for (let i of this.configuration.collection)
        DS.named(i).raise();
    }
  };

  // class methods

  static get list() {
    return Object.keys(DSTable).map(i => DSTable[i]);
  };

  static named(i) {
    return DSTable[i];
  };
};

async function ea_datasets_init(country_id, inputs, preset) {
  let attrs = '*,heatmap_file(*),vectors_file(*),csv_file(*),category(*)';

  await ea_client(
    `${ea_settings.database}/datasets?country_id=eq.${country_id}&select=${attrs}`, 'GET', null,
    r => r.map(e => DSTable[e.category_name] = new DS(e,preset,inputs)));

  // We need all the datasets to be initialised _before_ setting
  // mutant/collection attributes (order is never guaranteed)
  //
  DS.list.filter(d => d.mutant).forEach(d => d.mutant_init());
  DS.list.filter(d => d.collection).forEach(d => d.collection_init());

  return DS.list;
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
      if (!ds.table) return;

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

async function ea_datasets_points() {
  return ea_datasets_geojson.call(this, _ => {
    if (typeof ea_mapbox.getSource(this.id) === 'undefined') {
      ea_mapbox.addSource(this.id, {
        "type": "geojson",
        "data": this.features
      });
    }

    if (typeof ea_mapbox.getLayer(this.id) === 'undefined') {
      ea_mapbox.addLayer({
        "id": this.id,
        "type": "circle",
        "source": this.id,
        "paint": {
          "circle-radius": 3,
          "circle-opacity": this.vectors.opacity,
          "circle-color": this.vectors.fill || 'cyan',
          "circle-stroke-width": 1,
          "circle-stroke-color": this.vectors.stroke || 'black',
        },
      }, ea_mapbox.first_symbol);
    }
  });
};

async function ea_datasets_lines() {
  return ea_datasets_geojson.call(this, _ => {
    if (!ea_mapbox.getSource(this.id))
      ea_mapbox.addSource(this.id, {
        "type": "geojson",
        "data": this.features
      });

    if (!ea_mapbox.getLayer(this.id))
      ea_mapbox.addLayer({
        "id": this.id,
        "type": "line",
        "source": this.id,
        "paint": {
          "line-width": 1,
          "line-color": this.vectors.stroke,
        },
      }, ea_mapbox.first_symbol);
  });
};

async function ea_datasets_polygons() {
  return ea_datasets_geojson.call(this, _ => {
    if (!ea_mapbox.getSource(this.id))
      ea_mapbox.addSource(this.id, {
        "type": "geojson",
        "data": this.features
      });

    if (!ea_mapbox.getLayer(this.id))
      ea_mapbox.addLayer({
        "id": this.id,
        "type": "fill",
        "source": this.id,
        "paint": {
          "fill-opacity": this.vectors.opacity,
          "fill-color": this.vectors.fill,
          "fill-outline-color": this.vectors.stroke,
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

  if (ds.features) callback();

  else {
    const endpoint = ds.vectors.endpoint;

    if (!endpoint) {
      console.warn(`Dataset '${ds.id}' should have a vectors (maybe a file-association missing). Endpoint is: `, endpoint);
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
