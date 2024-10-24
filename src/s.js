import {
	loading,
} from './utils.js';

import modal from '../lib/modal.js';

import bubblemessage from '../lib/bubblemessage.js';

import selectlist from '../lib/selectlist.js';

function preload_boundaries(id) {
	return API.get('datasets', {
		"select":        ['processed_files'],
		"geography_id":  `eq.${id}`,
		"category_name": "in.(outline,boundaries)",
	}).then(r => {
		r.map(d => d['processed_files'].find(f => f['func'] === 'vectors'))
			.forEach(f => fetch(f['endpoint']));
	});
};

async function geography(c) {
	const coll = await API.get("geographies", {
		"datasets_count": "gt.0",
		"parent_id":      `eq.${c.id}`,
		"deployment":     `ov.{${ENV}}`,
	});

	if (c.datasets_count > 2) coll.unshift(c); // 2 datasets: outline and admin-tiers

	const data = {};
	for (let x of coll) data[x.name] = x.name;

	const sl = new selectlist(`geographies-select-` + c.id, data, {
		'change': function(_) {
			const x = coll.find(x => x.name === this.value);

			if (maybe(x, 'configuration', 'exclude_sector_presets')) {
				window.location = `${window.BASE}/tool/a?id=${x.id}`;
				return;
			}

			if (x) usertype(x.id);
		},
	});

	if (coll.length === 1 && c.id === coll[0].id) {
		usertype(c.id);
		return;
	}

	let content = ce('div');
	content.append(
		ce('p', `We have several geographies for ${c.name}. Please do select one.`),
		sl.el,
	);

	new modal({
		"id":      'geography-modal',
		"header":  c.name,
		"content": content,
		"footer":  null,
		"destroy": true,
	}).show();

	sl.input.focus();
};

const presets = [
	{
		"name":        "Strategic and Integrated Energy Planning",
		"output":      "eai",
		"view":        "outputs",
		"description": "Electrification planning agencies are able to link electrification and development outcomes.",
		"variant":     "raster",
	},
	{
		"name":        "The expansion of clean energy markets",
		"output":      "eai",
		"view":        "outputs",
		"description": "Technology suppliers (whether mini grid developers or solar home system providers) can get a better understanding of aspects of affordability and level of service needed.",
		"variant":     "raster",
	},
	{
		"name":        "Impact investment",
		"output":      "ani",
		"view":        "outputs",
		"description": "Donors and development finance institutions can identify areas where grants and support will have the most impact.",
		"variant":     "raster",
	},
	{
		"name":        "Bottom-up assessment of energy needs",
		"output":      "demand",
		"view":        "outputs",
		"description": "Service delivery institutions in the health, education and agriculture sectors are able to estimate energy needs associated to development services.",
		"variant":     "raster",
	},
	{
		"name":        "Generate custom geospatial analysis based on your own criteria",
		"description": null,
		"output":      "eai",
		"view":        "inputs",
		"datasets":    [],
		"variant":     "raster",
	},
];

function usertype(gid) {
	const content = ce('div', ce('p', "What are you interested in?"), { "id": "presets" });

	const ul = ce('ul');
	for (const t of presets) {
		const { output, view, variant } = t;

		const p = ce('p', t.description);
		const li = ce('li', ce('a', [ce('h3', t.name), p], { "href": `${window.BASE}/tool/a?id=${gid}&output=${output}&view=${view}&variant=${variant}` }));
		li.onclick = function() {
			sessionStorage.setItem('config', JSON.stringify(t));
		};

		ul.append(li);
	}

	// move the "own criteria" entry to the beggining. CAREFUL: The rest of the presets are ordered with presets.tsv below..."
	ul.prepend(ul.lastElementChild);

	content.append(ul);

	new modal({
		content,
		"id":      'usertype-modal',
		"header":  "Choose your area of interest",
		"footer":  null,
		"destroy": true,
	}).show();
};

async function presets_init() {
	function intornot(str) {
		const i = parseInt(str);
		if (and((typeof i === 'number'), !isNaN(i)))
			return parseInt(i);
	};

	d3.csv(EAE['settings'].storage + "presets.csv")
		.then(function(rows) {
			rows.forEach(r => {
				const preset = presets[+r.preset_index];
				if (!preset) return;
				if (!preset.datasets) preset.datasets = [];

				const ds = {
					"name":   r['ds_name'],
					"weight": intornot(r['weight']),
					"domain": {
						"min": intornot(r['min']),
						"max": intornot(r['max']),
					},
				};

				preset.datasets.push(ds);
			});
		});
};

export function init() {
	const playground = qs('#playground');

	function hextostring(hex) {
		let s = "";

		//             /--------------- careful there
		//            /
		//           V
		for (let i = 2; i < hex.length; i += 2)
			s += String.fromCharCode(parseInt(hex.substr(i, 2), 16));

		return s;
	};

	function list(geographies) {
		for (let co of geographies) {
			const d = ce('div', ce('h2', co.name, { "class": 'country-name' }), { "class": 'country-item', "ripple": "" });
			d.onclick = async _ => {
				preload_boundaries(co.id);
				setTimeout(_ => geography(co), 350);
			};

			const intro = maybe(co, 'configuration', 'introduction');
			if (intro) {
				let p;
				d.onmouseenter = _ => {
					p = new bubblemessage({
						"message":  ce('pre', intro),
						"close":    false,
						"position": "C",
					}, d);
				};
				d.onmouseleave = _ => {
					p.remove();
				};
			}

			const _name = co.name.replace(new RegExp("\\ ?\\(?(" + ENV.join('|') + ")\\)?", "i"), '');

			fetch(`${EAE['settings'].world}/countries?select=flag&or=(names->>official.eq."${_name}",name.eq."${_name}")`)
				.then(r => r.json())
				.then(r => {
					const data = r[0];

					if (!data) return;

					d.append(ce('img', null, {
						"src":   URL.createObjectURL((new Blob([hextostring(data['flag'])], {"type": 'image/svg+xml'}))),
						"class": "flag",
					}));
				});

			playground.append(d);
		}

		loading(false);
	};

	API.get("geographies", {
		"select":     ['*', 'datasets_count'],
		"adm":        "eq.0",
		"deployment": `ov.{${ENV}}`,
	})
		.then(r => list(r))
		.catch(error => {
			FLASH.push({
				"type":    'error',
				"title":   "Fetch error",
				"message": error,
			});

			throw error;
		});

	presets_init();
};
