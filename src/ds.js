import dscard from './cards.js';

import dscontrols from './controls.js';

import * as parse from './parse.js';

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

		let config = o.configuration || {};

		this.config = config;

		this.analysis = this.category.analysis;

		this.index = maybe(this, 'analysis', 'index');

		this.weight = maybe(this, 'analysis', 'weight') || 2;

		this.timeline = this.category.timeline;

		this.name = coalesce(o.name_long,
		                     o.name,
		                     this.category.name_long,
		                     this.category.name);

		this.metadata = o.metadata;

		this.mutant = !!maybe(config.mutant_targets, 'length');

		this.items = config.collection ? [] : undefined;

		this.initialise(o);

		this.loaded = false;

		this.domain = o.category.domain;

		this._domain = jsonclone(this.category.domain_init) || jsonclone(this.domain);

		this.set_colorscale();

		if (this.card) this.card.refresh();

		if (!this.disabled) {
			this.card = new dscard(this);
			this.controls = new dscontrols(this);
		}

		DST.set(this.id, this);
	};

	initialise(o) {
		let indicator = false;

		const ferr = t => {
			if (indicator && ['vectors', 'raster'].includes(t)) return;

			if (this.category.name === 'outline') return;

			ea_flash.push({
				type: 'error',
				timeout: 5000,
				title: "Dataset/File error",
				message: `
'${this.name}' has category '${this.category.name}' which requires a ${t} file.

This is not fatal but the dataset is now disabled.`
			});

			this.disable(`Missing ${t}`);
		};

		if (this.category.name.match(/^(timeline-)?indicator/)) {
			let b = GEOGRAPHY.divisions[this.config.divisions_tier];

			// TODO: remove this when divisions are consolidated on the database
			if (!b) b = GEOGRAPHY.divisions[1];

			this.raster = b.raster;
			this.vectors = jsonclone(b.vectors);
			this.vectors.parse = x => parse.polygons.call(x || this);

			indicator = true;
		}

		if (o.category.vectors) {
			let f = this.processed_files.find(x => x.func === 'vectors');

			if (!f) ferr('vectors');
			else {
				this.vectors = {};
				Object.assign(this.vectors, o.category.vectors, f);

				let p; switch (this.vectors.shape_type) {
				case 'points': {
					p = x => parse.points.call(x || this);
					break;
				}

				case 'lines': {
					p = x => parse.lines.call(x || this);
					break;
				}

				case 'polygons': {
					p = x => parse.polygons.call(x || this);
					break;
				}
				}

				this.vectors.parse = p;
			}
		}

		if (o.category.raster) {
			const f = this.processed_files.find(x => x.func === 'raster');

			if (!f) ferr('raster');
			else {
				this.raster = {};
				Object.assign(this.raster, o.category.raster, f);
				this.raster.parse = _ => parse.raster.call(this);
			}
		}

		if (o.category.csv) {
			const f = this.source_files.find(x => x.func === 'csv');

			if (!f) ferr('csv');
			else {
				this.csv = {};
				Object.assign(this.csv, o.category.csv, f);

				this.csv.key = 'OBJECTID';
				this.csv.parse = _ => parse.csv.call(this);
			}
		}

		switch (this.datatype) {
		case 'points':
		case 'lines':
		case 'polygons': {
			this.download = this.vectors.endpoint;
			break;
		}

		case 'polygons-fixed': {
			this.download = this.vectors.endpoint;
			break;
		}

		case 'raster': {
			this.download = this.raster.endpoint;
			break;
		}

		case 'table': {
			this.download = this.csv.endpoint;
			break;
		}

		case 'raster-mutant':
		case 'polygons-timeline':
		case 'polygons-boundaries': {
			break;
		}

		case undefined:
		default: {
			parse.fail.call(this, "Cannot decide dataset's type. This is likely a configuration error");
			break;
		}
		}
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

		DST.delete(this.id);

		if (this.controls) this.controls.disable();

		if (this.card) this.card.disable();

		if (this.items) this.items.map(d => d.disable());

		if (this.collection) {
			if (!this.collection.disabled) this.collection.disable();
		}

		if (MAPBOX.getLayer(this.id)) MAPBOX.removeLayer(this.id);
	};

	add_source(opts, as) {
		if (as) {
			MAPBOX.addSource(as, opts);
			return;
		}

		if (this.source && MAPBOX.getSource(this.id)) return;

		MAPBOX.addSource(this.id, opts);

		this.source = MAPBOX.getSource(this.id);
	};

	add_layer(opts, as) {
		if (as) {
			opts['id'] = as;
			opts['source'] = as;

			MAPBOX.addLayer(opts, MAPBOX.first_symbol);
			return;
		}

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
			console.warn(err);
		}
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

	items_init() {
		for (let i of this.config.collection) {
			const d = DST.get(i);
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

	set_colorscale() {
		if (this.colorscale) {
			console.log(this.id, "has a colorscale already");
			return;
		}

		let opts;

		switch (this.datatype) {
		case 'polygons-fixed': {
			if (this.config.csv_columns) {
				opts = {
					stops: this.category.colorstops,
				};
			}
			break;
		}

		case 'polygons-timeline': {
			opts = {
				stops: this.category.colorstops,
			};

			break;
		}

		case 'raster': {
			opts = {
				stops: this.category.colorstops,
				domain: this.domain,
				intervals: this.raster.intervals
			};

			break;
		}

		default:
			break;
		}

		if (opts) this.colorscale = ea_colorscale(opts);
	};

	info_modal() {
		let content;

		if (this.summary) {
			content = tmpl('#analysis-summary-modal', {});

			delete this.summary.analysis.raster;

			content.append(
				ce('h3', "Intersections"),
				table_keyvalue(this.summary.intersections, x => maybe(DST.get(x), 'name')),
				ce('br'),
				ce('h3', "Averages"),
				table_keyvalue(this.summary.analysis, _ => _, x => x.toFixed(2)),
			);
		} else {
			const m = Object.assign({}, this.metadata, { "category-description": this.category.description });
			content = tmpl('#ds-info-modal', m);

			qs('#metadata-sources', content).href = m.download_original_url;
			qs('#learn-more', content).href = m.learn_more_url;
		}

		ea_modal.set({
			header: this.name,
			content: content,
			footer: null
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

		if (this.items) {
			await Promise.all(this.items.map(d => d.active(v, draw)));
			this.controls.turn(v);

			return;
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

		if (maybe(this, arg)) await this[arg].parse();
		else throw new Error(`Loading Error: '${this.id}' tried to load '${arg}', but failed`);

		this.loading = false;
	};

	raise() {
		if (this.layer)
			MAPBOX.moveLayer(this.id, MAPBOX.first_symbol);

		if (this.items)
			for (let d of this.items) d.raise();

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

		case 'polygons':
		case 'polygons-fixed':
		case 'polygons-timeline':
		case 'polygons-boundaries': {
			t = ['fill-opacity'];
			break;
		}

		case 'raster': {
			t = ['raster-opacity'];
			break;
		}

		case 'raster-mutant': {
			MAPBOX.setPaintProperty(this.host.id, 'raster-opacity', v);
			return;
		}

		default:
			console.warn("ds.opacity: undecided datatype", this.id, this.datatype);
			break;
		}

		for (let a of t)
			MAPBOX.setPaintProperty(this.id, a, v);
	};

	static get array() {
		return Array.from(DST.values());
	};
};
