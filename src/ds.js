import modal from '../lib/modal.js';

import dscard from './cards.js';

import dscontrols from './controls.js';

import {
	csv as parse_csv,
	raster as parse_raster,
	points as parse_points,
	polygons as parse_polygons,
	lines as parse_lines,
	fail as parse_fail,
} from './parse.js';

import {
	average,
	crop_to,
} from './rasters.js';

export default class DS {
	constructor(o) {
		this.id = o.name || o.category.name;

		this.dataset_id = o.id;

		this.category = o.category;

		this.datatype = o.datatype;

		this.source_files = o.source_files;

		this.processed_files = o.processed_files;

		this.category_overrides(o.category_overrides);

		this.on = false;

		this._layers = [];

		let config = o.configuration || {};

		this.config = config;

		this.analysis = this.category.analysis;

		this.index = maybe(this, 'analysis', 'index');

		this.weight = maybe(this, 'analysis', 'weight') || 3;

		this.timeline = this.category.timeline;

		this.name = coalesce(o.name_long,
		                     o.name,
		                     this.category.name_long,
		                     this.category.name);

		this.metadata = o.metadata;

		this.mutant = !!maybe(config.mutant_targets, 'length');

		DST.set(this.id, this);

		this.loaded = false;

		if (!this.init(o)) return;

		this.domain = o.category.domain;

		this._domain = jsonclone(this.category.domain_init) || jsonclone(this.domain);

		this.set_colorscale();

		if (!this.disabled) {
			this.card = new dscard(this);
			this.controls = new dscontrols(this);
		}
	};

	init(o) {
		let indicator = false;
		let go = true;

		if (this.category.name.match(/^(timeline-)?indicator/)) {
			let b = GEOGRAPHY.divisions[this.config.divisions_tier];

			if (!b) {
				FLASH.push({
					"type":    'error',
					"timeout": 5000,
					"title":   "Dataset/File error",
					"message": `
'${this.name}' requires a geography->divisions->${this.config.divisions_tier}.

This is not fatal but the dataset is now disabled.`,
				});

				console.error(`'${this.name}' failed. Missing geography->divisions->${this.config.divisions_tier}.`);

				return false;
			}

			this.raster = b.raster;
			this.vectors = jsonclone(b.vectors);
			Object.assign(this.vectors, this.category.vectors);

			this.vectors.id = b.config.vectors_id;
			this.vectors.parse = x => parse_polygons.call(x || this);

			indicator = true;
		}

		const ok = t => {
			if (indicator && ['vectors', 'raster'].includes(t)) return true;

			if (this.category.name === 'outline') return true;

			FLASH.push({
				"type":    'error',
				"timeout": 5000,
				"title":   "Dataset/File error",
				"message": `
'${this.name}' has category '${this.category.name}' which requires a ${t} file.

This is not fatal but the dataset is now disabled.`,
			});

			this.disable(`Missing ${t}`);

			return false;
		};

		if (o.category.vectors) {
			let f = this.processed_files.find(x => x.func === 'vectors');

			if (!f) go = ok('raster');
			else {
				this.vectors = {};
				Object.assign(this.vectors, o.category.vectors, f);

				if (this.category.name === 'boundaries')
					this.vectors.id = this.config.vectors_id;

				let p; switch (this.vectors.shape_type) {
				case 'points': {
					p = x => parse_points.call(x || this);
					break;
				}

				case 'lines': {
					p = x => parse_lines.call(x || this);
					break;
				}

				case 'polygons': {
					p = x => parse_polygons.call(x || this);
					break;
				}
				}

				this.vectors.parse = p;
			}
		}

		if (o.category.raster) {
			const f = this.processed_files.find(x => x.func === 'raster');

			if (!f) go = ok('raster');
			else {
				this.raster = {};
				Object.assign(this.raster, o.category.raster, f);
				this.raster.parse = parse_raster.bind(this);
			}
		}

		if (o.category.csv) {
			const f = this.source_files.find(x => x.func === 'csv');

			if (!f) go = ok('csv');
			else {
				this.csv = {};
				Object.assign(this.csv, o.category.csv, f);

				this.csv.key = maybe(this.config, 'csv_columns', 'key');
				this.csv.value = maybe(this.config, 'csv_columns', 'value');
				this.csv.parse = parse_csv.bind(this);
			}
		}

		if (!go) return false;

		switch (this.datatype) {
		case 'points-timeline':
		case 'lines-timeline':
		case 'polygons-timeline':
		case 'polygons-fixed':
		case 'points':
		case 'lines':
		case 'polygons': {
			this.download = this.vectors.endpoint;
			break;
		}

		case 'raster-timeline':
		case 'raster': {
			this.download = this.raster.endpoint;
			break;
		}

		case 'table': {
			this.download = this.csv.endpoint;
			break;
		}

		case 'raster-mutant':
		case 'polygons-boundaries': {
			break;
		}

		case undefined:
		default: {
			parse_fail.call(this, "Cannot decide dataset's type. This is likely a configuration error");
			break;
		}
		}

		return true;
	};

	category_overrides(ovrr) {
		if (!ovrr) return;

		const configs = ['domain', 'domain_init', 'raster', 'vectors', 'csv', 'analysis', 'timeline', 'controls'];

		for (let c of configs) {
			if (!ovrr.hasOwnProperty(c)) continue;

			if (!maybe(this.category, c)) {
				this.category[c] = jsonclone(ovrr[c]);
				continue;
			}

			for (let a in ovrr[c]) {
				this.category[c][a] = ovrr[c][a];
			}
		}

		const attrs = ['unit', 'name', 'name_long'];
		for (let a of attrs) {
			if (!ovrr[a]) continue;
			this.category[a] = ovrr[a];
		}
	};

	disable(msg) {
		console.error(`Disabling ${this.id}.`, msg);

		this.on = false;
		this.disabled = true;

		if (this.controls) this.controls.disable();

		if (this.card) this.card.disable();

		O.ds(this, { "disable": true });

		this._layers.map(i => MAPBOX.removeLayer(i));
	};

	get source() {
		return MAPBOX.getSource(this.id);
	};

	add_source(opts, as) {
		if (as) {
			MAPBOX.addSource(as, opts);
			return;
		}

		if (this.source) return;

		MAPBOX.addSource(this.id, opts);

		this.source_config = opts;
	};

	get layers() {
		return this._layers.map(i => MAPBOX.getLayer(i)).filter(l => l);
	}

	add_layers(...arr) {
		if (this.layers.length) return;

		for (let a of arr) {
			a['id'] = a['id'] || this.id;
			a['source'] = this.id;

			MAPBOX.addLayer(a, MAPBOX.first_symbol);

			if (this._layers.indexOf(a.id) < 0) this._layers.push(a.id);
		}
	};

	update_source(data) {
		if (this.source) this.source.setData(data);
	};

	mutant_init() {
		this.hosts = this.config.mutant_targets.map(i => DST.get(i));

		const m = this.host = this.hosts[0];

		this.raster = m.raster;
		this.vectors = m.vectors;
		this.colorscale = m.colorscale;

		this.domain = m.domain;
		this._domain = m._domain;
	};

	async mutate(host) {
		await host.raster.parse();

		this.host = host;

		this.raster = host.raster;
		this.vectors = host.vectors;
		this.colorscale = host.colorscale;

		this.domain = host.domain;
		this._domain = host._domain;

		this.opacity(1);
		this.card.refresh();

		return this;
	};

	/*
	 * analysis_fn
	 *
	 * Scaling function that sets the behaviour of a dataset when contributing to
	 * an analysis. Whether it's a filter, a linearised part, etc...
	 *
	 * @param "type" string
	 *   name of the current index being drawn and decide if the dataset
	 *   contributes to the analysis at all and if the range of the function
	 *   should be inverted.
	 *
	 * returns function (ds domain) -> [0,1]
	 */

	analysis_fn(type) {
		if (!maybe(this, 'analysis', 'indexes')) return null;

		if (!(this._domain || this.domain)) return null;

		const c = this.analysis.indexes.find(i => i.index === type);
		if (!c) return null;

		const {min,max} = this._domain || this.domain;
		const r = (c && c.invert) ? [1,0] : [0,1];

		let s = null;
		switch (c.scale) {
		case 'key-delta': {
			if (!maybe(this.csv, 'table'))
				s = _ => 1;
			else {
				s = x => {
					const t = this.csv.table[x];
					return and(t >= min, t <= max) ? 1 : -1;
				};
			}
			break;
		}

		case 'exclusion-buffer': {
			s = x => or(x < min, x > max) ? 1 : -1;
			break;
		}

		case 'inclusion-buffer': {
			s = x => and(x >= min, x <= max) ? 1 : -1;
			break;
		}

		case 'intervals': {
			const q = d3.scaleQuantile()
				.domain(this.analysis.intervals)
				.range(NORM_STOPS);

			s = x => and(x >= min, x <= max) ? q(x) : -1;

			break;
		}

		case 'linear':
		default: {
			if (min === max) return s = x => (x === +min) ? 1 : -1;
			s = d3.scaleLinear().domain([min,max]).range(r).clamp(this.analysis.clamp);
			break;
		}
		}

		return s;
	};

	analysis_scale(type) {
		if (!maybe(this, 'analysis', 'indexes')) return null;
		return maybe(this.analysis.indexes.find(i => i.index === type), 'scale');
	};

	async visibility(t) {
		this.layers.map(l => MAPBOX.setLayoutProperty(l.id, 'visibility', t ? 'visible' : 'none'));

		if (this.host) {
			this.hosts.forEach(d => MAPBOX.setLayoutProperty(d.id, 'visibility', 'none'));
			MAPBOX.setLayoutProperty(this.host.id, 'visibility', t ? 'visible' : 'none');
		}
	};

	set_colorscale() {
		if (this.colorscale) {
			console.log(this.id, "has a colorscale already");
			return;
		}

		let opts;

		switch (this.datatype) {
		case 'polygons-fixed': {
			if (this.csv.key) {
				opts = {
					"stops": this.category.colorstops,
				};
			}
			break;
		}

		case 'polygons-timeline': {
			opts = {
				"stops": this.category.colorstops,
			};

			break;
		}

		case 'raster-timeline':
		case 'raster': {
			opts = {
				"stops":     this.category.colorstops,
				"domain":    this.domain,
				"intervals": this.raster.intervals,
			};

			break;
		}

		default:
			break;
		}

		if (opts) this.colorscale = colorscale(opts);
	};

	info_modal() {
		let content;

		if (this.summary) {
			const a_count = this.summary.analysis.raster.filter(t => t !== -1).length;

			const datasets = this.summary.analysis.datasets.slice(0);
			const averages = datasets
				.filter(d => d.datatype === 'raster')
				.map(d => ({
					"ds":     d,
					"raster": average(crop_to(d.raster, { "data": this.summary.analysis.raster, "nodata": -1 })),
				}));

			content = ce('div', ce('p', `<code>${a_count} km<sup>2</sup></code> covered by the analysis.`));

			Object
				.keys(this.summary.analysis.totals)
				.forEach(k => {
					content.append(ce('h4', k));

					const table = ce('table', null, { "style": "width: 100%;" });
					content.append(table);

					this.summary.analysis.datasets
						.filter(d => d.analysis.index === k)
						.forEach(d => {
							switch (d.datatype) {
							case 'raster-timeline':
							case 'raster': {
								const f = averages.find(a => a.ds === d);
								table.append(ce('tr', [
									ce('td', d.name, { "style": "padding-right: 3em;" }),
									ce('td', f.raster.avg.toFixed(2) + " " + d.category.unit, { "style": "font-family: monospace; text-align: right;" }),
								]));
								break;
							}

							case 'points': {
								table.append(ce('tr', [
									ce('td', d.name, { "style": "padding-right: 3em;" }),
									ce('td', this.summary.intersections[d.id] + " (intersect)", { "style": "font-family: monospace; text-align: right;" }),
								]));
								break;
							}

							default:
								break;
							}
						});
				});
		} else {
			const m = Object.assign({}, this.metadata, { "category-description": this.category.description });
			content = tmpl('#ds-info-modal', m);
			bind(content, m);
		}

		new modal({
			"id":      'ds-info',
			"header":  this.name,
			content,
			"destroy": true,
		}).show();
	};

	active() {
		this._active(...arguments);
	};

	async _active(v, draw) {
		this.on = v;

		if (v) {
			if (this.controls) this.controls.loading(true);

			await this.loadall();

			// make sure polygons-fixed have decided their _domain
			//
			if (maybe(this, '_domain', 'min') === undefined)
				Object.assign(this._domain, this.domain);

			if (this.controls) this.controls.loading(false);

			if (this.disabled) return;

			if (draw) this.raise();
		}

		if (this.mutant) this.mutate(this.host);

		if (this.controls) this.controls.turn(v);

		this.visibility(v && draw);

		if (!v && this.card) this.card.remove();
	};

	loadall() {
		if (this.loaded) return Whatever;

		return Promise.all(['vectors', 'csv', 'raster'].map(i => this[i] ? this.load(i) : null))
			.then(_ => (this.loaded = true));
	};

	async load(arg) {
		this.loading = true;

		if (this.mutant) {
			await until(_ => maybe(this.hosts, 'length') === this.config.mutant_targets.length);
			return Promise.all(this.hosts.map(d => d.load(arg)));
		}

		if (maybe(this, arg)) await this[arg].parse();
		else throw new Error(`Loading Error: '${this.id}' tried to load '${arg}', but failed`);

		this.loading = false;
	};

	raise() {
		this.layers.map(l => MAPBOX.moveLayer(l.id, MAPBOX.first_symbol));

		if (this.host)
			this.host.raise();
	};

	opacity(v) {
		let t = [];

		switch (this.datatype) {
		case 'points': {
			t = ['circle-opacity', 'circle-stroke-opacity'];
			break;
		}

		case 'lines': {
			t = ['line-opacity'];
			break;
		}

		case 'polygons-fixed':
		case 'polygons-timeline':
		case 'polygons-boundaries':
		case 'polygons': {
			t = ['fill-opacity'];
			break;
		}

		case 'raster-timeline':
		case 'raster': {
			t = ['raster-opacity'];
			break;
		}

		case 'raster-mutant': {
			MAPBOX.setPaintProperty(this.host.id, 'raster-opacity', v);
			return;
		}

		default: {
			console.warn("ds.opacity: undecided datatype", this.id, this.datatype);
			break;
		}
		}

		for (let a of t)
			MAPBOX.setPaintProperty(this.id, a, v);
	};

	static get array() {
		return Array.from(DST.values());
	};
};
