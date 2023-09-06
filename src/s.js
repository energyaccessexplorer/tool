import modal from '../lib/modal.js';

import bubblemessage from '../lib/bubblemessage.js';

import selectlist from '../lib/selectlist.js';

function preload_boundaries(id) {
	return API.get('datasets', {
		"select":        ['processed_files'],
		"geography_id":     `eq.${id}`,
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

	if (c.datasets_count > 1) coll.unshift(c);

	const data = {};
	for (let x of coll) data[x.name] = x.name;

	const sl = new selectlist(`geographies-select-` + c.id, data, {
		'change': function(_) {
			const x = coll.find(x => x.name === this.value);

			if (maybe(x, 'configuration', 'exclude_sector_presets')) {
				window.location = `/tool/a?id=${x.id}`;
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
		const li = ce('li', ce('a', [ce('h3', t.name), p], { "href": `/tool/a?id=${gid}&output=${output}&view=${view}&variant=${variant}` }));
		li.onclick = function() {
			localStorage.setItem('config', JSON.stringify(t));
			localStorage.setItem('user-type', t.name);
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

async function overview() {
	let r;

	await fetch('https://wri-public-data.s3.amazonaws.com/EnergyAccess/Country%20indicators/eae_country_indicators.csv')
		.then(r => r.text())
		.then(t => d3.csvParse(t))
		.then(d => (r = d.find(x => x.name === GEOGRAPHY.name)));

	const bubble = v => new bubblemessage({ "message": v + "%", "position": "W", "close": false, "noevents": true });

	if (r) {
		r['urban_population'] = (100 - r['rural_population']).toFixed(1);

		if (r['urban_electrification'] > 0) {
			let eru = svg_pie(
				[
					[100 - r['urban_electrification']],
					[r['urban_electrification']],
				],
				50, 0,
				[
					getComputedStyle(document.body).getPropertyValue('--the-light-green'),
					getComputedStyle(document.body).getPropertyValue('--the-green'),
				],
				"",
				x => x,
				bubble,
			);

			r['urban_electrification_pie'] = eru.svg;
			eru.change(0);
		}

		if (r['rural_electrification'] > 0) {
			let err = svg_pie(
				[
					[100 - (r['rural_electrification'])],
					[r['rural_electrification']],
				],
				50, 0,
				[
					getComputedStyle(document.body).getPropertyValue('--the-light-green'),
					getComputedStyle(document.body).getPropertyValue('--the-green'),
				],
				"",
				x => x,
				bubble,
			);

			r['rural_electrification_pie'] = err.svg;
			err.change(0);
		}

		new modal({
			"id":      'overview-modal',
			"header":  r.name,
			"content": tmpl('#country-overview', r),
			"footer":  ce(
				'div',
				"<strong>Source:</strong> World Bank, World Development Indicators (latest data) crosschecked with values reported by local stakeholders/partners.",
				{ "style": "font-size: small; max-width: 30em; margin-left: auto; margin-right: 0;" },
			),
			"destroy": true,
		}).show();
	}
};

async function presets_init() {
	function intornot(str) {
		const i = parseInt(str);
		if (and((typeof i === 'number'), !isNaN(i)))
			return parseInt(i);
	};

	d3.csv(ea_settings.storage + "presets.csv")
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

			fetch(`${ea_settings.world}/countries?select=flag&or=(names->>official.eq."${_name}",name.eq."${_name}")`)
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

	if (ENV === "nothing") overview();
};
