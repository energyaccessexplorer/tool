import {
	pointer as mapbox_pointer,
} from './mapbox.js';

function setup() {
	const root = qs('#vectors.search-panel');
	const input = ce('input', null, { id: 'vectors-search', autocomplete: 'off', class: 'search-input' });
	input.setAttribute('placeholder', 'Search features');

	root.prepend(input);

	const resultscontainer = qs('#vectors .search-results');
	const maparea = qs('#maparea');
	const ul = ce('ul');

	let resultsinfo;
	let ds;
	let attr;
	let searchable;
	let pointer;

	function pointto(f) {
		const t = MAPBOX.querySourceFeatures(ds.source.id, {
			filter: ['==', attr, f.properties[attr] || "<justnotnull>"]
		});

		if (t[0]) {
			const {x,y} = (_ => {
				if (ds.datatype === 'points')
					return MAPBOX.project(t[0].geometry.coordinates);
				else {
					const ext = geojsonExtent(t[0]);
					return MAPBOX.project([((ext[0] + ext[2]) / 2), ((ext[1] + ext[3]) / 2)]);
				}
			})();

			const dict = [[ "name", ds.name ]];
			const props = { name: f.properties[attr] };

			const td = table_data(dict, props);

			const box = maparea.getBoundingClientRect();
			pointer = mapbox_pointer(td, box.x + x, box.y + y);
		};
	};

	async function reset() {
		ds = DST.get(U.inputs[0]);

		if (!ds) return;

		elem_empty(ul);
		if (pointer) pointer.drop();
		resultscontainer.innerHTML = "";

		resultsinfo = ce('div', `<b>${ds.name}</b>.`, { class: 'search-results-info' });

		resultscontainer.append(resultsinfo);

		if (!ds || !ds.vectors) {
			resultscontainer.innerHTML = "";
			resultsinfo.innerHTML = `<b>${ds.name}</b> is not searchable. Try a dataset with polygons, points or lines ;)`;
			searchable = false;
			return;
		}

		await until(_ => ds.vectors.features.features);

		const first = ds.vectors.features.features[0];

		for (const a of ['name', 'Name', 'NAME']) {
			if (first.properties.hasOwnProperty(a)) { attr = a; break; }
		}

		if (!(searchable = !!attr)) {
			resultsinfo.innerHTML = `<b>${ds.name}</b> is not searchable (for now...)`;
			return;
		}

		for (const f of ds.vectors.features.features) {
			if (f['__li']) continue;

			const li = ce('li', f.properties[attr]);
			li.onmouseenter = _ => {
				if (pointer) pointer.drop();
				pointto(f);
			};
			f['__li'] = li;
		}

		resultscontainer.append(ul);
	};

	input.oninput = function() {
		if (this.value === "") {
			reset();
			return;
		}

		if (!searchable) return;

		let count = 0;
		elem_empty(ul);
		for (let i = 0; i < ds.vectors.features.features.length; i++) {
			if (count > 100) {
				qs('div.search-results-info', resultscontainer).innerHTML = `Searching <b>${ds.name}</b>. Too many results. Showing first 101 <i>only</i>:`;
				break;
			}

			resultsinfo.innerHTML = `Searching <b>${ds.name}</b>. ${count} results:`;

			const f = ds.vectors.features.features[i];
			let matches = false;

			for (const [k,v] of Object.entries(f.properties)) {
				if (k !== attr) continue;

				if (v && v.match(new RegExp(this.value, 'i'))) {
					matches = true;
					continue;
				}
			}

			if (matches) {
				ul.append(f['__li']);
				count += 1;
			}
		}
	};

	input.onfocus = function() {
		input.dispatchEvent(new Event('input'));
	};
};

export function init() {
	setup();
};
