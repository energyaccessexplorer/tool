class DS {
  constructor(o) {
    this.id = o.category.name;

    this.category = o.category;

    let config = o.configuration || {};
    this.config = config;

    this.name = config.name_override || o.category.name_long;

    this.indexname = (o.category.configuration.path && o.category.configuration.path[0]) || null;

    this.weight = o.category.weight || 2;

    this.metadata = o.metadata;

    this.invert = config.invert_override || o.category.configuration.invert;

    this.mutant = !!config.mutant;

    this.collection = !!config.collection;

    if (o.heatmap_file) {
      this.heatmap = o.category.heatmap
      this.heatmap.endpoint = o.heatmap_file.endpoint;
      this.heatmap.parse = ea_datasets_tiff;

      this.multifilter = (this.heatmap.scale === 'multi-key-delta');

      if (!this.mutant && !this.collection)
        ea_datasets_color_scale.call(this);
    }

    if (o.vectors_file) {
      this.vectors = o.category.vectors;
      this.vectors.endpoint = o.vectors_file.endpoint;

      switch (this.vectors.shape_type) {
      case "points": {
        this.vectors.parse = ea_datasets_points;
        break;
      }

      case "polygons": {
        this.vectors.parse = ea_datasets_polygons;
        break;
      }

      case "lines": {
        this.vectors.parse = ea_datasets_lines;
        break;
      }
      }
    }

    if (o.csv_file) {
      this.csv = config.csv;
      this.csv.endpoint = o.csv_file.endpoint;
      this.csv.parse = ea_datasets_csv;

      if (this.csv.options) this.filter_option = Object.keys(this.csv.options)[0];
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
    let p = this.presets[preset]

    if (!presetsempty && p) {
      this.weight = p.weight;
    }

    this.active = active || (!presetsempty && p);

    this.datatype = (_ => {
      let t = null;

      if (this.vectors) t = this.vectors.shape_type;
      else if (this.heatmap) t = "raster";
      else if (this.parent) t = this.parent.datatype;
      else if (this.mutant) t = "mutant";
      else throw `Cannot decide datatype of ${this.id}`;

      return t;
    })();
  };

  mutant_init() {
    if (!this.mutant) throw `${this.id} is not a mutant. Bye.`

    let m = DS.get(this.config.mutant_targets[0]);

    this.host = m;

    this.datatype = m.datatype;

    this.raster = m.raster;
    this.vectors = m.vectors;
    this.heatmap = m.heatmap;

    this.color_scale_fn = m.color_scale_fn;
    this.scale_stops = m.scale_stops;
  };

  async mutate(host) {
    if (!this.mutant) throw `${this.id} is not a mutant.`;

    if (!this.config.mutant_targets.includes(host.id))
      throw `${this.id} is not configured to mutate into ${host.id}.`

    this.host = host;

    await host.heatmap.parse.call(host);

    this.datatype = host.datatype;

    this.heatmap = host.heatmap;
    this.raster = host.raster;
    this.vectors = host.vectors;

    this.color_scale_fn = host.color_scale_fn;
    this.scale_stops = host.scale_stops;

    this.input_el.refresh();

    let src;
    if (src = ea_mapbox.getSource(this.id)) {
      src.canvas = ea_mapbox.getSource(host.id).canvas;
      src.play();
      src.pause();
    }

    return this;
  };

  collection_init() {
    if (!this.collection) throw `${this.id} is not a collection. Bye.`
  };

  async multifilter_init() {
    if (!this.csv) return;

    await this.csv.parse.call(this);
    await this.heatmap.parse.call(this);
    await this.vectors.parse.call(this);

    const cso = this.config.polygons[Object.keys(this.csv.options)[0]];

    let cs = this.vectors.color_stops;
    if (!cs || !cs.length) cs = this.vectors.color_stops = ea_color_scale.stops;

    const min = Math.min.apply(null, this.features.features.map(f => f.properties[cso]));
    const max = Math.max.apply(null, this.features.features.map(f => f.properties[cso]));

    const f = max <= 1 ? 1 : 100;
    const d = Array(cs.length).fill(0).map((x,i) => (0 + i * (f/(cs.length-1))));
    const s = d3.scaleLinear().domain(d).range(cs);

    this.color_scale_fn = s;
    this.scale_stops = d;

    for (let v in this.csv.options) {
      // we can do this because category is plain JSON, not javascript.
      let cat = JSON.parse(JSON.stringify(this.category));
      cat.name = this.id + "-" + v;
      cat.name_long = this.csv.options[v];

      let d = new DS({ category: cat });

      d.subid = v;
      d.parent = this;
      d.datatype = this.datatype;
      d.config = {};

      Object.assign(d.heatmap = {}, this.heatmap);
      Object.assign(d.raster = {}, this.raster);

      Object.assign(d.vectors = {}, this.vectors);
      Object.assign(d.features = {}, this.features);

      Object.assign(d.csv = {}, this.csv);
      Object.assign(d.table = {}, this.table);

      d.init(this.active, null);

      d.input_el = new dsinput(d);
      d.controls_el = new dscontrols(d);

      let src; if (src = ea_mapbox.getSource(d.id)) { src.setData(d.features); }
    }
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

    const d = (this.heatmap.domain && [this.heatmap.domain.min, this.heatmap.domain.max]) || [0,1];
    const t = this.domain;
    const v = this.heatmap.scale;
    const o = this.filter_option;
    const r = ((typeof this.invert !== 'undefined' && this.invert.includes(i)) ? [1,0] : [0,1]);

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
      if (!this.table) return (s = x => 1);

      s = x => {
        let z = this.table[x];
        if (!z) return -1;

        return (!x || x === this.raster.nodata) ? -1 : lin.clamp(this.heatmap.clamp)(z[o]);
      };
      break;
    }

    case 'key-delta': {
      if (!this.table) return (s = x => 1);

      if (this.weight !== 1) {
        console.warn(`${this.id} is 'key-delta' but has weight ${this.weight}.
key-delta functions are meant to be filters.
Forcing dataset's weight to 1.`);
        this.weight = 1;
      }

      s = x => {
        let z = this.table[x];
        if (!z) return -1;

        return (z[o] < t[0] || z[o] > t[1]) ? -1 : 1;
      };
      break;
    }

    case 'multi-key-delta': {
      if (!this.table) return (s = x => 1);

      let bs = DS.all.filter(d => (d.parent === this) && d.active);

      s = x => {
        let z = this.table[x];
        if (!z) return -1;

        let a = 0;

        for (let b of bs) {
          if (a === -1) return a;

          let bo = b.subid;
          let to = b.domain;

          a = (z[bo] < to[0] || z[bo] > to[1]) ? -1 : 1;
        }

        return a;
      };
      break;
    }

    case 'linear':
    default: {
      s = lin.clamp(this.heatmap.clamp);
      break;
    }
    }

    return s;
  };

  async visible(t) {
    if (this.collection) {
      await Promise.all(this.config.collection.map(i => DS.get(i).visible(t)));
      return;
    }

    if (ea_mapbox.getLayer(this.id))
      ea_mapbox.setLayoutProperty(this.id, 'visibility', t ? 'visible' : 'none');
  };

  async turn(v, draw) {
    if (v) {
      if (this.controls_el) this.controls_el.loading(true);
      await this.load();
      if (this.controls_el) this.controls_el.loading(false);
    }

    if (this.collection) {
      await Promise.all(this.config.collection.map(i => DS.get(i).turn(v, draw)));
      this.controls_el.turn(v);

      return;
    }

    if (this.mutant) this.mutate(this.host);

    if (this.controls_el) this.controls_el.turn(v);

    this.visible(v && draw);
  };

  async load(arg) {
    if (this.collection) {
      await Promise.all(this.config.collection.map(i => DS.get(i).load(arg)));

      // TODO: Remove this? It's a hack for transmission-lines-collection not
      // having per-element rasters but a single collection raster.
      //
      if (this.heatmap) await this.heatmap.parse.call(this);

      return;
    }

    if (!arg)
      await Promise.all(['vectors', 'csv', 'heatmap'].map(i => (this[i]) ? this.load(i) : null));
    else
      if (this[arg]) await this[arg].parse.call(this);
  };

  async raise() {
    if (ea_mapbox.getLayer(this.id))
      ea_mapbox.moveLayer(this.id, ea_mapbox.first_symbol);

    if (this.collection) {
      for (let i of this.config.collection)
        DS.get(i).raise();
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
 * ea_datasets_list_init
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

async function ea_datasets_list_init(id, inputs, preset) {
  let attrs = '*,heatmap_file(*),vectors_file(*),csv_file(*),category(*)';

  await ea_client(`${ea_settings.database}/datasets?geography_id=eq.${id}&select=${attrs}`)
    .then(r => r.map(e => {
      let active = (inputs.includes(e.category.name));

      let ds = new DS(e);
      ds.init(active, preset);
    }));

  // We need all the datasets to be initialised _before_ setting
  // mutant/collection attributes (order is never guaranteed)
  //
  DS.all.filter(d => d.mutant).forEach(d => d.mutant_init());
  DS.all.filter(d => d.collection).forEach(d => d.collection_init());
  DS.all.filter(d => d.multifilter).forEach(d => d.multifilter_init());

  DS.all.forEach(d => {
    d.input_el = new dsinput(d);
    d.controls_el = new dscontrols(d);
  });

  return DS.all;
};

function ea_datasets_color_scale() {
  let cs = this.heatmap.color_stops;
  let c = ea_color_scale.name;
  let d = ea_color_scale.domain;

  if (!cs || !cs.length)
    this.heatmap.color_stops = cs = ea_color_scale.stops;
  else
    d = Array(cs.length).fill(0).map((x,i) => (0 + i * (1/(cs.length-1))));

  this.scale_stops = d;

  {
    let intervals;

    if (this.heatmap.configuration && (intervals = this.heatmap.configuration.intervals)) {
      let l = intervals.length;

      let s = d3.scaleLinear()
          .domain([0,255])
          .range([this.heatmap.domain.min, this.heatmap.domain.max])
          .clamp(true);

      const a = new Uint8Array(1024).fill(-1);
      for (let i = 0; i < 1024; i += 4) {
        let j = interval_index(s(i/4), intervals, this.heatmap.clamp);

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

      plotty.colorscales[c = this.id] = a;

      this.color_theme = c;

      this.color_scale_fn = (x,i) => cs[i];
    }

    else {
      plotty.addColorScale((c = this.id), cs, d);

      this.color_theme = c;

      this.color_scale_fn = d3.scaleLinear()
        .domain(d)
        .range(cs)
        .clamp(this.heatmap.clamp || false);
    }
  }
};

/*
 * The following functions fetch and load the different types of data to the
 * datasets geojsons (points, lines or polygons), CSV's or rasters.
 */

async function ea_datasets_geojson(callback) {
  if (this.features) callback();

  else {
    const endpoint = this.vectors.endpoint;

    if (!endpoint) {
      console.warn(`Dataset '${this.id}' should have a vectors (maybe a file-association missing). Endpoint is: `, endpoint);
      return this;
    }

    await ea_client(endpoint)
      .then(r => {
        this.features = r;

        try {
          this.vectors.bounds = geojsonExtent(r);
        }
        catch (err) {
          if (this.id === 'boundaries') throw err;

          console.warn(`geojsonExtent failed for '${this.id}'. This is not fatal. Here's the error:`, r);
          console.warn(err);
        }
        callback();
      });
  }

  return this;
};

async function ea_datasets_csv(callback) {
  if (this.table) return;

  else {
    const endpoint = this.csv.endpoint;

    if (!endpoint) {
      console.warn(`Dataset '${this.id}' should have a csv (maybe a file-association missing). Endpoint is: `, endpoint);
      return this;
    }

    d3.csv(endpoint, d => {
      const o = { oid: +d[this.csv.oid] };
      Object.keys(this.csv.options).forEach(k => o[k] = +d[k] || d[k]);
      return o;
    })
      .then(data => {
        // HACK: so we can access them by oid (as an array, they are
        // generally a sequence starting at 1)
        //
        if (data[0]['oid'] === 1) data.unshift({ oid: 0 });

        this.table = data;
      })
      .catch(e => {
        console.warn(`${endpoint} raised an error and several datasets might depend on this. Bye!`);
      });
  }
};

async function ea_datasets_tiff() {
  async function run_it(blob) {
    function draw(canvas) {
      if (this.vectors) return;

      let d = this.heatmap.domain;

      if (!ea_mapbox.getSource(this.id)) {
        (new plotty.plot({
          canvas: canvas,
          data: this.raster.data,
          width: this.raster.width,
          height: this.raster.height,
          domain: [d.min, d.max],
          noDataValue: this.raster.nodata,
          colorScale: this.color_theme,
        })).render();

        ea_mapbox.addSource(this.id, {
          "type": "canvas",
          "canvas": `canvas-${this.id}`,
          "animate": false,
          "coordinates": ea_mapbox.coords
        });
      }

      if (!ea_mapbox.getLayer(this.id)) {
        ea_mapbox.addLayer({
          "id": this.id,
          "type": 'raster',
          "source": this.id,
          "layout": {
            "visibility": "none",
          },
          "paint": {
            "raster-resampling": "nearest"
          }
        }, ea_mapbox.first_symbol);
      }

      // TODO: Remove this? It's a hack for transmission-lines-collection not
      // having per-element rasters but a single collection raster.
      //
      if (this.id === 'transmission-lines-collection') {
        ea_mapbox.setLayoutProperty(this.id, 'visibility', 'none');
      }
    };

    if (this.raster && this.raster.data) {
      draw.call(this, qs(`canvas#canvas-${this.id}`));
    }

    else {
      const tiff = await GeoTIFF.fromBlob(blob);
      const image = await tiff.getImage();
      const rasters = await image.readRasters();

      this.raster = {
        data: rasters[0],
        width: image.getWidth(),
        height: image.getHeight(),
        nodata: parseFloat(tiff.fileDirectories[0][0].GDAL_NODATA)
      };

      let c = document.createElement('canvas');
      c.id = `canvas-${this.id}`;
      c.style.display = 'none';

      document.body.append(c);

      if (ea_mapbox) {
        draw.call(this, c);
      }
    }

    return this;
  };

  if (this.raster && this.raster.data) {
    run_it.call(this);
    return this;
  }

  const endpoint = this.heatmap.endpoint;

  await fetch(endpoint)
    .then(ea_client_check)
    .then(r => r.blob())
    .then(b => run_it.call(this, b));

  return this;
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
        "layout": {
          "visibility": "none",
        },
        "paint": {
          "circle-radius": this.vectors.width || 3,
          "circle-opacity": this.vectors.opacity,
          "circle-color": this.vectors.fill || 'cyan',
          "circle-stroke-width": this.vectors['stroke-width'] || 1,
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

    let da = this.vectors.dasharray.split(' ').map(x => +x);

    // mapbox-gl does not follow SVG's stroke-dasharray convention when it comes
    // to single numbered arrays.
    //
    if (da.length === 1) {
      (da[0] === 0) ?
        da = [1] :
        da = [da[0], da[0]];
    }

    if (!ea_mapbox.getLayer(this.id))
      ea_mapbox.addLayer({
        "id": this.id,
        "type": "line",
        "source": this.id,
        "layout": {
          "visibility": "none",
        },
        "paint": {
          "line-width": this.vectors.width || 1,
          "line-color": this.vectors.stroke,
          "line-dasharray": da,
        },
      }, ea_mapbox.first_symbol);
  });
};

async function ea_datasets_polygons() {
  return ea_datasets_geojson.call(this, _ => {
    if (!ea_mapbox.getSource(this.id)) {
      if (this.parent) {
        const p = this.parent.config.polygons[this.subid];
        this.features.features.forEach(f => f.properties.color = this.parent.color_scale_fn(f.properties[p]));
      }

      ea_mapbox.addSource(this.id, {
        "type": "geojson",
        "data": this.features
      });
    }

    if (!ea_mapbox.getLayer(this.id)) {
      ea_mapbox.addLayer({
        "id": this.id,
        "type": "fill",
        "source": this.id,
        "layout": {
          "visibility": "none",
        },
        "paint": {
          "fill-color": this.subid ? ['get', 'color'] : this.vectors.fill,
          "fill-outline-color": this.vectors.stroke,
          "fill-opacity": this.vectors.opacity,
        },
      }, ea_mapbox.first_symbol);
    }
  });
};
