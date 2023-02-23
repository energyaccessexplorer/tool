import {
	init as mapbox_init,
	fit as mapbox_fit,
	change_theme as mapbox_change_theme,
} from './mapbox.js';

import {
	geojson_summary,
} from './parse.js';

import DS from './ds.js';

const url = new URL(location);

export async function init() {
	const id = url.searchParams.get('id');

	GEOGRAPHY = await API.get("geographies", { "id": `eq.${id}` }, { "one": true });

	layout();

	MAPBOX = mapbox_init();

	U = {};

	await dsinit(GEOGRAPHY.id);

	await until(_ => DS.array.filter(d => d.on).every(d => d.loading === false));
};

async function dsinit(_) {
	let select = ["*", "datatype", "category:categories(*)"];

	const divisions = maybe(GEOGRAPHY.configuration, 'divisions');
	const outline_id = maybe(divisions.find(d => d.dataset_id), 'dataset_id');

	MAPBOX.coords = mapbox_fit(GEOGRAPHY.envelope);
	mapbox_change_theme(ea_settings.mapbox_theme);

	if (!outline_id) {
		const m = `
Failed to get the geography's OUTLINE.
This is fatal. Thanks for all the fish.`;

		super_error("Geography error", m);

		throw new Error("No OUTLINE");
	}

	await (function fetch_outline() {
		if (!outline_id) {
			const m = `
Failed to get the geography's OUTLINE.
This is fatal. Thanks for all the fish.`;

			super_error("Geography error", m);

			throw new Error("No OUTLINE");
		}

		const bp = {
			"id":     `eq.${outline_id}`,
			"select": select,
		};

		return API.get("datasets", bp, { "one": true })
			.then(async e => {
				const ds = OUTLINE = new DS(e);

				await ds.load('vectors');
				await ds.load('raster');
			});
	})();

	await (function fetch_divisions() {
		return Promise.all(
			divisions.filter(x => x.dataset_id).slice(1).map(x => {
				const dp = {
					"id":     `eq.${x.dataset_id}`,
					"select": select,
				};

				return API.get("datasets", dp, { "one": true })
					.then(async e => {
						const ds = new DS(e);

						await ds.load('csv');
						await ds.load('vectors');
						await ds.load('raster');
					});
			}),
		);
	})();

	const dataset_id = url.searchParams.get('dataset_id');
	const geography_id = url.searchParams.get('id');

	if (outline_id === dataset_id) {
		await plot.call(OUTLINE);
		OUTLINE.active(true, true);
		return;
	}

	const p = {
		"geography_id": `eq.${geography_id}`,
		"id":           `eq.${dataset_id}`,
		"select":       select,
	};

	const e = await API.get("datasets", p, { "one": true });
	const ds = new DS(e);

	await ds.active(true, true);
	plot.call(ds);
};

async function plot() {
	if (this.datatype === 'polygons-valued') ;
	else if (this.raster)
		await until(_ => typeof this.drawraster === 'function');

	if (this.csv)
		await until(_ => this.csv.data);

	switch (this.datatype) {
	case 'points':
	case 'lines':
	case 'polygons': {
		if (!this.colorscale) {
			let i;
			let min = 0;
			let max = 0;

			for (i = 0; i < this.raster.data.length; i++) {
				const v = this.raster.data[i];

				if (v === this.raster.nodata) continue;

				if (v < min) min = v;
				if (v > max) max = v;
			}

			this.raster.min = min;
			this.raster.max = max;

			this.colorscale = colorscale({
				"stops":  NORM_STOPS.map(x => d3.interpolateMagma(x)),
				"domain": { "min": this.raster.min, "max": this.raster.max },
			});
		}

		break;
	}

	case 'polygons-valued': {
		FLASH.push({
			"type":    'info',
			"timeout": 0,
			"title":   "Boundaries dependency",
			"message": `Be sure to review the 'boundaries' raster file.`,
		});

		break;
	}

	case 'polygons-boundaries': {
		let min, max;

		if (this.category.name === 'outline') {
			min = max = 1;
		} else {
			const ids = this.csv.data.map(x => parseInt(x[this.csv.key]));
			max = Math.max.apply(null, ids);
			min = Math.min.apply(null, ids);
		}

		this.vectors.opacity = 0.2;

		this.colorscale = colorscale({
			"stops":  ["#000", "#fff"],
			"domain": { "min": min, "max": max },
		});

		break;
	}

	case 'polygons-timeline': {
		GEOGRAPHY.timeline = this.timeline = false;

		let empties = 0;
		for (let r of this.csv.data)
			for (let d of GEOGRAPHY.configuration.timeline_dates)
				if (r[d] === "") empties += 1;

		if (empties) {
			FLASH.push({
				"type":    'error',
				"timeout": 0,
				"title":   "Faulty/Incomplete dataset",
				"message": `
CSV has ${empties} empty cells.`,
			});
		}

		FLASH.push({
			"type":    'info',
			"timeout": 0,
			"title":   "Available info",
			"message": `
${GEOGRAPHY.configuration.timeline_dates.length} dates configured
CSV has ${this.csv.data.length} rows
CSV has ${empties} empty cells.`,
		});

		FLASH.push({
			"type":    'warning',
			"timeout": 0,
			"title":   "Timeline unavailable",
			"message": `The timeline feature requires UI gadgets. Review this on the tool.`,
		});

		break;
	}

	case 'raster': {
		break;
	}

	case 'raster-valued-mutant':
	case 'raster-mutant': {
		super_error(
			"Pseudo-dataset",
			`Nothing to see for a '${this.datatype}'

Instead, see:
  ${this.config.mutant_targets.join("\n  ")}`,
			'warning',
		);

		return;
	}

	default:
		super_error("WIP", `
Testing '${this.datatype}'

I haven't done this yet...`);
		throw new Error("WIP");
	}

	if (this.datatype === 'polygons-valued') ;
	else if (this.raster) {
		this.drawraster(this.id + "-raster");
		MAPBOX.setLayoutProperty(this.id + "-raster", 'visibility', 'visible');
	}

	this.raise();

	loading(false);

	const fn = url.searchParams.get('fn');
	if (fn) {
		const body = qs('body');
		body.innerHTML = "";
		body.style.overflow = 'scroll';

		console.log(geojson_summary);

		const j = JSON.stringify(await eval(fn).call(this), null, 4);
		body.append(ce('pre', j));
	}
};

function layout() {
	if (maybe(GEOGRAPHY, 'timeline'))
		qs('#visual').append(ce('div', null, { "id": 'timeline' }));

	const p = qs('#playground');
	const m = qs('#maparea', p);
	const b = qs('#mapbox-container', m);

	function set_heights() {
		const h = window.innerHeight;

		p.style['height'] =
			m.style['height'] =
			b.style['height'] = h + "px";
	};

	document.body.onresize = set_heights;
	set_heights();
};
