import DS from './ds.js';

export function load_datasets(conf) {
	const list = DS.array.filter(d => conf.datasets.find(t => t.id === d.dataset_id || t.name === d.id));

	conf.datasets.forEach(d => {
		const ds = list.find(t => t.dataset_id === d.id || t.id === d.name);

		if (!ds) {
			console.error("config load: Failed to find dataset for preset/param:", d);
			return;
		}

		if (typeof d.domain.min === 'number') ds._domain.min = d.domain.min;
		if (typeof d.domain.max === 'number') ds._domain.max = d.domain.max;

		if (typeof d.weight === 'number') ds.weight = d.weight;
	});

	return conf;
};

export function generate() {
	const datasets = [];

	for (let i of U.inputs) {
		let d = DST.get(i);

		datasets.push({
			"id":     d.dataset_id,
			"name":   d.id,
			"weight": d.weight,
			"domain": d._domain,
		});
	}

	const config = {
		"geography": GEOGRAPHY.id,
		"zoom":      MAPBOX.getZoom(),
		"center":    MAPBOX.getCenter(),
		"view":      U.view,
		"subdiv":    U.subdiv,
		"divtier":   U.divtier,
		"tab":       U.tab,
		"output":    U.output,
		"theme":     ea_settings.mapbox_theme,
		"datasets":  datasets,
		"variant":   U.variant,
	};

	return config;
};
