import dscard from './cards.js';

import dscontrols from './controls.js';

import * as parse from './parse.js';

export default class DS {
	constructor(o, on) {
		this.id = o.name || o.category.name;

		this.dataset_id = o.id;

		this.category = o.category;

		this.category_overrides(o.category_overrides);

		this.on = on || false;


		let config = o.configuration || {};

		this.config = config;

		this.analysis = this.category.analysis;

		this.index = maybe(this, 'analysis', 'index');

		this.weight = maybe(this, 'analysis', 'weight') || 2;

		this.timeline = this.category.timeline;

		this.name = o.name_long || o.name || this.category.name_long || this.category.name;

		this.metadata = o.metadata;

		this.mutant = !!config.mutant;

		this.items = config.collection ? [] : undefined;

		this.files_setup(o);

		if (this.mutant) ;

		else if (this.id === 'boundaries')
			this.domain = this._domain = [-Infinity, Infinity];

		else if (undefined === this.domain) {
			parse.fail.call(this, "Cannot set dataset's domain. This is likely a configuration error.");
			return;
		}

		this.init();

		if (!this.disabled) {
			this.card = new dscard(this);
			this.controls = new dscontrols(this);
		}

		DST.set(this.id, this);
	};

	files_setup(o) {
		const v = maybe(o.df.find(x => x.func === 'vectors'), 'file');
		if (o.category.vectors && v) {
			this.vectors = JSON.parse(JSON.stringify(o.category.vectors));
			this.vectors.endpoint = v.endpoint;
			this.vectors.key = maybe(v, 'configuration', 'key') || 'OBJECTID';
			this.vectors.fileid = v.id;

			let p; switch (this.vectors.shape_type) {
			case 'points': {
				p = x => parse.points.call(x || this);
				break;
			}

			case 'polygons': {
				p = x => parse.polygons.call(x || this);
				break;
			}

			case 'lines': {
				p = x => parse.lines.call(x || this);
				break;
			}
			}

			this.vectors.parse = p;
		}

		const r = maybe(o.df.find(x => x.func === 'raster'), 'file');
		if (o.category.raster && r) {
			this.raster = JSON.parse(JSON.stringify(o.category.raster));
			this.raster.endpoint = r.endpoint;
			this.raster.parse = _ => parse.tiff.call(this);
			this.raster.fileid = r.id;

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
			this.csv.parse = _ => parse.csv.call(this);
			this.csv.fileid = c.id;

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
			const b = DST.get('boundaries');
			this.vectors = JSON.parse(JSON.stringify(b.vectors));
			this.vectors.endpoint = b.vectors.endpoint;
			this.vectors.parse = x => parse.polygons.call(x || this);
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

		if (this.id === 'boundaries') t = "polygons-boundaries";

		if (this.mutant) t = "raster-mutant";

		return t;
	};

	disable() {
		this.on = false;
		this.disabled = true;

		DST.delete(this.id);

		if (this.controls) this.controls.disable();

		if (this.card) this.card.disable();

		if (this.items) {
			for (let d of this.items) { d.disable(); }
		}

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
	}

	mutant_init() {
		this.hosts = this.config.mutant_targets.map(i => DST.get(i));

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

		const c = this.analysis.indexes.find(i => i.index === type);
		if (!c) return null;

		const t = this._domain;
		const r = (c && c.invert) ? [1,0] : [0,1];

		let s = null;
		switch (c.scale) {
		case 'key-delta': {
			if (!maybe(this.csv, 'table')) return (s = _ => 1);

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

		case 'inclusion-buffer': {
			s = x => (x >= t[0] && x <= t[1]) ? 1 : -1;
			break;
		}

		case 'intervals': {
			const q = d3.scaleQuantile()
				    .domain(this.analysis.intervals)
				    .range(NORM_STOPS);

			s = x => (x >= t[0]) && (x <= t[1]) ? q(x) : -1;

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

	analysis_scale(type) {
		if (!maybe(this, 'analysis', 'indexes')) return null;
		return this.analysis.indexes.find(i => i.index === type).scale;
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

	set domain(arr) {
		if (!this.mutant && this.__domain)
			throw new Error(`domain: cannot change existing domain '${this.__domain}' -> '${arr}' on non-mutant dataset '${this.id}'`);
		else
			this.__domain = arr;
	};

	get domain() {
		return this.__domain;
	};

	active() {
		this._active(...arguments);
	};

	info_modal() {
		const b = this.metadata;
		b['why'] = this.category.metadata.why;

		const content = tmpl('#ds-info-modal', b);
		qs('#metadata-sources', content).href = this.metadata.download_original_url;
		qs('#learn-more', content).href = this.metadata.learn_more_url;

		ea_modal.set({
			header: this.name,
			content: content,
			footer: null
		}).show();
	};

	async _active(v, draw) {
		this.on = v;

		if (v) {
			if (this.controls) {
				this.controls.loading(true);
				await this.load();
				this.controls.loading(false);
			}
			else
				await this.load();

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

		if (!arg)
			await Promise.all(['vectors', 'csv', 'raster'].map(i => this[i] ? this.load(i) : null));
		else {
			if (this[arg]) await this[arg].parse();
		}

		this.loading = false;
	};

	async raise() {
		if (this.layer) {
			await until(_ => MAPBOX.getLayer(this.id));
			MAPBOX.moveLayer(this.id, MAPBOX.first_symbol);
		}

		if (this.items) {
			for (let d of this.items) d.raise();
		}

		if (this.host) {
			this.host.raise();
		}
	};

	static get array() {
		return Array.from(DST.values());
	};
};
