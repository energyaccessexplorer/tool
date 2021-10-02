import DS from './ds.js';

export function load(conf) {
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
	const tab = qs('#controls .controls-branch-tab.active');
	let tab_id = null;
	if (tab) tab_id = tab.id;

	const datasets = [];

	for (let i of U.inputs) {
		let d = DST.get(i);

		datasets.push({
			id: d.dataset_id,
			name: d.id,
			weight: d.weight,
			domain: d._domain,
			position: U.inputs.indexOf(d.id)
		});
	}

	const config = {
		"id": +(new Date) + "-" + parseInt(Math.random() * 1e4).toString(),
		"geography": GEOGRAPHY.id,
		"zoom": MAPBOX.getZoom(),
		"center": MAPBOX.getCenter(),
		"view": U.view,
		"subdiv": U.subdiv,
		"divtier": U.divtier,
		"tab": tab_id,
		"output": U.output,
		"theme": ea_settings.mapbox_theme,
		"datasets": datasets
	};

	return config;
};
