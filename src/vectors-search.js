import {
	pointer as mapbox_pointer,
} from './mapbox.js';

function setup() {
	const sl = new selectlist('vectors-search', [], {});
	const input = sl.el;

	const resultscontainer = qs('#vectors-results');
	const ul = ce('ul');

	let ds;
	let attr;
	let searchable;
	let pointer;
	const maparea = qs('#maparea');

	function pointto(f) {
		const t = MAPBOX.querySourceFeatures(ds.source.id, {
			filter: ['==', attr, f.properties[attr] || "<justnotnull>"]
		});

		if (t[0]) {
			const {x,y} = MAPBOX.project(t[0].geometry.coordinates);

			const dict = [[ "name", ds.name ]];
			const props = { name: f.properties[attr] };

			const td = table_data(dict, props);

			const box = maparea.getBoundingClientRect();
			pointer = mapbox_pointer(td, box.x + x, box.y + y);
		};
	};

	async function reset() {
		ds = DST.get(U.inputs[0]);
		ul.innerHTML = "";
		resultscontainer.innerHTML = "";
		resultscontainer.append(ce('p', `Searching <b>${ds.name}</b>`));

		if (!ds || !ds.vectors) {
			resultscontainer.innerHTML = "";
			resultscontainer.append(ce('p', `<b>${ds.name}</b> is not searchable. Try a dataset with polygons, points or lines ;)`));
			searchable = false;
			return;
		}
		else {
			await until(_ => ds.vectors.features.features);

			const first = ds.vectors.features.features[0];

			for (const a of ['name', 'Name', 'NAME']) {
				if (first.properties.hasOwnProperty(a)) { attr = a; break; }
			}

			if (!(searchable = !!attr)) {
				resultscontainer.append(ce('p', `<b>${ds.name}</b> is not searchable (for now...)`));
				return;
			}

			for (const f of ds.vectors.features.features) {
				const li = ce('li', f.properties[attr]);
				li.onmouseenter = _ => {
					if (pointer) pointer.drop();
					pointto(f);
				};
				ul.append(li);
			}
		}

		resultscontainer.append(ul);
	};

	input.oninput = function() {
		if (this.value === "") {
			reset();
			return;
		}

		if (!searchable) return;

		for (let i = 0; i < ds.vectors.features.features.length; i++) {
			const f = ds.vectors.features.features[i];
			let matches = false;

			for (const [k,v] of Object.entries(f.properties)) {
				if (k !== attr) continue;

				if (v && v.match(new RegExp(this.value, 'i'))) {
					matches = true;
					continue;
				}
			}

			ul.children[i].style.display = matches ? '' : 'none';
		}
	};

	input.onfocus = function() {
		input.dispatchEvent(new Event('input'));
	};

	qs('#vectors-search').append(input);
};

export function init() {
	setup();
};
