import DS from './ds.js';

export function load(conf) {
	const DSL = DS.array.filter(d => conf.datasets.find(t => t.id === d.dataset_id));
	conf.datasets.sort((a,b) => a.position < b.position ? 1 : -1);

	conf.datasets.forEach(d => {
		const t = DSL.find(x => x.dataset_id === d.id);
		t._domain = d.domain;
		t.weight = d.weight;
	});

	U.inputs = conf.datasets.map(d => d.name);

	U.view = conf.view;
	U.output = O.output = conf.output;

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
		"tab": tab_id,
		"output": U.output,
		"theme": ea_settings.mapbox_theme,
		"datasets": datasets
	};

	return config;
};
