import * as mapbox from './mapbox.js';

import {
	geojson_summary
} from './parse.js';

import DS from './ds.js';

const url = new URL(location);
const id = url.searchParams.get('id');
const dataset_id = url.searchParams.get('dataset_id');

function layout() {
	if (maybe(GEOGRAPHY, 'timeline'))
		qs('#visual').append(ce('div', null, { id: 'timeline' }));

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

export async function init() {
	GEOGRAPHY = await ea_api.get("geographies", { "id": `eq.${id}` }, { one: true });

	layout();

	MAPBOX = mapbox.init();

	U = {};

	await dsinit(GEOGRAPHY.id, bounds => {
		MAPBOX.coords = mapbox.fit(bounds);
		mapbox.change_theme(ea_settings.mapbox_theme);
	});

	await until(_ => DS.array.filter(d => d.on).every(d => d.loading === false));
};

async function dsinit(id, callback) {
	let select = ["*", "category:categories(*)", "df:_datasets_files(*,file:files(*))"];

	let bounds;
	const boundaries_id = maybe(GEOGRAPHY.configuration, 'boundaries', 0, 'dataset_id');

	if (!boundaries_id) {
		const m = `
Failed to get the geography's BOUNDARIES.
This is fatal. Thanks for all the fish.`;

		ea_super_error("Geography error", m);

		throw Error("No BOUNDARIES. Ciao.");
	}

	const bp = {
		"id": `eq.${boundaries_id}`,
		"select": select,
		"df.active": "eq.true"
	};

	await ea_api.get("datasets", bp, { one: true })
		.then(async e => {
			let ds = new DS(e, false);
			BOUNDARIES = ds;

			await ds.load('csv');
			await ds.load('vectors');
			await ds.load('raster');

			if (!(bounds = ds.vectors.bounds))
				throw `'BOUNDARIES' has no vectors.bounds`;

			const c = ds.config;
			if (c.column_name) {
				GEOGRAPHY.boundaries = {};

				for (let r of ds.csv.data)
					GEOGRAPHY.boundaries[r[c.column]] = r[c.column_name];
			}
		});

	callback(bounds);

	if (boundaries_id === dataset_id) {
		await plot.call(BOUNDARIES);
		BOUNDARIES.active(true, true);
		return;
	}

	const p = {
		"geography_id": `eq.${id}`,
		"id": `eq.${dataset_id}`,
		"select": select
	};

	await ea_api.get("datasets", p, { one: true })
		.then(e => {
			const ds = new DS(e, true);
			ds.active(true, true);
			plot.call(ds);
		});
};

async function plot() {
	if (this.raster)
		await until(_ => typeof this.drawraster === 'function');

	if (this.csv)
		await until(_ => this.csv.data);

	switch (this.datatype) {
	case 'raster': {
		break;
	}

	case 'raster-mutant': {
		ea_super_error(
			"Pseudo-dataset",
			`Nothing to see for a '${this.datatype}'

Instead, see:
  ${this.config.mutant_targets.join("\n  ")}`,
			'warning'
		);

		return;
	}

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

			this.colorscale = ea_colorscale({
				stops: NORM_STOPS.map(x => d3.interpolateMagma(x)),
				domain: { min: this.raster.min, max: this.raster.max },
			});
		}

		break;
	}

	case 'polygons-fixed': {
		ea_flash.push({
			type: 'info',
			timeout: 0,
			title: "Boundaries dependency",
			message: `Be sure to review the 'boundaries' raster file.`
		});

		break;
	}

	case 'polygons-boundaries': {
		const ids = this.csv.data.map(x => parseInt(x[this.csv.key]));

		const max = Math.max.apply(null, ids);
		const min = Math.min.apply(null, ids);

		this.vectors.opacity = 0.2;

		this.colorscale = ea_colorscale({
			stops: ["#000", "#fff"],
			domain: { min: min, max: max },
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
			ea_flash.push({
				type: 'error',
				timeout: 0,
				title: "Faulty/Incomplete dataset",
				message: `
CSV has ${empties} empty cells.`
			});
		}

		ea_flash.push({
			type: 'info',
			timeout: 0,
			title: "Available info",
			message: `
${GEOGRAPHY.configuration.timeline_dates.length} dates configured
CSV has ${this.csv.data.length} rows
CSV has ${empties} empty cells.`
		});

		ea_flash.push({
			type: 'warning',
			timeout: 0,
			title: "Timeline unavailable",
			message: `The timeline feature requires UI gadgets. Review this on the tool.`
		});

		break;
	}

	default:
		ea_super_error("WIP", `
Testing '${this.datatype}'

I haven't done this yet...`);
		throw new Error("WIP");
	}

	if (this.raster) {
		this.drawraster(this.id + "-raster");
		MAPBOX.setLayoutProperty(this.id + "-raster", 'visibility', 'visible');
	}

	this.raise();

	ea_loading(false);

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
