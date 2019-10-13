class DS {
  constructor(o) {
    this.id = o.category.name;

    this.dataset_id = o.id;

    this.category = o.category;

    let config = o.configuration || {};
    this.config = config;

    this.analysis = o.category.analysis || {};

    this.name = config.name_override || o.category.name_long;

    this.indexname = (o.category.controls.path && o.category.controls.path[0]) || null;

    this.weight = this.analysis.weight || 2;

    this.metadata = o.metadata;

    this.invert = config.invert_override || (o.category.analysis && o.category.analysis.invert);

    this.mutant = !!config.mutant;

    this.items = !!config.collection ? [] : undefined;

    if (o.raster_file) {
      const r = this.raster = {};

      r.config = JSON.parse(JSON.stringify(o.category.raster));

      r.endpoint = o.raster_file.endpoint;
      r.parse = _ => ea_datasets_tiff.call(this);

      if (this.analysis.scale === 'multi-key-delta')
        this.children = [];
    }

    if (o.vectors_file) {
      const v = this.vectors = {};

      v.config = JSON.parse(JSON.stringify(o.category.vectors));
      v.endpoint = o.vectors_file.endpoint;

      switch (v.config.shape_type) {
      case "points": {
        v.parse = x => ea_datasets_points.call(x || this);
        break;
      }

      case "polygons": {
        v.parse = x => ea_datasets_polygons.call(x || this);
        break;
      }

      case "lines": {
        v.parse = x => ea_datasets_lines.call(x || this);
        break;
      }
      }
    }

    if (o.csv_file) {
      const c = this.csv = config.csv || {};

      c.endpoint = o.csv_file.endpoint;
      c.parse = _ => ea_datasets_csv.call(this);
    }

    this.presets = {};

    if (o.presets && o.presets.length) {
      o.presets.forEach(p => {
        return this.presets[p.name] = {
          "weight": p.weight,
          "min": p.min,
          "max": p.max
        };
      });
    }

    else if (o.category.presets && o.category.presets.length) {
      o.category.presets.forEach(p => {
        return this.presets[p.name] = {
          "weight": p.weight,
          "min": p.min,
          "max": p.max
        };
      });
    }

    __dstable[this.id] = this;
  };

  init(active, preset) {
    let presetsempty = Object.keys(this.presets).length === 0;
    let p = this.presets[preset];

    if (!presetsempty && p) {
      this.weight = p.weight;
    }

    this.active = active || (!presetsempty && p);

    this.datatype = (_ => {
      let t = null;

      if (this.mutant) t = null;
      else if (this.vectors) t = this.vectors.config.shape_type;
      else if (this.parent) t = this.parent.datatype;
      else if (this.raster) t = "raster";
      else if (this.csv) t = "table";
      else throw `Cannot decide datatype of ${this.id}`;

      return t;
    })();

    if (this.datatype === 'raster')
      ea_datasets_colorscale.call(this);

    switch (this.datatype) {
    case 'raster':
      this.download = this.raster.endpoint;
      break;

    case 'polygons':
    case 'points':
    case 'lines':
      this.download = this.vectors.endpoint;
      break;

    default:
      break;
    }
  };

  disable() {
    this.active = false;
    this.disabled = true;

    if (this.controls) this.controls.disable();
    if (this.input) this.input.disable();

    if (this.items) {
      for (let d of this.items) { d.disable(); }
    }

    if (this.collection) {
      if (!this.collection.disabled) this.collection.disable();
    }

    ea_overlord({
      "type": "dataset",
      "target": this,
      "caller": "dataset disable"
    });
  };

  add_source(opts) {
    if (this.source && MAPBOX.getSource(this.id)) return;

    MAPBOX.addSource(this.id, opts);

    this.source = MAPBOX.getSource(this.id);
  };

  add_layer(opts) {
    if (this.layer && MAPBOX.getLayer(this.id)) return;

    opts['id'] = this.id;
    opts['source'] = this.id;

    this.layer = MAPBOX.addLayer(opts, MAPBOX.first_symbol);
  };

  mutant_init() {
    this.hosts = this.config.mutant_targets.map(i => DS.get(i));

    const m = this.host = this.hosts[0];

    this.datatype = m.datatype;

    this.raster = m.raster;

    this.vectors = m.vectors;

    this.colorscale = m.colorscale;
  };

  async mutate(host) {
    await host.raster.parse();

    this.host = host;

    this.datatype = host.datatype;

    this.raster = host.raster;

    this.vectors = host.vectors;

    this.colorscale = host.colorscale;

    this.input.refresh();

    return this;
  };

  items_init() {
    for (let i of this.config.collection) {
      const d = DS.get(i);
      d.input = d.input || new dsinput(d);
      d.collection = this;

      this.items.push(d);
    }
  };

  async children_init(inputs) {
    await Promise.all([
      this.csv ? this.csv.parse() : null,
      this.raster ? this.raster.parse() : null,
      this.vectors ? this.vectors.parse() : null,
    ]);

    const features_json = JSON.stringify(this.vectors.features);
    const children = this.config.children.datasets;

    this.table = ea_datasets_table.call(this, this.vectors.features.features);

    for (let v in children) {
      // we can do this because category is plain JSON, not javascript.
      //
      let cat = JSON.parse(JSON.stringify(this.category));
      cat.name = this.id + "-" + v;
      cat.name_long = children[v];

      let d = new DS({ category: cat });

      d.child_id = v;
      d.parent = this;
      d.config = this.config;
      d.metadata = this.metadata;

      Object.assign(d.raster = {}, this.raster);
      d.analysis.scale = "key-delta";

      Object.assign(d.vectors = {}, this.vectors);
      d.vectors.features = JSON.parse(features_json);
      d.vectors.parse = _ => this.vectors.parse(d);

      d.csv = this.csv;

      await d.init(inputs.includes(d.id), null);

      this.children.push(d);

      d.child_init();
    }
  };

  async child_init() {
    let id = this.child_id;
    let cs = this.vectors.config.color_stops;

    let max = Math.max.apply(null, this.vectors.features.features.map(f => f.properties[id]));
    max = (max <= 1) ? 1 : 100;

    const d = Array(cs.length).fill(0).map((x,i) => (0 + i * (max/(cs.length-1))));
    const s = d3.scaleLinear().domain(d).range(cs);

    this.colorscale = {};
    this.colorscale.fn = s;
    this.colorscale.stops = d;

    const fs = this.vectors.features.features;
    for (let i = 0; i < fs.length; i += 1)
      fs[i].properties.__color = s(fs[i].properties[id])

    this.table = {};

    for (let k in this.parent.table)
      this.table[k] = this.parent.table[k][id] * (max === 100 ? 1 : 100);
  };

  /*
   * scale_fn
   *
   * Extract the scaling function given a dataset and the current parameters.
   *
   * @param "i" string
   *   name of the current index being drawn and decide if the range of the
   *   function should be inverted.
   *
   * returns function (ds domain) -> [0,1]
   */

  scale_fn(i) {
    let s = null;

    const dom = this.raster.config.domain;
    const d = (dom && [dom.min, dom.max]) || [0,1];
    const t = this.domain;
    const v = this.analysis.scale;
    const r = ((typeof this.invert !== 'undefined' && this.invert.includes(i)) ? [1,0] : [0,1]);

    switch (v) {
    case 'multi-key-delta': {
      break;
    }

    case 'key-delta': {
      if (!this.table) return (s = x => 1);

      s = x => {
        let z = this.table[x];

        return ((undefined === z) || z < t[0] || z > t[1]) ? -1 : 1;
      };
      break;
    }

    case 'exclusion-buffer': {
      s = x => (x < t[0] || x > t[1]) ? 1 : -1;
      break;
    }

    case 'intervals': {
      const q = d3.scaleQuantile()
            .domain(this.analysis.intervals)
            .range([0, 0.25, 0.5, 0.75, 1]);

      s = x => (x >= this.domain[0]) && (x <= this.domain[1]) ? q(x) : -1;

      break;
    }

    case 'linear':
    default: {
      if (t[0] === t[1])
        return s = x => (x === +t[0]) ? 1 : -1;

      const lin = d3.scaleLinear()
            .domain(t || d)
            .range(r)

      s = lin.clamp(this.analysis.clamp);
      break;
    }
    }

    return s;
  };

  async visibility(t) {
    if (this.items) {
      await Promise.all(this.items.map(d => d.visibility(t)));
      return;
    }

    if (this.layer)
      this.layer.setLayoutProperty(this.id, 'visibility', t ? 'visible' : 'none');

    if (this.host) {
      this.hosts.forEach(d => d.layer.setLayoutProperty(d.id, 'visibility', 'none'));
      this.host.layer.setLayoutProperty(this.host.id, 'visibility', t ? 'visible' : 'none');
    }
  };

  toggle() {
    this.active = !this.active;

    ea_overlord({
      "type": "dataset",
      "target": this,
      "caller": "ds toggle",
    });
  };

  async turn(v, draw) {
    this.active = v;

    if (v) {
      if (this.controls) {
        this.controls.loading(true);
        await this.load();
        this.controls.loading(false);
      }
      else await this.load();
    }

    if (this.items) {
      await Promise.all(this.items.map(d => d.turn(v, draw)));
      this.controls.turn(v);

      return;
    }

    if (this.mutant) this.mutate(this.host);

    if (this.controls) this.controls.turn(v);

    this.visibility(v && draw);
  };

  async load(arg) {
    if (this.items) {
      // Collections will (as of now) always share rasters.
      //
      if (this.raster) this.raster.parse();

      await Promise.all(this.items.map(d => d.load(arg)));
    }

    if (this.mutant) {
      return Promise.all(this.hosts.map(d => d.load(arg)));
    }

    if (!arg)
      await Promise.all(['vectors', 'csv', 'raster'].map(i => this[i] ? this.load(i) : null));
    else
      if (this[arg]) await this[arg].parse();
  };

  async raise() {
    if (this.layer)
      MAPBOX.moveLayer(this.id, MAPBOX.first_symbol);

    if (this.items) {
      for (let d of this.items) d.raise();
    }

    if (this.host) {
      this.host.raise();
    }
  };

  // class methods

  static get all() {
    return Object.keys(__dstable).map(i => __dstable[i]);
  };

  static get(i) {
    return __dstable[i];
  };
};

/*
 * This is a workaround for not having class variables
 */
window.__dstable = {};

/*
 * ea_datasets_init
 *
 * 1. fetch the datasets list from the API
 * 2. generate DS objects
 * 3. initialise mutants and collections
 *
 * @param "id" uuid
 * @param "inputs" string[] with DS.id's
 * @param "preset" string ("custom", "market", "investment", "planning")
 *
 * returns DS[]
 */

async function ea_datasets_init(id, inputs, preset, callback) {
  let attrs = '*,raster_file(*),vectors_file(*),csv_file(*),category(*)';

  let boundaries;

  await fetch(`${ea_settings.database}/datasets?geography_id=eq.${id}&select=${attrs}`)
    .then(r => r.json())
    .then(r => r.map(e => {
      let active = (inputs.includes(e.category.name));
      let ds = new DS(e);

      if (ds.id === 'boundaries') (async _ => {
        boundaries = ds;

        ds.active = false;

        await ds.load('csv');
        await ds.load('vectors');
        await ds.load('raster');

        if (!ds.vectors.bounds) throw `'boundaries' dataset has now vectors.bounds`;

        callback(ds.vectors.bounds);
      })();

      ds.init(active, preset);
    }));

  // We need all the datasets to be initialised _before_ setting
  // mutant/collection attributes (order is never guaranteed)
  //
  DS.all.filter(d => d.mutant).forEach(d => d.mutant_init());
  DS.all.filter(d => d.items).forEach(d => d.items_init());

  // parents generate new children datasets. We need to wait for these since
  // the next step is to syncronise the entire thing.
  //
  await Promise.all(DS.all.filter(d => d.children).map(d => d.children_init(inputs)));
};

function ea_datasets_colorscale() {
  let d;
  let cs = this.raster.config.color_stops;


  if (!cs || !cs.length) {
    cs = ea_default_colorscale.stops;
    d = ea_default_colorscale.domain;
  }
  else {
    d = Array(cs.length).fill(0).map((x,i) => (0 + i * (1/(cs.length-1))));
  }

  this.colorscale = {};
  this.colorscale.stops = d;

  switch (this.raster.config.scale) {
  case "intervals": {
    let domain = this.raster.config.domain;

    let s = d3.scaleLinear()
        .domain([0,255])
        .range([domain.min, domain.max])
        .clamp(true);

    const a = new Uint8Array(1024).fill(-1);
    for (let i = 0; i < 1024; i += 4) {
      let j = interval_index(s(i/4), this.raster.config.intervals);

      if (j === -1) {
        a[i] = a[i+1] = a[i+2] = a[i+3] = 0;
        continue;
      }

      let cj = cs[j];

      let color = hex_to_rgba(cs[j]);

      a[i] = color[0];
      a[i+1] = color[1];
      a[i+2] = color[2];
      a[i+3] = color[3];
    }

    this.colorscale.data = a;
    this.colorscale.fn = (x,i) => cs[i];

    break;
  }

  case "linear":
  default: {
    const a = ea_colorscale({
      stops: cs,
      domain: d
    });

    this.colorscale.data = a.data;
    this.colorscale.fn = d3.scaleLinear()
      .domain(d)
      .range(cs)
      .clamp(this.analysis.clamp || false);

    break;
  }
  }
};

/*
 * The following functions fetch and load the different types of data to the
 * datasets geojsons (points, lines or polygons), CSV's or rasters.
 */

function ea_datasets_fail(format) {
  ea_flash.push({
    type: 'error',
    timeout: 5000,
    title: "Network error",
    message: `
Failed to process the ${format} for '${this.name}'.
This is not fatal. Dataset disabled.`
  });

  this.disable();

  throw Error(`"Dataset '${this.name}' disabled`);
};

function ea_datasets_table(sources) {
  // TODO: this is features-centric, we should be able to get these values
  //       from the CSV
  //
  const table = {};
  const keys = Object.keys(this.config.children.datasets);

  for (let i = 0; i < sources.length; i += 1) {
    let o = {};
    let f = sources[i];

    keys.forEach(k => o[k] = +f.properties[k]);

    table[+f.properties[this.config.id_key]] = o;
  }

  return table;
};

function ea_datasets_csv() {
  if (this.csv.data) return;

  fetch(this.csv.endpoint)
    .then(r => r.text())
    .then(t => d3.csvParse(t))
    .then(d => this.csv.data = d);
};

function ea_datasets_tiff() {
  async function run_it(blob) {
    function draw() {
      const r = this.raster;
      let d = r.config.domain;

      if (this.datatype !== 'raster') return;

      if (!r.canvas) {
        r.canvas = ea_plot({
          canvas: ce('canvas'),
          data: r.data,
          width: r.width,
          height: r.height,
          domain: [d.min, d.max],
          nodata: r.nodata,
          colorscale: this.colorscale
        });
      }

      this.add_source({
        "type": "canvas",
        "canvas": r.canvas,
        "animate": false,
        "coordinates": MAPBOX.coords
      });

      this.add_layer({
        "type": 'raster',
        "layout": {
          "visibility": "none",
        },
        "paint": {
          "raster-resampling": "nearest"
        }
      });
    };

    if (this.raster && this.raster.data) {
      draw.call(this);
    }

    else {
      const tiff = await GeoTIFF.fromBlob(blob);
      const image = await tiff.getImage();
      const rasters = await image.readRasters();

      const r = this.raster;

      r.data = rasters[0];
      r.width = image.getWidth();
      r.height = image.getHeight();
      r.nodata = parseFloat(tiff.fileDirectories[0][0].GDAL_NODATA);

      draw.call(this);
    }

    return;
  };

  if (this.raster && this.raster.data) {
    run_it.call(this);
    return;
  }

  return fetch(this.raster.endpoint)
    .then(r => {
      if (!(r.ok && r.status < 400)) ea_datasets_fail.call(this, "TIFF");
      else return r;
    })
    .then(r => r.blob())
    .then(b => run_it.call(this, b));
};

function ea_datasets_geojson() {
  if (this.vectors.features)
    return new Promise((res, rej) => res());

  return fetch(this.vectors.endpoint)
    .then(r => r.json())
    .catch(err => ea_datasets_fail.call(this, "GEOJSON"))
    .then(r => {
      this.vectors.features = r;
      if (this.id === 'boundaries') this.vectors.bounds = geojsonExtent(r);
    });
};

function ea_datasets_points() {
  return ea_datasets_geojson.call(this)
    .then(_ => {
      const v = this.vectors.config;

      this.add_source({
        "type": "geojson",
        "data": this.vectors.features
      });

      this.add_layer({
        "type": "circle",
        "layout": {
          "visibility": "none",
        },
        "paint": {
          "circle-radius": v.width || 3,
          "circle-opacity": v.opacity,
          "circle-color": v.fill || 'cyan',
          "circle-stroke-width": v['stroke-width'] || 1,
          "circle-stroke-color": v.stroke || 'black',
        },
      });
    });
};

function ea_datasets_lines() {
  return ea_datasets_geojson.call(this)
    .then(_ => {
      // mapbox-gl does not follow SVG's stroke-dasharray convention when it comes
      // to single numbered arrays.
      //
      let da = this.vectors.config.dasharray.split(' ').map(x => +x);
      if (da.length === 1) {
        (da[0] === 0) ?
          da = [1] :
          da = [da[0], da[0]];
      }

      const fs = this.vectors.features.features;
      const specs = this.vectors.config.specs;

      for (let i = 0; i < fs.length; i += 1) {
        if (specs) {
          for (let s of specs) {
            if (fs[i].properties[s.key] === s.match || (new RegExp(s.match)).test(fs[i].properties[s.key])) {
              if (undefined !== s['stroke']) fs[i].properties['__color'] = s['stroke'];
              if (undefined !== s['stroke-width']) fs[i].properties['__width'] = s['stroke-width'];
            }
          }
        }
        else {
          fs[i].properties['__color'] = this.vectors.config.stroke;
          fs[i].properties['__width'] = this.vectors.config.width || 1;
        }
      }

      this.add_source({
        "type": "geojson",
        "data": this.vectors.features
      });

      this.add_layer({
        "type": "line",
        "layout": {
          "visibility": "none",
        },
        "paint": {
          "line-color": ['get', '__color'],
          "line-width": ['get', '__width'],
          // Waiting for mapbox to do something about this...
          //
          // "line-dasharray": ['get', '__dasharray']
          "line-dasharray": da,
        },
      });
    });
};

function ea_datasets_polygons() {
  return ea_datasets_geojson.call(this)
    .then(_ => {
      const v = this.vectors.config;

      this.add_source({
        "type": "geojson",
        "data": this.vectors.features
      });

      this.add_layer({
        "type": "fill",
        "layout": {
          "visibility": "none",
        },
        "paint": {
          "fill-color": this.parent ? ['get', '__color'] : v.fill,
          "fill-outline-color": v.stroke,
          "fill-opacity": v.opacity,
        },
      });
    });
};
