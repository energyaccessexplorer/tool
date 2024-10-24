const views = {
	"inputs": {
		"name":        "Data",
		"description": "Underlying data that go into the analysis",
	},

	"filtered": {
		"name":        "Filtered Areas",
		"description": "Filtered areas",
	},

	"outputs": {
		"name":        "Analysis",
		"description": "Results of the analysis",
	},
};

export function buttons() {
	const el = qs('#views');
	const btns = qsa('#views .up-title', el);

	btns.forEach(e => e.classList.remove('active'));

	const t = qs('#view-' + U.view);
	if (t) t.classList.add('active');
};

export function right_pane() {
	const panes = ["indexes", "filtered"];

	const map = {
		"inputs":   ["indexes"],
		"outputs":  ["indexes"],
		"filtered": ["filtered"],
	};

	for (let pi of panes) {
		let p; if (!(p = qs(`#${pi}-pane`))) continue;
		p.style['display'] = (map[U.view].indexOf(pi) > -1) ? "" : "none";
	}
};

export function init() {
	const el = qs('#views');

	for (let v in views) {
		if (!PARAMS.view.includes(v)) continue;

		if (v === 'filtered' && !GEOGRAPHY.configuration.filtered_geographies) continue;

		const btn = ce('div', views[v]['name'], { "class": 'view up-title', "id": 'view-' + v, "ripple": '' });

		if (U.view === v) btn.classList.add('active');

		btn.onclick = async _ => {
			await delay(0.2);
			O.view = v;
		};

		el.append(btn);
	}
};
