import {
	pointto as search_pointto,
} from './search.js';

import DS from './ds.js';

export const colors_array = ["transparent", "red", "#0059ff", "#d6d600", "green", "#d600c6", "#00cad6", "#6a4801", "black"];

function pointto(f, dsname, name) {
	const ext = geojsonExtent(f);

	const dict = [[ "name", dsname ]];
	const props = { name };

	search_pointto([((ext[0] + ext[2]) / 2), ((ext[1] + ext[3]) / 2)], dict, props);
};

export function valued_polygons() {
	const lists = qs('#filtered-subgeographies');

	const opens = Array.from(qsa('details[open]', lists)).map(a => a.id);

	lists.replaceChildren();

	const datasets = DS.array.filter(d => and(d.on, d.datatype.match("polygons-(valued|timeline)"), maybe(d, 'csv', 'data')));

	function matches(d) {
		return d.csv.data
			.filter(r => {
				let c;
				if (d.datatype.match("polygons-(timeline)"))
					c = U.timeline;
				else if (d.datatype.match("polygons-(valued|boundaries)"))
					c = d.config.polygons_valued_columns.value;

				const v = +r[c];
				return and(v >= d._domain.min, v <= d._domain.max);
			})
			.map(r => +r[d.csv.key]);
	};

	GEOGRAPHY.divisions.forEach((d,k) => {
		const n = datasets.filter(t => t.config.divisions_tier === k);
		if (!n.length) return;

		let ul = ce('ul');
		const details = ce('details', [ce('summary', d.name), ul], { "id": `filtered-divisions-${k}` });
		if (opens.find(t => t === details.id)) details.setAttribute('open', '');

		const arr = n.map(t => matches(t));

		if (!arr.length) return;

		const result = arr[0].filter(e => arr.every(a => a.includes(e)));

		const source = MAPBOX.getSource(`filtered-source-${k}`);

		const fs = source._data.features;

		const lis = [];

		const c = colors_array[k];

		for (let i = 0; i < fs.length; i += 1) {
			const x = result.includes(+fs[i].id);

			fs[i].properties['__visible'] = x;

			if (x) {
				const name = d.csv.table[fs[i].id];

				const t = ce('li', [
					ce('span', "●", { "class": "colored-disc", "style": `color: ${c};` }),
					ce('span', name),
				]);

				t.onmouseover = pointto.bind(this, fs[i], d.name, name);

				lis.push(t);
			}
		}

		ul.append(...lis);

		source.setData(source._data);

		lists.append(details);
	});
};
