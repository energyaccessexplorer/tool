window.DSTable = {};

class DS {
  constructor(e) {
    this.id = e.category.name;

    this.category = e.category;

    this.name_long = (e.configuration && e.configuration.name_override) ?
      e.configuration.name_override :
      e.category.name_long;

    let tmp_index = ea_category_tree.map(b => {
      return {
        "name": b.name || null,
        "datasets": b.subbranches.map(i => i.datasets.map(d=> d.id)).flat() }
    }).find(i => i.datasets.includes(this.id));

    this.indexname = tmp_index ? tmp_index.name : null;

    this.unit = e.category.unit;

    this.weight = e.category.weight || 2;

    this.metadata = e.metadata;

    if (e.category.metadata && (e.category.metadata.why)) {
      this.why = e.category.metadata.why;
    }

    this.configuration = e.configuration;

    this.mutant = !!(e.configuration && e.configuration.mutant);

    this.collection = !!(e.configuration && e.configuration.collection);

    if (e.heatmap_file) {
      this.heatmap = e.category.heatmap
      this.heatmap.endpoint = e.heatmap_file.endpoint;
      this.heatmap.parse = ea_datasets_tiff;

      this.multifilter = !!(this.heatmap && this.heatmap.scale === 'multi-key-delta');

      if (!this.mutant && !this.collection)
        this.gen_color_scale();

      if (this.heatmap) {
        let hi = this.heatmap.init;
        if (hi) this.init_domain = [hi.min, hi.max];
      }
    }

    if (e.vectors_file) {
      this.vectors = e.category.vectors;
      this.vectors.endpoint = e.vectors_file.endpoint;

      switch (this.vectors.shape_type) {
      case "points": {
        this.vectors.symbol_svg = ea_svg_points_symbol.call(this);
        this.vectors.parse = ea_datasets_points;
        break;
      }

      case "polygons": {
        this.vectors.symbol_svg = ea_svg_polygons_symbol.call(this);
        this.vectors.parse = ea_datasets_polygons;
        break;
      }

      case "lines": {
        this.vectors.symbol_svg = ea_svg_lines_symbol.call(this);
        this.vectors.parse = ea_datasets_lines;
        break;
      }
      }
    }

    if (e.csv_file) {
      this.csv = e.configuration.csv;
      this.csv.endpoint = e.csv_file.endpoint;
      this.csv.parse = ea_datasets_csv;

      if (this.csv.options) this.filter_option = Object.keys(this.csv.options)[0];
    }

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
  };

  init(active, preset) {
    let presetsempty = Object.keys(this.presets).length === 0;
    let p = this.presets[preset]

    if (!presetsempty && p) {
      this.weight = p.weight;
      // o.init_domain = [p.min, p.max];
      this.init_domain = null;
    }

    this.active = active || (!presetsempty && p);

    this.datatype = this.decidedatatype();
  };

  decidedatatype() {
    if (this.datatype) return this.datatype;

    if (this.vectors) return this.vectors.shape_type;
    else if (this.heatmap) return "raster";
    else if (this.parent) return this.parent.datatype;
    else if (this.mutant) return "mutant";

    throw `Cannot decide datatype of ${this.id}`;
  };

  mutant_init() {
    if (!this.mutant) throw `${this.id} is not a mutant. Bye.`

    let m = DS.named(this.configuration.mutant_targets[0]);

    this.configuration.host = m.id;

    this.raster = m.raster;
    this.vectors = m.vectors;
    this.heatmap = m.heatmap;

    this.color_scale_svg = m.color_scale_svg;
    this.color_scale_fn = m.color_scale_fn;
  };

  async mutate(host) {
    if (!this.mutant) throw `${this.id} is not a mutant.`;

    if (!this.configuration.mutant_targets.includes(host.id))
      throw `${this.id} is not configured to mutate into ${host.id}.`

    this.configuration.host = host.id;

    this.color_scale_svg = host.color_scale_svg;
    this.color_scale_fn = host.color_scale_fn;

    await host.heatmap.parse.call(host);

    this.heatmap = host.heatmap;
    this.raster = host.raster;
    this.vectors = host.vectors;

    const s = qs(DS.named(this.id).input_el, '[name=svg]');
    elem_empty(s); s.append(host.color_scale_svg);

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

  multifilter_init() {
    if (!this.csv) return;

    for (let v in this.csv.options) {
      // we can do this because category is plain JSON, not javascript.
      const cat = JSON.parse(JSON.stringify(this.category));
      cat.name = this.id + "-" + v;

      let d = new DS({ category: cat });

      d.subid = v;
      d.parent = this;
      d.datatype = this.datatype;

      d.init(false, null);

      d.heatmap = this.heatmap;
      d.vectors = this.vectors;
      d.csv = this.csv;

      d.active_filter = true;

      DSTable[cat.name] = d;
    };
  };

  multifilter_set(o) {
    if (!this.table && this.features) {
      this.features.features.forEach((f,i) => f.properties.color =  d3.schemeCategory10[i%10]);
      return;
    }

    if (this.subid) {
      this.parent.multifilter_set(o);
      return;
    }

    if (o === this.filter_option) return;

    if (o)
      this.filter_option = o;
    else {
      o = Object.keys(this.csv.options)[0];
      this.name_long = this.csv.options[o];
    }

    if (this.features) {
      const cso = this.configuration.polygons[o];
      let cs = this.vectors.color_stops;
      if (!cs || !cs.length) cs = this.vectors.color_stops = ea_default_color_stops;

      const min = Math.min.apply(null, this.features.features.map(f => f.properties[cso]));
      const max = Math.max.apply(null, this.features.features.map(f => f.properties[cso]));

      const f = max <= 1 ? 1 : 100;
      const d = Array(cs.length).fill(0).map((x,i) => (0 + i * (f/(cs.length-1))));
      const s = d3.scaleLinear().domain(d).range(cs);

      this.features.features.forEach(f => f.properties.color = s(f.properties[cso]));
      this.color_scale_svg = ea_svg_color_steps(s,d);

      let src; if (src = ea_mapbox.getSource(this.id)) src.setData(this.features);

      const i = qs(DS.named(this.id).input_el, '[name=svg]');
      elem_empty(i); i.append(this.color_scale_svg);
    }
  };

  /*
   * ea_datasets_scale_fn
   *
   * Extract the scaling function given a dataset and the current parameters.
   *
   * @param "indexname" string.
   *   current index being drawn and decide if the range of the function should be
   *   inverted.
   *
   * returns function (ds domain) -> [0,1]
   */

  scale_fn(indexname) {
    let s = null;

    const d = (this.heatmap.domain && [this.heatmap.domain.min, this.heatmap.domain.max]) || [0,1];
    const t = this.tmp_domain;
    const v = this.heatmap.scale;
    const o = this.filter_option;
    const r = ((typeof this.invert !== 'undefined' && this.invert.includes(indexname)) ? [1,0] : [0,1]);

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

        return (!x || x === this.nodata) ? -1 : lin.clamp(this.heatmap.clamp)(z[o]);
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

      let bs = DS.list.filter(d => d.id.match(new RegExp(`^${this.id}-`)) && d.active_filter);

      s = x => {
        let z = this.table[x];
        if (!z) return -1;

        let a = 0;

        for (let b of bs) {
          if (a === -1) return a;

          let bo = b.subid;
          let to = b.tmp_domain;

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

  gen_color_scale() {
    let cs = this.heatmap.color_stops;
    let c = ea_default_color_scale;
    let d = ea_default_color_domain;

    if (!cs || !cs.length)
      this.heatmap.color_stops = cs = ea_default_color_stops;
    else {
      d = Array(cs.length).fill(0).map((x,i) => (0 + i * (1/(cs.length-1))));
    }

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

        this.heatmap.color_scale = c;

        this.color_scale_fn = (x,i) => cs[i];
      }

      else {
        plotty.addColorScale((c = this.id), cs, d);

        this.heatmap.color_scale = c;

        this.color_scale_fn = d3.scaleLinear()
          .domain(d)
          .range(cs)
          .clamp(this.heatmap.clamp || false);
      }
    }

    this.color_scale_svg = ea_svg_color_steps(this.color_scale_fn, d);
  };

  async visible(t) {
    if (this.collection) {
      await Promise.all(this.configuration.collection.map(i => DS.named(i).visible(t)));
      return;
    }

    if (ea_mapbox.getLayer(this.id))
      ea_mapbox.setLayoutProperty(this.id, 'visibility', t ? 'visible' : 'none');
  }

  async turn(v, draw) {
    if (v) {
      if (this.controls_el) this.controls_el.loading(true);
      await this.load();
      if (this.controls_el) this.controls_el.loading(false);
    }

    if (this.collection) {
      await Promise.all(this.configuration.collection.map(i => DS.named(i).turn(v, draw)));
      return;
    }

    if (this.mutant) {
      this.mutate(DS.named(this.configuration.host));
    }

    if (this.controls_el) this.controls_el.turn(v);

    this.visible(v && draw);
  };

  async load(arg) {
    if (this.collection) {
      await Promise.all(this.configuration.collection.map(i => DS.named(i).load(arg)));

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

/*
 * ea_datasets_list_init
 *
 * 1. fetch the datasets list from the API
 * 2. generate DS objects
 * 3. store them in DSTable
 * 4. initialise mutants and collections
 *
 * @param "country_id"
 * @param "inputs" string[] with DS.id's
 * @param "preset" string ("custom", "market", "investment", "planning")
 *
 * returns DS[]
 */

async function ea_datasets_list_init(country_id, inputs, preset) {
  let attrs = '*,heatmap_file(*),vectors_file(*),csv_file(*),category(*)';

  await ea_client(
    `${ea_settings.database}/datasets?country_id=eq.${country_id}&select=${attrs}`, 'GET', null,
    r => r.map(e => {
      let active = (inputs.includes(e.category.name));

      let ds = new DS(e);
      ds.init(active, preset);

      return DSTable[e.category_name] = ds;
    }));

  // We need all the datasets to be initialised _before_ setting
  // mutant/collection attributes (order is never guaranteed)
  //
  DS.list.filter(d => d.mutant).forEach(d => d.mutant_init());
  DS.list.filter(d => d.collection).forEach(d => d.collection_init());
  DS.list.filter(d => d.multifilter).forEach(d => d.multifilter_init());

  return DS.list;
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

    await ea_client(
      endpoint, 'GET', null,
      async r => {
        this.features = r;
        callback();
      }
    );
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
          data: this.raster,
          width: this.width,
          height: this.height,
          domain: [d.min, d.max],
          noDataValue: this.nodata,
          colorScale: this.heatmap.color_scale,
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

    if (this.raster) {
      draw.call(this, document.querySelector(`canvas#canvas-${this.id}`));
    }

    else {
      const tiff = await GeoTIFF.fromBlob(blob);
      const image = await tiff.getImage();
      const rasters = await image.readRasters();

      this.raster = rasters[0];

      this.width = image.getWidth();
      this.height = image.getHeight();

      this.nodata = parseFloat(tiff.fileDirectories[0][0].GDAL_NODATA);

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

  if (this.raster) {
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
      ea_mapbox.addSource(this.id, {
        "type": "geojson",
        "data": this.features
      });
    }

    if (!ea_mapbox.getLayer(this.id)) {
      this.multifilter_set(this.subid);

      ea_mapbox.addLayer({
        "id": this.id,
        "type": "fill",
        "source": this.id,
        "layout": {
          "visibility": "none",
        },
        "paint": {
          "fill-color": ['get', 'color'],
          "fill-outline-color": this.vectors.stroke,
        },
      }, ea_mapbox.first_symbol);
    }
  });
};
