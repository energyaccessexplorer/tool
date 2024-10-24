import {
	super_error,
	coordinates_to_raster_pixel,
} from './utils.js';

import {
	drawcanvas as plot_drawcanvas,
} from './plot.js';

async function fetchcheck(endpoint, format) {
	await until(_ => MAPBOX.isStyleLoaded()); // <-- magic line. If you remove it, no more unicorns!

	if (endpoint.match(/^(blob:)?http/)) ;
	else endpoint = EAE['settings'].storage + endpoint;

	return fetch(endpoint)
		.catch(_ => {
			fail.call(this);
			throw new Error(`Network error: Could not fetch ${format} from ${endpoint}`);
		})
		.then(r => {
			if (r && r.ok && r.status < 400) return r;
			else {
				fail.call(this);
				throw new Error(`${format} Endpoint gave ${r.status} response.`);
			}
		});
};

export function fail(msg = "") {
	if (this === OUTLINE) {
		super_error("Dataset error", `
Failed to process dataset '${this.name}'.
This is fatal. Thanks for all the fish.

${msg}`);
		return;
	}

	FLASH.push({
		"type":    'error',
		"timeout": 5000,
		"title":   "Dataset error",
		"message": `
Failed to process dataset '${this.name}'.
This is not fatal but the dataset is now disabled.

${msg}`,
	});

	this.disable(msg);
};

export function csv() {
	if (this.csv.data) return;

	return fetchcheck.call(this, this.csv.endpoint, "CSV")
		.then(d => d.text())
		.then(r => this.csv.data = d3.csvParse(r, d3.autoType))
		.then(table_setup.bind(this));
};

function table_setup() {
	// TODO: polygons_valued_columns will get replaced with
	//
	// this.csv.column = this.config.csv_column;
	// this.csv.key = this.csv.data.columns[0];
	this.csv.column = maybe(this.config, 'polygons_valued_columns', 'value');
	this.csv.key = maybe(this.config, 'polygons_valued_columns', 'key');

	this.csv.table = table_refresh.call(this);

	if (or(this.domain,
	       !this.csv.table,
	       this.datatype === 'polygons-boundaries'))
		return;

	const arr = [];
	for (let i in this.csv.table) arr[i] = this.csv.table[i];

	const min = d3.min(arr);
	const max = d3.max(arr);

	this.domain = { min, max };
	this._domain = { min, max };
};

function table_refresh() {
	const table = {};
	const data = this.csv.data;
	const k = this.csv.key;
	const v = this.datatype.match(/-timeline/) ? U.timeline : this.csv.column;

	for (let r of data) {
		const n = +r[v];
		table[r[k]] = isNaN(n) ? r[v] : n;
	}

	return table;
};

export function raster() {
	async function run_it(blob) {
		function draw(overrideid) {
			const r = this.raster;

			if (!r.canvas) {
				r.canvas = plot_drawcanvas({
					"canvas":     ce('canvas'),
					"data":       r.data,
					"width":      r.width,
					"height":     r.height,
					"nodata":     r.nodata,
					"colorscale": this.colorscale,
				});
			}

			this.add_source({
				"type":        'canvas',
				"canvas":      r.canvas,
				"animate":     false,
				"coordinates": MAPBOX.coords,
			}, overrideid);

			this.add_layers({
				"id":     overrideid,
				"type":   'raster',
				"layout": {
					"visibility": 'none',
				},
				"paint": {
					"raster-resampling": 'nearest',
				},
			});
		};

		if (!maybe(this.raster, 'data')) {
			const tiff = await GeoTIFF.fromBlob(blob);
			const image = await tiff.getImage();
			const rasters = await image.readRasters();

			this.raster.data = rasters[0];
			this.raster.width = image.getWidth();
			this.raster.height = image.getHeight();
			this.raster.nodata = parseFloat(image.fileDirectory.GDAL_NODATA);

			if (this.timeline)
				this.timeline.rasters = rasters;

			if (this.datatype.match(/raster(-timeline)?/) && !this.domain) {
				let min, max; min = max = this.raster.nodata;
				for (let v of this.raster.data) {
					if (v === this.raster.nodata) continue;
					if (min === this.raster.nodata) min = v;
					if (max === this.raster.nodata) max = v;

					if (v > max) max = v;
					if (v < min) min = v;
				}

				this.domain = { min, max };
			}

			if (this !== OUTLINE) {
				if (or(this.raster.width !== OUTLINE.raster.width,
				       this.raster.height !== OUTLINE.raster.height)) {
					fail.call(this, `Raster resolution does not match OUTLINE.
${this.id}: ${this.raster.width} × ${this.raster.height}
OUTLINE: ${OUTLINE.raster.width} × ${OUTLINE.raster.height}`);
				}
			}
		}

		this.drawraster = draw;

		if (this.datatype.match(/raster/)) draw.call(this);
	};

	let t;
	if (maybe(this.raster, 'data')) t = Whatever;
	else t = fetchcheck.call(this, this.raster.endpoint, "TIFF").then(r => r.blob());

	return t.then(b => run_it.call(this, b));
};

function geojson() {
	if (this.vectors.geojson) return Whatever;

	return fetchcheck.call(this, this.vectors.endpoint, "GEOJSON")
		.then(async r => this.vectors.geojson = await r.json());
};

export async function geojson_summary() {
	await until(_ => maybe(this.vectors.geojson, 'features'));

	const features = this.vectors.geojson.features;
	const properties = Array.from(new Set(features.map(x => Object.keys(x.properties)).flat()));

	const o = {
		"__IGNORED": [],
	};

	for (let p of properties) {
		const values = Array.from(new Set(features.map(x => x.properties[p]).flat()));

		if (values.length > 10) {
			o["__IGNORED"].push(p);
			continue;
		}

		o[p] = {};
		for (let v of values)
			o[p][v] = features.filter(x => x.properties[p] === v).length;
	}

	return o;
};

// mapbox-gl does not follow SVG's stroke-dasharray convention when it comes
// to single numbered arrays.
//
function mapbox_dasharray(str) {
	let da = str ? str.split(' ').map(x => +x) : [1];

	if (da.length === 1) {
		(da[0] === 0) ?
			da = [1] :
			da = [da[0], da[0]];
	}

	return da;
};

function specs_set(fs, specs) {
	const criteria = [{
		"params":       ['__name'],
		"__name":       this.name,
		"radius":       this.vectors['radius'],
		"fill":         this.vectors['fill'],
		"stroke":       this.vectors['stroke'],
		"stroke-width": this.vectors['stroke-width'],
		"dasharray":    this.vectors['dasharray'],
	}];

	function ok(c,s,v) {
		let x = false;
		const vs = v + "";

		if (s.match) {
			if (vs.match(new RegExp(s.match)))
				x = true;
		}

		else if (s.range) {
			const [min, max] = s.range.split(',').map(t => +t);
			x = and(+v >= min, +v <= max);
		}

		c[s.key] = vs;

		return x;
	};

	for (let i = 0; i < fs.length; i += 1) {
		fs[i].properties['__radius'] = this.vectors['radius'];
		fs[i].properties['__fill'] = this.vectors['fill'];
		fs[i].properties['__stroke'] = this.vectors['stroke'];
		fs[i].properties['__stroke-width'] = this.vectors['stroke-width'];
		fs[i].properties['__dasharray'] = mapbox_dasharray(this.vectors['dasharray']);

		if (!specs) continue;

		const c = Object.assign({}, criteria[0]);

		for (let s of specs) {
			const v = fs[i].properties[s.key];

			if (!v) continue;

			if (!ok(c,s,v)) continue;

			if (c.params.indexOf(s.key) < 0)
				c.params.push(s.key);

			if (has(s, 'radius'))
				fs[i].properties['__radius'] = c['radius'] = s['radius'];

			if (has(s, 'fill'))
				fs[i].properties['__fill'] = c['fill'] = s['fill'];

			if (has(s, 'stroke'))
				fs[i].properties['__stroke'] = c['stroke'] = s['stroke'];

			if (has(s, 'stroke-width'))
				fs[i].properties['__stroke-width'] = c['stroke-width'] = s['stroke-width'];

			if (has(s, 'dasharray')) {
				c['dasharray'] = s['dasharray'];
				fs[i].properties['__dasharray'] = mapbox_dasharray(s['dasharray']);
			}
		}

		if (!criteria.find(x => same(x,c))) criteria.push(c);

		fs[i].properties['__criteria'] = c;
	}

	return criteria;
};

export function points() {
	return geojson.call(this)
		.then(_ => {
			for (const p of this.vectors.geojson.features) {
				const rp = coordinates_to_raster_pixel(p.geometry.coordinates);

				p.properties['__rasterindex'] = maybe(rp, 'index');
				p.properties['__visible'] = !!rp;
			}
		})
		.then(_ => {
			if (this.csv) vectors_csv.call(this);

			this.criteria = specs_set.call(
				this,
				this.vectors.geojson.features,
				this.config.features_specs,
			);

			this.add_source({
				"type":             'geojson',
				"data":             this.vectors.geojson,
				"cluster":          true,
				"clusterMaxZoom":   10,
				"clusterMinPoints": 4,
				"clusterRadius":    20,
			});

			this.add_layers({
				"type":   'circle',
				"filter": ['all', ['!', ['has', 'point_count']], ['get', '__visible']],
				"layout": {
					"visibility": 'none',
				},
				"paint": {
					"circle-stroke-color": ['get', '__stroke'],
					"circle-stroke-width": ['get', '__stroke-width'],
					"circle-radius":       ['get', '__radius'],
					"circle-opacity":      this.vectors.opacity,
					"circle-color":        this.vectors.fill,
				},
			}, {
				"id":     `${this.id}-clusters`,
				"type":   'circle',
				"filter": ['has', 'point_count'],
				"layout": {
					"visibility": 'none',
				},
				"paint": {
					"circle-radius": [
						'step', ['get', 'point_count'],
						2, 10,
						5, 100,
						7, 750,
						10,
					],
					"circle-opacity":      this.vectors.opacity,
					"circle-color":        this.vectors.fill,
					"circle-stroke-width": this.vectors['stroke-width'],
					"circle-stroke-color": this.vectors['stroke'],
				},
			});
		});
};

export function lines() {
	return geojson.call(this)
		.then(_ => {
			for (const f of this.vectors.geojson.features) {
				if (f.geometry.type === "LineString") {
					f.properties['__rasterindexes'] = f.geometry.coordinates.map(t => maybe(coordinates_to_raster_pixel(t), 'index')).sort();
				} else {
					const a = [];

					f.geometry.coordinates.map(t => {
						for (let i = 0; i < t.length; i++)
							a[i] = maybe(coordinates_to_raster_pixel(t[i]), 'index');
					});

					f.properties['__rasterindexes'] = a.sort();
				}

				f.properties['__visible'] = true;
			}
		})
		.then(_ => {
			if (this.csv) vectors_csv.call(this);

			this.criteria = specs_set.call(
				this,
				this.vectors.geojson.features,
				this.config.features_specs,
			);

			this.add_source({
				"type":      "geojson",
				"data":      this.vectors.geojson,
				"tolerance": 0,
			});

			this.add_layers({
				"type":   'line',
				"filter": ['get', '__visible'],
				"layout": {
					"visibility": 'none',
					"line-cap":   'butt',
					"line-join":  'miter',
				},
				"paint": {
					"line-color":     ['get', '__stroke'],
					"line-width":     ['get', '__stroke-width'],
					"line-dasharray": ['get', '__dasharray'],
				},
			});
		});
};

export function polygons() {
	return geojson.call(this)
		.then(_ => {
			for (const p of this.vectors.geojson.features) {
				p.properties['__extent'] = geojsonExtent(p);
				p.properties['__visible'] = true;
			}
		})
		.then(async _ => {
			if (this.csv) {
				if (this.datatype.match(/raster-timeline/))
					raster_timeline.call(this);
				else
					vectors_csv.call(this);
			}

			this.criteria = specs_set.call(
				this,
				this.vectors.geojson.features,
				this.config.features_specs,
			);

			this.add_source({
				"type": "geojson",
				"data": this.vectors.geojson,
			});

			this.add_layers({
				"type":   'fill',
				"filter": ['get', '__visible'],
				"layout": {
					"visibility": "none",
				},
				"paint": {
					"fill-color":         this.datatype === 'polygons-boundaries' ? this.vectors.fill : ['get', '__fill'],
					"fill-opacity":       [ 'case', [ 'boolean', [ 'get', '__visible' ], true ], 1 * this.vectors.opacity, 0 ],
					"fill-outline-color": ['get', '__stroke'],
				},
			});
		});
};

export async function vectors_csv() {
	await until(_ => this.csv.data && this.vectors.geojson);

	const v = this.timeline ? U.timeline : this.csv.column;

	if (this.timeline) vectors_timeline.call(this);

	let s;
	const data = this.csv.data;
	if (this.colorscale) {
		if (!data) console.warn(this.id, "has no csv.data");

		const l = d3.scaleQuantize().domain([this.domain.min, this.domain.max]).range(this.colorscale.stops);
		s = x => or(nil(x), x === "") ? "rgba(155,155,155,1)" : l(+x);

		this.csv.scale = l;
	}

	if (!data) {
		console.warn("No data for", this.id);
		return;
	}

	for (let f of this.vectors.geojson.features) {
		f.id = f.properties[this.vectors.id];
		f.properties['__visible'] = !nil(data.find(r => r[this.csv.key] === f.id));

		let row = data.find(r => r[this.csv.key] === f.id);
		f.properties['__fill'] = this.colorscale ? s(maybe(row, v)) : this.vectors.fill || "transparent";
	}

	this.update_source(this.vectors.geojson);

	if (this._domain)
		Object.assign(this._domain, this.domain);
};

function vectors_timeline() {
	const values = [].concat(...GEOGRAPHY.timeline_dates.map(d => this.csv.data.map(r => +r[d])));

	if (or(this.datatype === 'polygons-timeline', !this.domain))
		this.domain = { "min": d3.min(values), "max": d3.max(values) };

	this.csv.table = table_refresh.call(this);
};

export async function raster_timeline() {
	const i = GEOGRAPHY.timeline_dates.indexOf(U.timeline);
	console.log(i, this.timeline.rasters || "no timeline rasters");
	// this.update_source(this.timeline.rasters[i]);
};
