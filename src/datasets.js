class DS {
  constructor(o, active) {
    this.id = o.name || o.category.name;

    this.dataset_id = o.id;

    this.category = o.category;

    this.category_overrides(o.category_overrides);

    this.active = active || false;

    this._domain = null;

    let config = o.configuration || {};

    this.config = config;

    this.analysis = this.category.analysis;

    this.weight = maybe(this, 'analysis', 'weight') || 2;

    this.timeline = this.category.timeline;

    this.name = o.name_long || o.name || this.category.name_long || this.category.name;

    this.indexname = maybe(this.analysis, 'index');

    this.metadata = o.metadata;

    this.invert = config.invert_override || maybe(this.analysis, 'invert');

    this.mutant = !!config.mutant;

    this.items = !!config.collection ? [] : undefined;

    this.files_setup(o);

    if (this.mutant) ;
    else if (undefined === this.domain) {
      ea_flash.push({
        title: `'${this.id}' ignored`,
        message: `Cannot set dataset's domain`,
        timeout: 5000,
        type: 'error'
      });
      warn(`Could not set a domain for ${this.id}. Abort.`);
      this.disable();
    }

    this.init();

    if (!this.disabled) {
      this.card = new dscard(this);
      this.controls = new dscontrols(this);
    }

    DST[this.id] = this;
  };

  files_setup(o) {
    const v = maybe(o.df.find(x => x.func === 'vectors'), 'file');
    if (o.category.vectors && v) {
      this.vectors = JSON.parse(JSON.stringify(o.category.vectors));
      this.vectors.endpoint = v.endpoint;
      this.vectors.key = maybe(v, 'configuration', 'key') || 'OBJECTID';

      switch (this.vectors.shape_type) {
      case 'points': {
        this.vectors.parse = x => ea_datasets_points.call(x || this);
        break;
      }

      case 'polygons': {
        this.vectors.parse = x => ea_datasets_polygons.call(x || this);
        break;
      }

      case 'lines': {
        this.vectors.parse = x => ea_datasets_lines.call(x || this);
        break;
      }
      }
    }

    const r = maybe(o.df.find(x => x.func === 'raster'), 'file');
    if (o.category.raster && r) {
      this.raster = JSON.parse(JSON.stringify(o.category.raster));
      this.raster.endpoint = r.endpoint;
      this.raster.parse = _ => ea_datasets_tiff.call(this);

      if (typeof maybe(this.raster, 'domain', 'min') === 'number' &&
          typeof maybe(this.raster, 'domain', 'max') === 'number') {
        this.domain = [this.raster.domain.min, this.raster.domain.max];
        this._domain = JSON.parse(JSON.stringify(this.domain));
        this.domain_init = JSON.parse(JSON.stringify(this.domain));
      }

      if (typeof maybe(this.raster, 'init', 'min') === 'number' &&
          typeof maybe(this.raster, 'init', 'max') === 'number') {
        this._domain = [this.raster.init.min, this.raster.init.max];
        this.domain_init = JSON.parse(JSON.stringify(this._domain));
      }
    }

    const c = maybe(o.df.find(x => x.func === 'csv'), 'file');
    if (o.category.csv && c) {
      this.csv = JSON.parse(JSON.stringify(o.category.csv));
      this.csv.endpoint = c.endpoint;
      this.csv.key = maybe(c, 'configuration', 'key') || 'OBJECTID';
      this.csv.parse = _ => ea_datasets_csv.call(this);

      if (typeof maybe(this.csv, 'domain', 'min') === 'number' &&
          typeof maybe(this.csv, 'domain', 'max') === 'number') {
        this.domain = [this.csv.domain.min, this.csv.domain.max];
        this._domain = JSON.parse(JSON.stringify(this.domain));
        this.domain_init = JSON.parse(JSON.stringify(this.domain));
      }
    }
  };

  init() {
    if (this.timeline) {
      const b = DST['boundaries'];
      this.vectors = JSON.parse(JSON.stringify(b.vectors));
      this.vectors.endpoint = b.vectors.endpoint;
      this.vectors.parse = x => ea_datasets_polygons.call(x || this);
    }

    switch (this.datatype) {
    case 'raster': {
      this.download = this.raster.endpoint;

      this.colorscale = ea_colorscale({
        stops: this.category.colorstops,
        domain: this.raster.domain,
        intervals: this.raster.intervals,
      });

      break;
    }

    case 'raster-mutant': {
      break;
    }

    case 'points':
    case 'lines':
    case 'polygons': {
      this.download = this.vectors.endpoint;
      break;
    }

    case 'polygons-fixed': {
      this.download = this.vectors.endpoint;

      if (this.config.column) {
        this.colorscale = ea_colorscale({
          stops: this.category.colorstops,
        });
      }
      break;
    }

    case 'polygons-timeline': {
      this.colorscale = ea_colorscale({
        stops: this.category.colorstops,
      });

      break;
    }

    case undefined:
    default: {
      ea_flash.push({
        title: `'${this.id}' disabled`,
        message: `Cannot decide dataset's type`,
        timeout: 5000,
        type: 'error'
      });

      warn(`Datatype of ${this.id} is undefined. Disabling...`);

      this.disable();

      break;
    }
    }
  };

  category_overrides(ovrr) {
    if (!ovrr) return;

    const configs = ['raster', 'vectors', 'csv', 'analysis', 'timeline', 'controls'];

    for (let c of configs) {
      if (!ovrr[c]) continue;

      for (let a in ovrr[c]) {
        if (!maybe(this.category, c)) continue;
        this.category[c][a] = ovrr[c][a];
      }
    }

    const attrs = ['unit', 'name', 'name_long'];
    for (let a of attrs) {
      if (!ovrr[a]) continue;
      this.category[a] = ovrr[a];
    }
  };

  get datatype() {
    let t;

    if (this.vectors) t = this.vectors.shape_type;
    else if (this.raster) t = "raster";
    else if (this.csv) t = "table";

    if (this.config.column) t += "-fixed";
    else if (this.timeline) t += "-timeline";

    if (this.mutant) {
      t = "raster-mutant";
    }

    return t;
  };

  disable() {
    this.active = false;
    this.disabled = true;

    if (this.controls) this.controls.disable();

    if (this.card) this.card.disable();

    if (this.items) {
      for (let d of this.items) { d.disable(); }
    }

    if (this.collection) {
      if (!this.collection.disabled) this.collection.disable();
    }

    delete DST[this.id];

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

  update_source(data) {
    try {
      if (this.source) this.source.setData(data);
    } catch (err) {
      // TODO: find out what this error is when changing mapbox's themes.
      //       it is not fatal, so we just report it.
      //
      warn(err);
    }
  }

  mutant_init() {
    this.hosts = this.config.mutant_targets.map(i => DST[i]);

    const m = this.host = this.hosts[0];

    this.raster = m.raster;
    this.vectors = m.vectors;
    this.colorscale = m.colorscale;

    this.domain = m.domain;
    this._domain = m._domain;
    this.domain_init = m.domain_init;
  };

  async mutate(host) {
    await host.raster.parse();

    this.host = host;

    this.raster = host.raster;
    this.vectors = host.vectors;
    this.colorscale = host.colorscale;

    this.domain = host.domain;
    this._domain = host._domain;
    this.domain_init = host.domain_init;

    this.card.refresh();

    return this;
  };

  items_init() {
    for (let i of this.config.collection) {
      const d = DST[i];
      d.card = d.card || new dscard(d);
      d.collection = this;

      this.items.push(d);
    }
  };

  /*
   * analysis_fn
   *
   * Scaling function that sets the behaviour of a dataset when contributing to
   * an analysis. Whether it's a filter, a linearised part, etc...
   *
   * @param "i" string
   *   name of the current index being drawn and decide if the range of the
   *   function should be inverted.
   *
   * returns function (ds domain) -> [0,1]
   */

  analysis_fn(i) {
    let s = null;
    if (!this.analysis) return s;

    const t = this._domain;
    const v = this.analysis.scale;
    const r = this.invert && this.invert.includes(i) ? [1,0] : [0,1];

    switch (v) {
    case 'key-delta': {
      if (!maybe(this.csv, 'table')) return (s = x => 1);

      s = x => {
        let z = this.csv.table[x];

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
            .range(NORM_STOPS);

      s = x => (x >= this._domain[0]) && (x <= this._domain[1]) ? q(x) : -1;

      break;
    }

    case 'linear':
    default: {
      if (t[0] === t[1]) return s = x => (x === +t[0]) ? 1 : -1;
      s = d3.scaleLinear().domain(t).range(r).clamp(this.analysis.clamp);
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

    if (!v && this.card) this.card.remove();
  };

  async load(arg) {
    if (this.items) {
      // Collections will (as of now) always share rasters.
      //
      if (this.raster) this.raster.parse();

      await Promise.all(this.items.map(d => d.load(arg)));
    }

    if (this.mutant) {
      await until(_ => maybe(this.hosts, 'length') === this.config.mutant_targets.length);
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

  static get list() {
    return Object.keys(DST).map(i => DST[i]);
  };
};

window.DST = {};

/*
 * ea_datasets_init
 *
 * 1. fetch the datasets list from the API
 * 2. generate DS objects
 * 3. initialise mutants and collections
 *
 * @param "id" uuid
 * @param "inputs" string[] with DS.id's
 * @param "pack" string ("all" ...)
 * @param "callback" function to run with the boundaries
 *
 * returns DS[]
 */

async function ea_datasets_init(id, inputs, pack, callback) {
  let select = ["*", "category:categories(*)", "df:_datasets_files(*,file:files(*))"];

  let bounds;
  let boundaries_id;

  await ea_api("geography_boundaries", { "geography_id": `eq.${id}`}, { object: true })
    .then(r => boundaries_id = r.id);

  const bp = {
    "id": `eq.${boundaries_id}`,
    "select": select,
    "df.active": "eq.true"
  };

  await ea_api("datasets", bp, { object: true })
    .then(async e => {
      let ds = new DS(e);

      ds.active = false;

      await ds.load('vectors');
      await ds.load('csv');
      await ds.load('raster');

      if (!(bounds = ds.vectors.bounds)) throw `'boundaries' dataset has no vectors.bounds`;
    });

  pack = maybe(pack, 'length') ? pack : 'all';

  const p = {
    "geography_id": `eq.${id}`,
    "select": select,
    "pack": `eq.${pack}`,
    "online": "eq.true",
    "df.active": "eq.true"
  };

  await ea_api("datasets", p)
    .then(r => r.filter(d => d.category.name !== 'boundaries'))
    .then(r => r.map(e => new DS(e, inputs.includes(e.category.name))));

  // We need all the datasets to be initialised _before_ setting
  // mutant/collection attributes (order is never guaranteed)
  //
  DS.list.filter(d => d.mutant).forEach(d => d.mutant_init());
  DS.list.filter(d => d.items).forEach(d => d.items_init());

  callback(bounds);
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

  throw Error(`"Dataset ${this.name} disabled. Failed to get ${format}.`);
};

function ea_datasets_csv() {
  if (this.csv.data) return;

  return fetch(this.csv.endpoint)
    .catch(err => ea_datasets_fail.call(this, "CSV"))
    .then(d => d.text())
    .then(r => d3.csvParse(r))
    .then(d => this.csv.data = d);
};

function ea_datasets_tiff() {
  async function run_it(blob) {
    function draw() {
      const r = this.raster;

      if (!r.canvas) {
        r.canvas = ea_plot({
          canvas: ce('canvas'),
          data: r.data,
          width: r.width,
          height: r.height,
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

    if (!maybe(this.raster, 'data')) {
      const tiff = await GeoTIFF.fromBlob(blob);
      const image = await tiff.getImage();
      const rasters = await image.readRasters();

      this.raster.data = rasters[0];
      this.raster.width = image.getWidth();
      this.raster.height = image.getHeight();
      this.raster.nodata = parseFloat(tiff.fileDirectories[0][0].GDAL_NODATA);
    }

    if (this.datatype === 'raster') draw.call(this);
  };

  let t;
  if (maybe(this.raster, 'data')) {
    t = new Promise((res, rej) => res());
  }

  else {
    t = fetch(this.raster.endpoint)
      .catch(err => ea_datasets_fail.call(this, "TIFF"))
      .then(r => {
        if (!(r.ok && r.status < 400)) ea_datasets_fail.call(this, "TIFF");
        else return r;
      })
      .then(r => r.blob())
  }

  return t.then(b => run_it.call(this, b));
};

function ea_datasets_geojson() {
  if (this.vectors.features)
    return new Promise((res, rej) => res());

  return fetch(this.vectors.endpoint)
    .catch(err => ea_datasets_fail.call(this, "GEOJSON"))
    .then(r => {
      if (!(r.ok && r.status < 400)) ea_datasets_fail.call(this, "GEOJSON");
      else return r;
    })
    .then(r => r.json())
    .then(r => {
      this.vectors.features = r;
      if (this.id === 'boundaries') this.vectors.bounds = geojsonExtent(r);
    });
};

function ea_datasets_points() {
  return ea_datasets_geojson.call(this)
    .then(_ => {
      const v = this.vectors;

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
      let da = [1];

      // mapbox-gl does not follow SVG's stroke-dasharray convention when it comes
      // to single numbered arrays.
      //
      if (this.vectors.dasharray) {
        da = this.vectors.dasharray.split(' ').map(x => +x);
        if (da.length === 1) {
          (da[0] === 0) ?
            da = [1] :
            da = [da[0], da[0]];
        }
      }

      const fs = this.vectors.features.features;
      const specs = this.vectors.specs;

      const criteria = [];

      for (let i = 0; i < fs.length; i += 1) {
        if (specs) {
          const c = { params: [] };
          let p = false;

          for (let s of specs) {
            let m;

            const r = new RegExp(s.match);
            const v = fs[i].properties[s.key];

            if (!v) continue;

            const vs = v + "";

            if (vs === s.match || (m = vs.match(r))) {
              c[s.key] = vs ? vs : m[1];
              if (c.params.indexOf(s.key) < 0) c.params.push(s.key);

              if (has(s, 'stroke')) {
                fs[i].properties['__color'] = s['stroke'];
                c['stroke'] = s['stroke'];
              }

              if (has(s, 'stroke-width')) {
                fs[i].properties['__width'] = s['stroke-width'];
                c['stroke-width'] = s['stroke-width'];
              }

              p = true;
            }
          }

          if (p && criteria.indexOf(JSON.stringify(c)) < 0) criteria.push(JSON.stringify(c));
        }
        else {
          fs[i].properties['__color'] = this.vectors.stroke;
          fs[i].properties['__width'] = this.vectors.width || 1;
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

      if (criteria.length)
        this.card.line_legends(criteria.map(x => JSON.parse(x)));
    });
};

function ea_datasets_polygons() {
  return ea_datasets_geojson.call(this)
    .then(async _ => {
      const v = this.vectors;

      if (this.csv) {
        let col;
        if (this.timeline) {
          await ea_datasets_polygons_csv_timeline.call(this);
          col = ea_timeline_date(null);
        }
        else if (this.config.column) col = this.config.column;

        ea_datasets_polygons_csv.call(this, col);
      }

      const fs = this.vectors.features.features;
      for (let i = 0; i < fs.length; i += 1)
        fs[i].id = fs[i].properties[this.vectors.key];

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
          "fill-color": this.datatype.match("polygons-") ? ['get', '__color'] : v.fill,
          "fill-outline-color": v.stroke,
          "fill-opacity": [ "case", [ "boolean", [ "get", "__hidden" ], false ], 0, 1 * v.opacity ]
        },
      });
    });
};

async function ea_datasets_polygons_csv(col) {
  await until(_ => this.csv.data && this.vectors.features);

  if (this.config.column)
    this.csv.table = ea_datasets_table.call(this);

  const data = this.csv.data;
  const stops = this.colorscale.stops;

  if (!data) warn(this.id, "has no csv.data");

  const l = d3.scaleQuantize().domain(this.domain).range(stops);
  const s = x => (null === x || undefined === x || x === "") ? "rgba(155,155,155,1)" : l(x);

  this.csv.scale = l;

  if (!data) {
    warn("No data for", this.id);
    return;
  }

  const fs = this.vectors.features.features;
  for (let i = 0; i < fs.length; i += 1) {
    let row = data.find(r => +r[this.csv.key] === +fs[i].properties[this.vectors.key]);

    if (!row) {
      warn(`${this.id} NO ROW!`, i, this.csv.key, this.vectors.key, data);
      continue;
    }
    fs[i].properties.__color = s(+row[col]);
  }

  this.update_source(this.vectors.features);

  if (this.card) this.card.refresh();
};

function ea_datasets_table() {
  const table = {};
  const data = this.csv.data;

  for (let i = 0; i < data.length; i++) {
    d = data[i];
    table[d[this.csv.key]] = +d[this.config.column];
  }

  return table;
};
