import DS from './ds.js';

import {
	polygons_csv as parse_polygons_csv,
} from './parse.js';

import {
	lines_update as timeline_lines_update,
} from './timeline.js';

import {
	raster_to_tiff,
	plot_active as analysis_plot_active,
} from './analysis.js';

export default class Overlord {
	layers() {
		Promise.all(U.inputs.map(id => DST.get(id).active(true, ['inputs', 'timeline'].includes(U.view))));
	};

	dataset(_ds, arg, data) {
		let ds;

		switch (_ds.constructor.name) {
		case "DS":
			ds = _ds;
			break;

		case "String":
			ds = DST.get(_ds);
			break;

		default:
			console.error("O.dataset: Do not know what to do with", _ds);
			throw Error("O.dataset: ArgumentError.");
		}

		if (!ds) throw Error("ds was never set...");

		switch (arg) {
		case "domain": {
			ds._domain = data;
			break;
		}

		case "weight": {
			ds.weight = data;
			break;
		}

		case "active": {
			ds.active(data, ['inputs', 'timeline'].includes(U.view));

			let arr = U.inputs;
			if (ds.on) arr.unshift(ds.id);
			else arr.splice(arr.indexOf(ds.id), 1);

			O.datasets = arr;

			timeline_lines_update();
			break;
		}

		case "mutate": {
			this.layers();
			break;
		}

		case "disable":
		default:
			break;
		}

		load_view();
	};

	set datasets(arr) {
		U.inputs = arr;
		O.sort();
	};

	set timeline(t) {
		U.timeline = t;

		DS.array.forEach(async d => {
			if (d.on && d.datatype === 'polygons-timeline')
				parse_polygons_csv.call(d, t);
		});
	};

	set index(t) {
		U.output = t;
		analysis_plot_active(t, true);
	};

	set view(t) {
		U.view = t;
		O.layers();
		load_view();

		window.dispatchEvent(new Event('resize'));
	};

	map(interaction, event, id) {
		const ds = DST.get(id);

		switch (interaction) {
		case "click":
			map_click.call(ds, event);
			break;

		case "dblclick":
			map_dblclick.call(ds, event);
			break;

		case "zoomend":
			map_zoomend.call(ds, event);
			break;

		default:
			break;
		}
	};

	sort() {
		const ds = U.inputs.map(i => {
			const d = DST.get(i);
			return d.mutant ? d.host.id : d.id;
		});

		Promise.all(ds.map(d => until(_ => DST.get(d).layer)))
			.then(_ => {
				for (let i = 0; i < ds.length; i++)
					MAPBOX.moveLayer(ds[i], ds[i-1] || MAPBOX.first_symbol);
			});
	};

	async theme_changed() {
		await until(_ => MAPBOX.isStyleLoaded());

		await DS.array
			.filter(d => d.on)
			.forEach(d => {
				d.loaded = false;
				d.loadall();
			});

		O.view = U.view;
	};

	async analysis_to_dataset(t) {
		const category = await ea_api.get("categories", { "select": "*", "name": "eq.analysis" }, { one: true });

		const timestamp = (new Date()).getTime().toString().slice(-8);

		const tif = await raster_to_tiff(t);

		const url = URL.createObjectURL(new Blob([tif], { type: "application/octet-stream;charset=utf-8" }));

		const d = new DS({
			"name": `analysis-${t}-` + timestamp,
			"name_long": `Analysis ${t.toUpperCase()} - ` + timestamp,
			"datatype": "raster",
			"category": category,
			"processed_files": [{
				"func": "raster",
				"endpoint": url
			}],
			"source_files": [],
			"metadata": {},
		});

		d._active(true, true);

		const x = U.params.inputs.slice(0);
		x.push(d.id);

		U.params.inputs = x;

		U.inputs = [d.id].concat(U.inputs);
		O.view = 'inputs';

		qs('#cards-pane #cards-list').prepend(d.card);
	};
};
