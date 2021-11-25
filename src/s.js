if (location.hostname.match(/^www/))
	ENV = "production";
else if (location.hostname.match(/^staging/))
	ENV = "staging";
else if (location.hostname.match(/localhost/))
	ENV = ["production", "staging"];

function ugly_flag(flagurl) {
	return ce('img', null, {
		src: flagurl,
		width: MOBILE ? 100 : 200,
	});
};

async function geography(c) {
	const coll = await ea_api.get("geographies", {
		"datasets_count": "gt.0",
		"parent_id": `eq.${c.id}`,
		"deployment": `ov.{${ENV}}`,
	});

	const data = {};
	for (let x of coll) data[x.name] = x.name;

	const sl = new selectlist(`geographies-select-` + c.id, data, {
		'change': function(_) {
			const x = coll.find(x => x.name === this.value);
			if (x) usertype(x.id);
		}
	});

	if (coll.length === 0) {
		usertype(c.id);
		return;
	}

	let content = ce('div');
	content.append(
		ce('p', `We have several geographies for ${c.name}. Please do select one.`),
		sl.el
	);

	ea_modal.set({
		header: c.name,
		content: content,
		footer: null
	}).show();

	sl.input.focus();
};

const presets = [
	{
		"name": "Strategic and Integrated Energy Planning",
		"output": "eai",
		"view": "outputs",
		"description": "Electrification planning agencies are able to link electrification and development outcomes.",
	},
	{
		"name": "The expansion of clean energy markets",
		"output": "eai",
		"view": "outputs",
		"description": "Technology suppliers (whether mini grid developers or solar home system providers) can get a better understanding of aspects of affordability and level of service needed.",
	},
	{
		"name": "Impact investment",
		"output": "ani",
		"view": "outputs",
		"description": "Donors and development finance institutions can identify areas where grants and support will have the most impact."
	},
	{
		"name": "Bottom-up assessment of energy needs",
		"output": "demand",
		"view": "outputs",
		"description": "Service delivery institutions in the health, education and agriculture sectors are able to estimate energy needs associated to development services."
	},
	{
		"name": "Generate custom geospatial analysis based on your own criteria",
		"description": null,
		"output": "eai",
		"view": "inputs",
		"datasets": [],
	},
];

async function usertype(gid) {
	const content = ce('div', ce('p', "What are you interested in?"), { "id": "presets" });

	const ul = ce('ul');
	for (const t of presets) {
		const inputs = t.datasets.map(x => x.name).join(',');
		const output = t.output;
		const view = t.view;

		const p = ce('p', t.description);
		const li = ce('li', ce('a', [ce('h3', t.name), p], { "href": `/tool/a?id=${gid}&inputs=${inputs}&output=${output}&view=${view}` }));
		li.onclick = function() {
			localStorage.setItem('config', JSON.stringify(t));
		};

		ul.append(li);
	}

	content.append(ul);

	ea_modal.set({
		content,
		"header": "Choose your area of interest",
		footer: null,
	}).show();
};

async function overview() {
	let r;

	await fetch('https://wri-public-data.s3.amazonaws.com/EnergyAccess/Country%20indicators/eae_country_indicators.csv')
		.then(r => r.text())
		.then(t => d3.csvParse(t))
		.then(d => (r = d.find(x => x.name === GEOGRAPHY.name)));

	if (r) {
		r['urban_population'] = (100 - r['rural_population']).toFixed(1);

		if (r['urban_electrification'] > 0) {
			let eru = ea_svg_pie(
				[
					[100 - r['urban_electrification']],
					[r['urban_electrification']]
				],
				50, 0,
				[
					getComputedStyle(document.body).getPropertyValue('--the-light-green'),
					getComputedStyle(document.body).getPropertyValue('--the-green')
				],
				"",
				x => x
			);

			r['urban_electrification_pie'] = eru.svg;
			eru.change(0);
		}

		if (r['rural_electrification'] > 0) {
			let err = ea_svg_pie(
				[
					[100 - (r['rural_electrification'])],
					[r['rural_electrification']]
				],
				50, 0,
				[
					getComputedStyle(document.body).getPropertyValue('--the-light-green'),
					getComputedStyle(document.body).getPropertyValue('--the-green')
				],
				"",
				x => x
			);

			r['rural_electrification_pie'] = err.svg;
			err.change(0);
		}

		ea_modal.set({
			header: r.name,
			content: tmpl('#country-overview', r),
			footer: ce(
				'div',
				"<strong>Source:</strong> World Bank, World Development Indicators (latest data) crosschecked with values reported by local stakeholders/partners.",
				{ style: "font-size: small; max-width: 30em; margin-left: auto; margin-right: 0;" }
			),
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
					name: r['ds_name'],
					weight: intornot(r['weight']),
					domain: {
						min: intornot(r['min']),
						max: intornot(r['max']),
					},
				};

				preset.datasets.push(ds);
			});
		});
};

export function init() {
	const playground = qs('#playground');

	MOBILE = window.innerWidth < 1152;

	function hextostring(hex) {
		let s = "";

		//             ________________ careful there
		//            /
		//           V
		for (let i = 2; i < hex.length; i += 2)
			s += String.fromCharCode(parseInt(hex.substr(i, 2), 16));

		return s;
	};

	function list(geographies) {
		for (let co of geographies) {
			const d = ce('div', ce('h2', co.name, { class: 'country-name' }), { class: 'country-item', ripple: "" });
			d.onclick = _ => setTimeout(_ => geography(co), 350);

			const intro = maybe(co, 'configuration', 'introduction');
			if (intro) {
				let p;
				d.onmouseenter = _ => {
					p = bubblearrow(d, {
						message: ce('pre', intro),
						close: false,
						position: "C",
					});
				};
				d.onmouseleave = _ => {
					p.remove();
				};
			}

			fetch(`https://world.energyaccessexplorer.org/countries?select=flag&or=(names->>official.eq.${co.name},name.eq.${co.name})`)
				.then(r => r.json())
				.then(r => {
					const data = r[0];

					if (!data) return;

					d.append(ugly_flag(
						URL.createObjectURL((new Blob([hextostring(data['flag'])], {type: 'image/svg+xml'})))
					));
				});

			playground.append(d);
		}

		ea_loading(false);
	};

	ea_api
		.get("geographies", {
			"adm": "eq.0",
			"deployment": `ov.{${ENV}}`,
		})
		.then(r => list(r))
		.catch(error => {
			ea_flash.push({
				type: 'error',
				title: "Fetch error",
				message: error
			});

			throw error;
		});

	presets_init();

	if (ENV === "nothing") overview();
};
