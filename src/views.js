const views = {
	"data": {
		"name":        "Data",
		"description": "Underlying data that go into the analysis",
	},

	"filtered": {
		"name":        "Filtered Areas",
		"description": "Filtered areas",
	},

	"analysis": {
		"name":        "Analysis",
		"description": "Results of the analysis",
	},
};

export function buttons(v) {
	const el = qs('#views');
	const btns = qsa('#views .up-title', el);

	btns.forEach(e => e.classList.remove('active'));

	const t = qs('#view-' + v);
	if (t) t.classList.add('active');
};

export function right_pane() {
	const panes = ["indexes", "filtered"];

	const map = {
		"data":     ["indexes"],
		"analysis":  ["indexes"],
		"filtered": ["filtered"],
	};

	for (let pi of panes) {
		let p; if (!(p = qs(`#${pi}-pane`))) continue;
		p.style['display'] = (map[STATE.view].indexOf(pi) > -1) ? "" : "none";
	}
};

export function init() {
	const el = qs('#views');

	for (let v in views) {
		if (v === 'filtered' && !GEOGRAPHY.configuration.filtered_geographies) continue;

		const btn = ce('div', views[v]['name'], { "class": 'view up-title', "id": 'view-' + v, "ripple": '' });

		if (STATE.view === v) btn.classList.add('active');

		btn.onclick = _ => STATE.view = v;

		el.append(btn);
	}
};
