export function buttons() {
	const el = qs('#views');
	const btns = qsa('#views .up-title', el);

	btns.forEach(e => e.classList.remove('active'));

	const t = qs('#view-' + U.view);
	if (t) t.classList.add('active');
};

export function right_pane() {
	const panes = ["cards", "indexes", "filtered"];

	const views = {
		"timeline": ["cards"],
		"inputs": ["cards"],
		"outputs": ["indexes"],
		"filtered": ["filtered"],
	};

	for (let pi of panes) {
		let p; if (!(p = qs(`#${pi}-pane`))) continue;
		p.style['z-index'] = (views[U.view].indexOf(pi) > -1) ? 1 : 0;
	}
};

export function init() {
	const el = qs('#views');

	for (let v in ea_views) {
		if (!U.params.view.includes(v)) continue;

		const btn = ce('div', ea_views[v]['name'], { class: 'view up-title', id: 'view-' + v, ripple: '' });

		if (U.view === v) btn.classList.add('active');

		btn.onclick = async _ => {
			await delay(0.2);
			O.view = v;
		};

		el.append(btn);
	}
};
