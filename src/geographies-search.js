export async function setup() {
	const root = qs('#geographies.search-panel');
	const input = ce('input', null, { id: 'geographies-search', autocomplete: 'off', class: 'search-input' });
	input.setAttribute('placeholder', 'Geographies search');

	root.prepend(input);

	const resultscontainer = qs('#geographies .search-results');
	const ul = ce('ul');
	resultscontainer.append(ul);

	const p = {
		"select": ["id", "name"],
		"datasets_count": "gt.0",
		"parent_id": GEOGRAPHY.parent_id ? `eq.${GEOGRAPHY.parent_id}` : "is.null",
		"adm": `eq.${GEOGRAPHY.adm}`,
		"envs": `ov.{${ENV}}`,
		"order": "name.asc"
	};

	function li(g) {
		const el = ce('li', g.name);
		el.onclick = function() {
			const url = new URL(location);
			url.searchParams.set('id', g.id);
			location = url;
		};

		return el;
	};

	const list = await ea_api.get("geographies", p).then(j => {
		j.forEach(g => {
			g.li = li(g);
			ul.append(g.li);
		});
		return j;
	});

	function set_default(i) {
		const g = list.find(x => x.id === GEOGRAPHY.id);
		if (g) i.value = g.name;

		return i;
	};

	input.oninput = function(_) {
		for (const i of list)
			i.li.style.display = i.name.match(new RegExp(this.value, 'i')) ? "" : "none";
	};

	input.onfocus = function(_) {
		this.value = "";
	};

	set_default(input);
};

export function init() {
	setup();
};
