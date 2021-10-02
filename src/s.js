function topo_flag(features, flagurl, config) {
	const width = MOBILE ? 100 : 200;
	const padding = 1;

	config = config || {
		'x': 0,
		'y': 0,
		'height': 24,
		'width': 32,
		'aspect-ratio': "xMidYMid"
	};

	const id = flagurl.substr(flagurl.length - 12);

	const svg = d3.select(document.createElementNS("http://www.w3.org/2000/svg", "svg"))
		.attr('width', width)
		.attr('height', width);

	const geopath = d3.geoPath()
		.projection(d3.geoMercator());

	svg.append('defs')
		.append('pattern')
		.attr('id', `flag-${id}`)
		.attr('patternUnits', 'objectBoundingBox')
		.attr('x', 0)
		.attr('y', 0)
		.attr('width', 1)
		.attr('height', 1)

		.append('image')
		.attr('href', flagurl)
		.attr('x', config['x'] || 0)
		.attr('y', config['y'] || 0)
		.attr('width', config['width'])
		.attr('height', config['height'])
		.attr('preserveAspectRatio', config['aspect-ratio'] + " slice");

	const g = svg.append('g');

	Whatever.then(_ => {
		const path = g.selectAll(`path`)
			.data(features)
			.enter().append('path')
			.attr('fill', `url(#flag-${id})`)
			.attr('d', geopath);

		const box = path.node().getBBox();
		const s = (box.height > box.width) ? (box.height - box.width)/2 : 0;

		const factor = Math.min(
			width / (box.width + (padding * 2)),
			width / (box.height + (padding * 2))
		);

		g.attr('transform', `scale(${factor})translate(${(-box.x + padding + s)}, ${(-box.y + padding)})`);

		URL.revokeObjectURL(flagurl);
	});

	return svg.node();
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

async function usertype(gid) {
	const types = {
		"Strategic and Integrated Energy Planning": {
			"inputs": ['schools', 'health', 'minigrids', 'transmission-subs', 'distribution-subs', 'transmission-lines', 'distribution', 'population-density'],
			"output": "eai",
			"view": "outputs",
			"description": "Electrification planning agencies are able to link electrification and development outcomes.",
		},
		"The expansion of clean energy markets": {
			"inputs": ['distribution-lines', 'minigrids', 'population-density', 'poverty', 'ghi'],
			"output": "eai",
			"view": "outputs",
			"description": "Technology suppliers (whether mini grid developers or solar home system providers) can get a better understanding of aspects of affordability and level of service needed.",
		},
		"Impact investment": {
			"inputs": ['poverty', 'crops', 'transmission-subs', 'distribution-subs', 'transmission-lines', 'distribution'],
			"output": "ani",
			"view": "outputs",
			"description": "Donors and development finance institutions can identify areas where grants and support will have the most impact."
		},
		"Bottom-up assessment of energy needs": {
			"inputs": ['schools', 'health', 'distribution-lines'],
			"output": "demand",
			"view": "outputs",
			"description": "Service delivery institutions in the health, education and agriculture sectors are able to estimate energy needs associated to development services."
		},
		"Generate custom geospatial analysis based on your own criteria": {
			"description": null,
			"inputs": [],
			"output": "eai",
			"view": "inputs",
		},
	};

	const content = ce('div');

	const ul = ce('ul');
	for (const t in types) {
		const inputs = types[t].inputs.join(',');
		const output = types[t].output;
		const view = types[t].view;

		ul.append(ce('li', ce('a', t, { "href": `/tool/a?id=${gid}&inputs=${inputs}&output=${output}&view=${view}` })));
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
		.then(d => {
			return r = d.find(x => x.cca3 === GEOGRAPHY.cca3);
		});

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

	if (location.hostname.match(/^www/))
		ENV = "production";
	else if (location.hostname.match(/^staging/))
		ENV = "staging";
	else if (location.hostname.match(/localhost/))
		ENV = ["production", "staging"];

	ea_api
		.get("geographies", {
			"adm": "eq.0",
			"deployment": `ov.{${ENV}}`,
		})
		.then(countries_online => {
			for (let co of countries_online) {
				const d = ce('div', ce('h2', co.name, { class: 'country-name' }), { class: 'country-item', ripple: "" });
				d.onclick = _ => setTimeout(_ => geography(co), 350);

				fetch(`https://world.energyaccessexplorer.org/countries?select=flag,geojson&cca3=eq.${co.cca3}`)
					.then(r => r.json())
					.then(r => {
						const data = r[0];

						d.append(topo_flag(
							JSON.parse(hextostring(data['geojson'])).features,
							URL.createObjectURL((new Blob([hextostring(data['flag'])], {type: 'image/svg+xml'}))),
							co.configuration.flag
						));
					});

				playground.append(d);
			}

			ea_loading(false);
		})
		.catch(error => {
			ea_flash.push({
				type: 'error',
				title: "Fetch error",
				message: error
			});

			throw error;
		});

	if (ENV === "nothing") overview();
};
