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

export async function geographies_search() {
	let data = {};

	const p = {
		"select": ["id", "name"],
		"datasets_count": "gt.0",
		"parent_id": GEOGRAPHY.parent_id ? `eq.${GEOGRAPHY.parent_id}` : "is.null",
		"adm": `eq.${GEOGRAPHY.adm}`,
		"envs": `cs.{${ENV}}`,
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

	const info = tmpl('#svg-info');
	info.querySelector('path').setAttribute('fill', 'rgba(255, 255, 255, 0.3)');
	info.onclick = overview;
	info.style = `
display: inline-block;
transform: scale(1.2);
width: 50px;
cursor: pointer;
`;

	qs('#geographies-search').append(sl.el, info);

	set_default(sl.input);
};
