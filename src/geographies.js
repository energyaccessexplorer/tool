export async function search() {
	let data = {};

	const p = {
		"select": ["id", "name"],
		"datasets_count": "gt.0",
		"parent_id": GEOGRAPHY.parent_id ? `eq.${GEOGRAPHY.parent_id}` : "is.null",
		"adm": `eq.${GEOGRAPHY.adm}`,
		"envs": `ov.{${ENV}}`,
		"order": "name.asc"
	};

	const list = await ea_api.get("geographies", p).then(j => {
		j.forEach(g => data[g.name] = g.name);
		return j;
	});

	function set_default(input) {
		const g = list.find(x => x.id === GEOGRAPHY.id);
		if (g) input.value = g.name;

		return input;
	};

	const sl = new selectlist("geographies-search", data, {
		'change': function(_) {
			const c = list.find(x => x.name === this.value);

			if (maybe(c, 'id') && GEOGRAPHY.id !== c.id) {
				const url = new URL(location);
				url.searchParams.set('id', c.id);
				location = url;
			}
		}
	});

	qs('#geographies-search').append(sl.el);

	set_default(sl.input);
};

export function init() {
	search();
};
