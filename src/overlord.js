import DS from './ds.js';

import {
	polygons_csv as parse_polygons_csv,
} from './parse.js';

import {
	lines_update as timeline_lines_update,
} from './timeline.js';

import {
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

	set subgeo(t) {
		U.subgeo = t || '';

		Promise.all(DS.array.map(d => {
			if (d.on && d.datatype === 'polygons-timeline')
				return parse_polygons_csv.call(d, U.timeline);
		})).then(_ => O.view = U.view);
	};

	map(interaction, event) {
		if (interaction === "click")
			map_click(event);
	};

	async sort() {
		const a = U.inputs;
		await Promise.all(a.map(d => until(_ => MAPBOX.getLayer(d))));

		for (let i = 0; i < a.length; i++)
			MAPBOX.moveLayer(a[i], a[i-1] || MAPBOX.first_symbol);
	};

	async wait_for(func, finish) {
		await until(func); finish();
	};
};
