import * as plot from './plot.js';

import {
	zoomend as mapbox_zoomend,
	dblclick as mapbox_dblclick,
} from './mapbox.js';


async function fetchcheck(endpoint, format) {
	if (!endpoint.match(/^http/))
		endpoint = ea_settings.storage + endpoint;

	return fetch(endpoint)
		.catch(_ => fail.call(this, `Could not fetch ${format}`))
		.then(r => {
			if (r.ok && r.status < 400) return r;

			fail.call(this, `${format} Endpoint gave ${r.status} response.`);
		});
};

export function fail(msg) {
	const err = msg || "";

	if (this.id === 'boundaries')
		ea_super_error("Dataset error", `
Failed to process dataset '${this.name}'.

${err}

This is fatal. Thanks for all the fish.`);

	else {
		ea_flash.push({
			type: 'error',
			timeout: 5000,
			title: "Dataset error",
			message: `
Failed to process dataset '${this.name}'.
This is not fatal but the dataset is now disabled.

${err}`
		});
	}

	this.disable();
	console.error(`"Dataset '${this.name}' disabled.`);

	if (!U.inputs) return;

	const arr = U.inputs; arr.splice(U.inputs.indexOf(this.id), 1);
	U.inputs = arr;
};

export function csv() {
	if (this.csv.data) return;

	return fetchcheck.call(this, this.csv.endpoint, "CSV")
		.then(d => d.text())
		.then(r => d3.csvParse(r))
		.then(d => this.csv.data = d)
		.then(_ => this.csv.table = this.config.column ? csv_table.call(this, this.config.column) : undefined)
		.then(_ => {
			if (this.domain || !this.csv.table) return;

			const arr = [];
			for (let i in this.csv.table) arr[i] = this.csv.table[i];

			this.domain = {
				min: d3.min(arr),
				max: d3.max(arr)
			};
		});
};

function csv_table(c) {
	const table = {};
	const data = this.csv.data;
	const k = this.csv.key;
	const u = U.subgeo;

	for (let i = 0; i < data.length; i++) {
		const d = data[i];
		if (u && +d[k] !== +u) continue;

		table[d[k]] = +d[c];
	}

	return table;
};

export function raster() {
	async function run_it(blob) {
		function draw(overrideid) {
			const r = this.raster;

			if (!r.canvas) {
				r.canvas = plot.drawcanvas({
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
			}, overrideid);

			this.add_layer({
				"type": 'raster',
				"layout": {
					"visibility": "none",
				},
				"paint": {
					"raster-resampling": "nearest"
				}
			}, overrideid);
		};

		if (!maybe(this.raster, 'data')) {
			const tiff = await GeoTIFF.fromBlob(blob);
			const image = await tiff.getImage();
			const rasters = await image.readRasters();

			this.raster.data = rasters[0];
			this.raster.width = image.getWidth();
			this.raster.height = image.getHeight();
			this.raster.nodata = parseFloat(image.fileDirectory.GDAL_NODATA);

			if (this.datatype === 'raster' && !this.domain) {
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

			if (this.id !== 'boundaries') {
				const b = DST.get('boundaries');

				if (this.raster.width !== b.raster.width) {
					fail.call(this, `
Raster resolution does not match the boundaries dataset.
${this.id}: ${this.raster.width} × ${this.raster.height}
boundaries: ${b.raster.width} × ${b.raster.height}
`);
				}
			}
		}

		this.drawraster = draw;

		if (this.datatype === 'raster') draw.call(this);
	};

	let t;
	if (maybe(this.raster, 'data')) t = Whatever;
	else t = fetchcheck.call(this, this.raster.endpoint, "TIFF").then(r => r.blob());

	return t.then(b => run_it.call(this, b));
};

function geojson() {
	if (this.vectors.features)
		return Whatever;

	return fetchcheck.call(this, this.vectors.endpoint, "GEOJSON")
		.then(r => r.json())
		.then(r => {
			this.vectors.features = r;
			if (this.id === 'boundaries') this.vectors.bounds = geojsonExtent(r);
		});
};

export async function geojson_summary() {
	await until(_ => maybe(this.vectors.features, 'features'));

	const features = this.vectors.features.features;
	const properties = Array.from(new Set(features.map(x => Object.keys(x.properties)).flat()));

	const o = {
		"__IGNORED": []
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

export function points() {
	return geojson.call(this)
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

export function lines() {
	return geojson.call(this)
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
			const specs = this.config.features_specs;

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

export function polygons() {
	if (MAPBOX.getLayer(this.id)) {
		console.log(this.id, "parse.polygons: layer already exists.");
		return;
	}

	return geojson.call(this)
		.then(async _ => {
			if (this.csv) {
				let col = null;

				if (this.timeline) {
					await until(_ => this.csv.data);

					if (!this.domain) {
						this.domain = {
							min: d3.min([].concat(...GEOGRAPHY.timeline_dates.map(d => this.csv.data.map(r => +r[d])))),
							max: d3.max([].concat(...GEOGRAPHY.timeline_dates.map(d => this.csv.data.map(r => +r[d]))))
						};
					}

					col = U.timeline;
				}
				else if (this.config.column)
					col = this.config.column;

				polygons_csv.call(this, col);
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
					"fill-color": this.datatype.match("polygons-") ? ['get', '__color'] : this.vectors.fill,
					"fill-outline-color": this.vectors.stroke,
					"fill-opacity": [ "case", [ "boolean", [ "get", "__hidden" ], false ], 0, 1 * this.vectors.opacity ]
				},
			});

			mapbox_dblclick(this.id);
			mapbox_zoomend(this.id);
		});
};

export async function polygons_csv(col) {
	await until(_ => this.csv.data && this.vectors.features);

	if (this.timeline)
		this.csv.table = csv_table.call(this, col);

	let s;
	const data = this.csv.data;
	if (this.colorscale) {
		if (!data) console.warn(this.id, "has no csv.data");

		const l = d3.scaleQuantize().domain([this.domain.min, this.domain.max]).range(this.colorscale.stops);
		s = x => (null === x || undefined === x || x === "") ? "rgba(155,155,155,1)" : l(+x);

		this.csv.scale = l;
	}

	if (!data) {
		console.warn("No data for", this.id);
		return;
	}

	const fs = this.vectors.features.features;
	for (let i = 0; i < fs.length; i += 1) {
		let row = data.find(r => +r[this.csv.key] === +fs[i].properties[this.vectors.key]);
		fs[i].properties.__color = (this.colorscale && row) ? s(row[col]) : "white";
	}

	this.update_source(this.vectors.features);

	if (this.card) this.card.refresh();
};
