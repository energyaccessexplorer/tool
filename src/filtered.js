import DS from './ds.js';

export function filtered_valued_polygons() {
	const lists = qs('#filtered-subgeographies');

	const opens = Array.from(qsa('details', lists)).map(a => a.getAttribute('open') === '');
	opens.unshift(false);

	lists.replaceChildren();

	const datasets = DS.array.filter(d => and(d.on, d.datatype.match("polygons-(fixed|timeline)"), maybe(d, 'csv', 'data')));

	function matches(d) {
		return d.csv.data
			.filter(r => {
				let c;
				if (d.datatype.match("polygons-(timeline)"))
					c = U.timeline;
				else if (d.datatype.match("polygons-(fixed|boundaries)"))
					c = d.config.csv.key;

				const v = +r[c];
				return and(v >= d._domain.min, v <= d._domain.max);
			})
			.map(r => +r[d.csv.key]);
	};

	GEOGRAPHY.divisions.forEach((d,k) => {
		const n = datasets.filter(t => t.config.divisions_tier === k);
		if (!n.length) return;

		let ul = ce('ul');
		const details = ce('details', [ce('summary', d.name), ul], opens[k] ? { "open": '' } : {});

		const arr = n.map(t => matches(t));

		if (!arr.length) return;

		const result = arr[0].filter(e => arr.every(a => a.includes(e)));

		const source = MAPBOX.getSource(`filtered-source-${k}`);

		const fs = source._data.features;

		const lis = [];
		for (let i = 0; i < fs.length; i += 1) {
			const x = result.includes(+fs[i].id);

			fs[i].properties.__visible = x;

			if (x) lis.push(ce('li', d.csv.table[fs[i].id]));
		}

		ul.append(...lis);

		source.setData(source._data);

		lists.append(details);
	});
};
