let root, ul, input, resultscontainer;

let list;

function li(g) {
	const el = ce('li', g.name);

	el.onclick = function() {
		const url = new URL(location);
		url.searchParams.set('id', g.id);
		location = url;
	};

	return el;
};

function trigger(value) {
	for (const i of list)
		i.li.style.display = i.name.match(new RegExp(value, 'i')) ? "" : "none";
};

export async function init() {
	root = qs('#geographies.search-panel');
	input = ce('input', null, { id: 'geographies-search', autocomplete: 'off', class: 'search-input' });
	input.setAttribute('placeholder', 'Geographies search');

	root.prepend(input);

	resultscontainer = qs('#geographies .search-results');
	ul = ce('ul');
	resultscontainer.append(ul);

	const p = {
		"select": ["id", "name"],
		"datasets_count": "gt.0",
		"parent_id": GEOGRAPHY.parent_id ? `eq.${GEOGRAPHY.parent_id}` : "is.null",
		"adm": `eq.${GEOGRAPHY.adm}`,
		"deployment": `ov.{${ENV}}`,
		"order": "name.asc"
	};

	list = await ea_api.get("geographies", p).then(j => {
		j.forEach(g => {
			g.li = li(g);
			ul.append(g.li);
		});
		return j;
	});

	input.oninput = function(_) {
		trigger(this.value);
	};

	input.onfocus = function(_) {
		this.value = "";
	};

	const g = list.find(x => x.id === GEOGRAPHY.id);
	if (g) input.value = g.name;
};
