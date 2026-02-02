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
