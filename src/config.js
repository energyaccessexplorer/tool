import DS from './ds.js';

import {
	extract as user_extract,
	register_login,
} from './user.js';

export function load_datasets(array) {
	return Promise.all(array.map(d => {
		const ds = DS.array.find(t => t.name === d.id || t.id === d.id);

		if (!ds) {
			console.warn("config load: No such dataset on this geography:", d);
			return;
		}

		if (ds._domain) {
			if (typeof d.domain.min === 'number') ds._domain.min = d._domain?.min || d.domain.min;
			if (typeof d.domain.max === 'number') ds._domain.max = d._domain?.max || d.domain.max;
		} else
			console.warn(`Could not initialise domain for '${ds.id}' - ${ds.datatype}.`);

		ds.selection = d.selection;

		if (and(maybe(d.selection, 0), ds.mutant))
			ds.mutate(DST.get(d.selection[0]));

		if (typeof d.weight === 'number') ds.weight = d.weight;

		return ds.active(true, true);
	}));
};

export function validate(conf) {
	const base = [
		'datasets',
		'geography',
		'zoom',
		'center',
		'theme',
		'view',
		'subdiv',
		'divtier',
		'tab',
		'output',
		'variant',
	];

	for (const b of base)
		if (!conf.hasOwnProperty(b)) {
			FLASH.push({
				"type":    'error',
				"timeout": 5000,
				"title":   "Configuration File Error",
				"message": "The provided configuration does not comply with the necessary format.",
			});

			return false;
		}

	return true;
};

export function generate() {
	const datasets = STATE.datasets
		.map(d => ({
			"dataset_id": d.dataset_id,
			"id":         d.id,
			"name":       d.name,
			"weight":     d.weight,
			"domain":     d.domain,
			"criteria":   d.criteria,
			"selection":  d.selection,
			"_domain":    d._domain,
			"index":      d.index,
			"unit":       d.category.unit,
		}));

	const config = {
		datasets,
		"geography": GEOGRAPHY.id,
		"zoom":      MAPBOX.getZoom(),
		"center":    MAPBOX.getCenter(),
		"theme":     EAE['settings'].mapbox_theme,
		"view":      STATE.view,
		"subdiv":    STATE.subdiv,
		"divtier":   STATE.divtier,
		"tab":       STATE.tab,
		"index":     STATE.index,
		"variant":   STATE.variant,
	};

	return config;
};

export function store() {
	sessionStorage.setItem('config', JSON.stringify(STATE.config));
};

export function init() {
	const user_id = user_extract('id');

	const panel = qs('#config.search-panel');

	const results = qs('.search-results', panel);

	const code = qs('#config-download');
	code.onclick = _ => {
		if (!user_id) {
			register_login();
			return;
		}

		const conf = generate();
		const time = (new Date()).getTime();

		fake_blob_download(JSON.stringify(conf), `energyaccessexplorer-config-${time}.json`);

		results.innerText = JSON.stringify(conf, null, "  ");
	};

	const load = qs('#config-upload');
	load.onclick = _ => {
		if (!user_id) {
			register_login();
			return;
		}

		const input = document.createElement('input');
		input.type = 'file';
		input.click();

		input.onchange = e => {
			const file = e.target.files[0];

			const reader = new FileReader();
			reader.readAsText(file, 'UTF-8');

			reader.onload = e => {
				const conf = JSON.parse(e.target.result);
				const valid = validate(conf);

				if (!valid) return;

				load_datasets(conf.datasets);
				results.innerText = JSON.stringify(conf, null, "  ");

				COMMIT("datasets");
			};
		};
	};
};
