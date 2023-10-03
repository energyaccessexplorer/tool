import DS from './ds.js';

import dscard from './cards.js';

export function load_datasets(conf) {
	const list = DS.array.filter(d => conf.datasets.find(t => t.name === d.id || t.id === d.id));

	conf.datasets.forEach(d => {
		const ds = list.find(t => d.name === t.id || t.id === d.id);

		if (!ds) {
			console.warn("config load: No such dataset on this geography:", d);
			return;
		}

		if (ds._domain) {
			if (typeof d.domain.min === 'number') ds._domain.min = d._domain?.min || d.domain.min;
			if (typeof d.domain.max === 'number') ds._domain.max = d._domain?.max || d.domain.max;
		}
		else
			console.warn(`Could not initialise domain for '${ds.id}'. Valued polygons, right?`);

		if (typeof d.weight === 'number') ds.weight = d.weight;
	});

	return conf;
};

export function generate() {
	const datasets = dscard.all.map(d => d.ds)
		.map(d => ({
			"dataset_id": d.dataset_id,
			"id":         d.id,
			"name":       d.name,
			"weight":     d.weight,
			"domain":     d.domain,
			"_domain":    d._domain,
			"index":      d.index,
			"unit":       d.category.unit,
		}));

	const config = {
		datasets,
		"geography": GEOGRAPHY.id,
		"zoom":      MAPBOX.getZoom(),
		"center":    MAPBOX.getCenter(),
		"theme":     ea_settings.mapbox_theme,
		"view":      U.view,
		"subdiv":    U.subdiv,
		"divtier":   U.divtier,
		"tab":       U.tab,
		"output":    U.output,
		"variant":   U.variant,
	};

	return config;
};
