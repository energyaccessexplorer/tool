/* global PptxGenJS */

import DS from './ds.js';

import '../lib/jszip.js';

import '../lib/pptxgen.js';

import {
	medhigh_point_count,
	getpoints as toplocations_fetch,
} from './analysis.js';

import {
	coords_search_pois,
} from './mapbox.js';

import {
	generate as config_generate,
} from './config.js';

import {
	context,
} from './overlord.js';

let CONFIG;

const N_POINTS = 20;

const green = "#00794C";
const white = "#ffffff";
const black = "#393F44";
const grey = "#F9F8F8";
const bold = true;
const breakLine = true;
const x = 0.3;
const first_paragraph_y = 2;

const long_index_texts = {
	"eai":    "The Energy Access Potential Index is the weighted sum of the Demand Index and Supply Index. It indicates areas where the population has an ability to pay for electricity and that are close to social and productive uses of energy, have potential for renewable energy, and have existing or planned infrastructure.",
	"demand": "The Demand Index is the weighted sum of normalized demographic data and social and productive use data. The formula inverts the percentage of people who live below the poverty line to provide the number of people who live above the poverty line, which is used as a proxy for where people have an ability to pay for electricity.",
	"supply": "The Supply Index is the weighted sum of normalized renewable energy resources potential and existing infrastructure. Solar and wind potential values are added together, and proximity to potential hydropower and geothermal sites are added to find areas with high renewable potential.",
	"ani":    "The Need for Assistance Index is a weighted sum of certain demand and supply data and is used to indicate areas where financial assistance may be needed more.",
};

const tableborder = { "pt": "1", "color": "#ffffff" };

function a4(t, c) {
	if (c === 'x')
		return 11.69 * (t/100);

	else if (c === 'y')
		return 8.26 * (t/100);
}

function textopts($) {
	return Object.assign({ "color": black, "fontSize": 12, "valign": "top" }, $);
};

function footer($) {
	const h = 0.5;

	$.addShape(
		'rect',
		{ "x": 0, "y": a4(100, 'y') - 0.5, "w": a4(100, 'x'), h, "fill": { "color": green } },
	);

	$.addImage(
		{ "path": "/images/wri-hbox-white-on-yellow.jpg", "x": 0.5, "y": (a4(100, 'y') - h) + 0.125, "w": (h*3), "h": h/2 },
	);

	$.addText(
		"ENERGY ACCESS EXPLORER",
		textopts({ "x": "60%", "y": a4(100, 'y') - (h/2), "color": white, "valign": "middle" }),
	);
};

function chapter(number, name) {
	const $ = this.addSlide();

	$.addShape(
		this.ShapeType.rect,
		{ "x": "5%", "y": "5%", "w": 0.8, "h": 0.6, "fill": { "color": green } },
	);

	$.addText(
		number,
		{ "x": a4(5, 'x') + 0.2, "y": a4(5, 'y') + 0.3, "color": white, "fontSize": 24, "bold": true },
	);

	$.addText(
		name,
		{ "color": green, x, "y": a4(50, 'y'), "fontSize": 48, bold },
	);

	footer($);
};

function title($, text) {
	$.addText(
		text,
		{ "color": green, x, "y": 0.5, "w": "100%", "fontSize": 22, bold },
	);
};

function front() {
	const $ = this.addSlide();
	const color = white;

	$.background = { "color": green };
	$.color = color;

	const h = 1;
	$.addImage(
		{ "path": "/images/wri-box-white-on-yellow.jpg", "x": 0.5, "y": 0.5, "w": (h*2.12), h },
	);

	$.addText(
		"ENERGY ACCESS EXPLORER",
		{ color, "x": "50%", "y": 0.5, bold },
	);

	$.addText(
		[
			{
				"text":    "Energy Access Explorer Report",
				"options": { "fontSize": 48, bold, breakLine },
			}, {
				"text":    GEOGRAPHY.name,
				"options": { "fontSize": 48, bold, breakLine },
			}, {
				"text":    "A Data-driven, Integrated and Inclusive Approach to Achieving Universal Access to Energy for Equitable Development",
				"options": { "fontSize": 10 },
			},
		],
		{ color, x, "y": "50%", "w": "100%" },
	);

	$.addText(
		[
			{
				"text":    "Prepared by Hordor",
				"options": { bold, breakLine },
			}, {
				"text":    "The report has been developed using data available on the Energy Access Explorer",
				"options": { breakLine },
			}, {
				"text":    "https://www.energyaccessexplorer.org/",
				"options": { "fontSize": 8 },
			},
		],
		{ x, "y": "90%", "fontSize": 10 },
	);

	$.addText(
		(new Date()).toDateString(),
		{ "x": "85%", "y": "90%", "fontSize": 9, bold },
	);
};

function platform_overview() {
	const $ = this.addSlide();
	const color = black;

	title($, "Platform Overview");

	$.addText(
		"Energy Access Explorer is an online, open-source, interactive platform that uses mapping to visualize the state of energy access in unserved and underserved areas. It analyzes credible and public data to make the connection between the demand and supply of energy. Individuals can create custom analyses on Energy Access Explorer to identify and prioritize areas where energy markets can be expanded.",
		{ color, x, "y": first_paragraph_y, "fontSize": 12, bold },
	);

	$.addText(
		"The use of transparent data and analysis from Energy Access Explorer enables the following:",
		{ color, x, "y": 3, "fontSize": 12 },
	);

	$.addText(
		[
			{
				"text":    "Strategic Energy Planning. ",
				"options": { bold },
			}, {
				"text": "Analysts and/or decision-makers within energy planning functions (a rural electrification agency, a planning unit of an energy ministry, etc.) can use the tool to improve linking electrification and socioeconomic development to meet people's needs. Energy Access Explorer complements the cost-optimization planning tools these agencies use and provides a bottom-up representation of aspects of affordability and demand. Further, it serves as a database that aggregates up-todate information. This reduces high transaction costs for data aggregation and sharing.",
			},
		],
		textopts({ color, x, "y": 3.5 }),
	);

	$.addText(
		[
			{
				"text":    "Expansion of energy access markets. ",
				"options": { bold },
			}, {
				"text": "Off-grid and mini-grid developers can use the tool to better assess the level of service needed. Understanding where their customers are likely to be located and where there is a concentration of demand will help clean energy entrepreneurs identify market opportunities.",
			},
		],
		textopts({ color, x, "y": 5 }),
	);

	$.addText(
		[
			{
				"text":    "Investment for impact. ",
				"options": { bold },
			}, {
				"text": "Analysts and/or decisionmakers within development finance institutions and donors can understand better where to most effectively channel funds into electrification efforts to ensure that no one is left behind.",
			},
		],
		textopts({ color, x, "y": 6 }),
	);

	footer($);
};

function how_it_works() {
	const $ = this.addSlide();
	const color = black;

	title($, "How it Works");

	$.addText(
		"Energy Access Explorer (EAE) is an online, open-source, interactive, geospatial platform that enables clean energy entrepreneurs, energy planners, donors, and development-oriented institutions to identify high priority areas where energy access can be expanded. Using spatial data to link energy supply with growing or unmet demand is essential to gaining a better picture of energy access and expanding energy services to those who need it the most.",
		{ color, x, "y": first_paragraph_y, "fontSize": 12, bold },
	);

	$.addText(
		"It is a multi-criteria analysis tool that uses location-specific resource availability and infrastructure data to represent energy supply. It also incorporates demographic data and data on social and productive uses to visualize demand for energy services. Together, these supply and demand indicators enable more comprehensive energy planning. Spatial analysis tools, including multi-criteria analysis, overlays, filters and buffer zones, help users identify and prioritize areas where energy access can be expanded.",
		{ color, x, "y": 3.5, "fontSize": 12 },
	);

	$.addText(
		"The tool incorporates remote sensing data as well as data from global, national, sub-national and census databases that are either publicly available or provided by international partners and local stakeholders. It can host data available in various resolutions, scales and formats allowing for better or new datasets to be incorporated once available. The selection of data is based on a literature review and a survey WRI conducts on the importance of certain datasets in geospatial energy access planning. The list of essential data is reviewed by local stakeholders to ensure the platform is relevant and applicable in the local context.",
		{ color, x, "y": 5, "fontSize": 12 },
	);

	footer($);
};

function selected_datasets() {
	const all = DS.array.filter(d => d.on);

	selected_datasets_index(this.addSlide(), "demand", all);

	selected_datasets_index(this.addSlide(), "supply", all);
};

function selected_datasets_index($, index) {
	title($, `Selected ${ea_indexes[index]['name']} Datasets`);

	const rows = [[
		{
			"text":    "Dataset",
			"options": textopts({ "align": "center", bold }),
		}, {
			"text":    "Unit",
			"options": textopts({ "align": "center", bold }),
		}, {
			"text":    "Range",
			"options": textopts({ "align": "center", bold }),
		}, {
			"text":    "Selected Range",
			"options": textopts({ "align": "center", bold }),
		}, {
			"text":    "Importance",
			"options": textopts({ "align": "center", bold }),
		},
	]];

	const monospace = { "align": "center", "valign": "middle", "fontFace": "monospace", "fontSize": 9 };

	const selected = CONFIG.datasets
		.filter(d => d.index === index)
		.map(d => ([
			{
				"text":    d.name,
				"options": textopts({ "align": "left" }),
			}, {
				"text": d.unit ? d.unit.replace('<sup>2</sup>', '²') : "proximity in km",
			}, {
				"text":    `min: ${d.domain.min}, max: ${d.domain.max}`,
				"options": textopts(monospace),
			}, {
				"text":    `min: ${d._domain.min}, max: ${d._domain.max}`,
				"options": textopts(monospace),
			}, {
				"text":    d.weight,
				"options": textopts(monospace),
			},
		]));

	const tabletextopts = Object.assign(textopts({ "fontSize": 10, "align": "right", "valign": "middle" }));

	$.addTable(rows.concat(selected), Object.assign(tabletextopts, { x, "y": first_paragraph_y, "w": "90%" }));

	footer($);
};

function geography_indexes() {
	const $ = this.addSlide();

	geography_indexes_left.call(this, $);
	geography_indexes_right.call(this, $);

	footer($);
};

function geography_indexes_left($) {
	title($, GEOGRAPHY.name);

	$.addText(
		"Geospatial Analytical Outputs",
		textopts({ x, "y": 1, bold }),
	);

	let y = 2;
	for (const i of ['eai', 'demand', 'supply', 'ani']) {
		const index = ea_indexes[i];

		$.addText(
			[
				{
					"text":    index.name + " ",
					"options": { bold },
				}, {
					"text": index.info.replace(/\n/g, ' '),
				},
			],
			textopts({ x, y, "w": "45%", "fontSize": 11 }),
		);

		y += 1.2;
	}
};

function geography_indexes_right($) {
	const tabletextopts = Object.assign(textopts({ "fontSize": 9, "align": "right", "valign": "middle" }));

	function th(o = {}) {
		return Object.assign({}, tabletextopts, { bold, "color": white, "align": "center" }, o);
	};

	const cs = ea_analysis_colorscale.stops;

	function table(c, y) {
		const rows = [
			[
				{ "text": "" },
				{ "text": "low", "options": th({ "fill": cs[0] }) },
				{ "text": "low-med", "options": th({ "fill": cs[1] }) },
				{ "text": "medium", "options": th({ "fill": cs[2] }) },
				{ "text": "med-high", "options": th({ "fill": cs[3] }) },
				{ "text": "high", "options": th({ "fill": cs[4], "color": black }) },
			],
		];

		for (const k of Object.keys(SUMMARY)) {
			const r = [];

			r.push({ "text": ea_indexes[k]['name'], "options": { bold } });

			r.push(...SUMMARY[k][c]['amounts'].map(i => ({ "text": (i).toLocaleString() })));

			rows.push(r);
		}

		$.addTable(rows, Object.assign({ "x": "51%", y, "w": "45%" }, tabletextopts));
	};

	$.addShape(
		this.ShapeType.rect,
		{ "x": "50%", "y": 0, "w": "50%", "h": "100%", "fill": { "color": grey } },
	);

	$.addText(
		"Share of area for each Index in km²",
		textopts({ "x": "55%", "y": 1.5, bold, "color": green }),
	);

	table('area', 2);

	$.addText(
		"Share of population for each Index",
		textopts({ "x": "55%", "y": 4.5, bold, "color": green }),
	);

	table('population-density', 5);
};

function analysis(index) {
	function row(d) {
		return [
			{
				"text": d.text,
			}, {
				"text":    (d.value).toLocaleString(),
				"options": { "color": green, "fontSize": 24, "align": "right", bold, "wrap": false },
			},
		];
	};

	const summary_raster = SUMMARY[index].raster;

	const pop = DST.get('population-density');
	const pop_data = pop.raster.data;

	let right_rows = [];
	switch (index) {
	case 'demand': {
		let population_demand = 0;
		const data = summary_raster;

		for (let i = 0; i < data.length; i++) {
			if (and(data[i] > 0.5, pop_data[i] !== pop.raster.nodata))
				population_demand += pop_data[i];
		}

		right_rows = [
			row({
				"text":  "Population where demand is medium-high or high",
				"value": population_demand,
			}),
		];

		const health = DST.get('health');
		if (health?.on) {
			right_rows.push(
				row({
					"text":  "Number healthcare facilities, where demand is medium-high or high",
					"value": medhigh_point_count(
						health.raster.data,
						summary_raster,
					),
				}),
			);
		}

		const schools = DST.get('schools');
		if (schools?.on) {
			right_rows.push(
				row({
					"text":  "Number schools, where demand is medium-high or high",
					"value": medhigh_point_count(
						schools.raster.data,
						summary_raster,
					),
				}),
			);
		}

		break;
	}

	case 'supply': {
		// TODO: points? any points?
		const points = DS.array.filter(d => and(d.on, (d.index === index), d.datatype === 'points'));

		// TODO: lines? transmission + distribution?
		const lines = DS.array.filter(d => and(d.on, (d.index === index), d.datatype === 'lines'));

		let points_count = 0;
		for (const d of points) {
			const data = d.raster.data;

			for (let i = 0; i < data.length; i++) {
				if (and(data[i] === 0, summary_raster[i] > -1))
					points_count += 1;
			}
		}

		let population_lines = 0;
		for (const d of lines) {
			const data = d.raster.data;

			for (let i = 0; i < data.length; i++) {
				if (and(or(data[i] === 0, data[i] === 1), pop_data[i] !== pop.raster.nodata, summary_raster[i] > -1))
					population_lines += pop_data[i];
			}
		}

		const g = DST.get('ghi');
		const w = DST.get('windspeed');

		right_rows = [];

		if (points_count) {
			right_rows.push(
				row({
					"text":  "Number of supply points e.g. transformers, power stations",
					"value": points_count,
				}),
			);
		}

		if (lines.length) {
			right_rows.push(
				row({
					"text":  "Aproximate amount of people living with 1km of an electricity line",
					"value": population_lines,
				}),
			);
		}

		if (g.on) {
			const data = [];
			for (let i = 0; i < summary_raster.length; i++) {
				if (summary_raster[i] === -1) continue;
				else if (g.raster.data[i] === g.raster.nodata) continue;

				data.push(g.raster.data[i]);
			}

			right_rows.push(
				row({
					"text":  "Average Global Horizontal Irradiation (kWh/m²)",
					"value": Math.round(data.reduce((a,b) => a+b) / data.length).toLocaleString(),
				}),
			);
		}

		if (w.on) {
			const data = [];
			for (let i = 0; i < summary_raster.length; i++) {
				if (summary_raster[i] === -1) continue;
				else if (w.raster.data[i] === w.raster.nodata) continue;

				data.push(w.raster.data[i]);
			}

			right_rows.push(
				row({
					"text":  "Average Windspeed (m/s)",
					"value": (data.reduce((a,b) => a+b) / data.length).toFixed(2),
				}),
			);
		}

		break;
	}

	case 'ani':
	case 'eai': {
		const data = summary_raster;

		const pop = DST.get('population-density');
		const pop_data = pop.raster.data;

		let population_count = 0;
		for (let i = 0; i < data.length; i++) {
			if (and(data[i] > -1, pop_data[i] !== pop.raster.nodata))
				population_count += pop_data[i];
		}

		const points = DS.array.filter(d => and(d.on, or(d.id === 'health', d.id === "schools")));
		const lines = DS.array.filter(d => and(d.on, (d.index === 'supply'), d.datatype === 'lines'));

		const health = DST.get('health');
		const schools = DST.get('schools');

		let points_count = 0;
		for (const d of points) {
			const data = d.raster.data;

			for (let i = 0; i < data.length; i++) {
				if (and(data[i] === 0, summary_raster[i] > -1))
					points_count += 1;
			}
		}

		let population_lines = 0;
		for (const d of lines) {
			const data = d.raster.data;

			for (let i = 0; i < data.length; i++) {
				if (and(or(data[i] === 0, data[i] === 1), pop_data[i] !== pop.raster.nodata, summary_raster[i] > -1))
					population_lines += pop_data[i];
			}
		}

		right_rows = [
			row({
				"text":  "Aproximate amount of people living in the area covered by the analysis",
				"value": population_count,
			}),
		];

		if (lines.length) {
			right_rows.push(
				row({
					"text":  "Aproximate amount of people living with 1km of an electricity line",
					"value": population_lines,
				}),
			);
		}

		if (points.length) {
			const x = [[schools?.on, "schools"], [health?.on, "healthcare facilities"]].filter(t => t[0]).map(t => t[1]).join(' and ');

			right_rows.push(
				row({
					"text":  `Amounts on ${x} in the area covered by the analysis`,
					"value": points_count,
				}),
			);
		}

		break;
	}
	}

	if (!right_rows.length) return;

	const $ = this.addSlide();

	analysis_left.call(this, $, index);

	analysis_right.call(this, $, index, right_rows);

	footer($);
};

function analysis_left($, index) {
	title($, ea_indexes[index]['name']);

	$.addText(
		long_index_texts[index],
		textopts({ x, "y": 1, bold, "w": "45%" }),
	);

	const s = btoa(new XMLSerializer().serializeToString(ea_analysis_colorscale.svg));

	$.addImage({
		x,
		"y":    2.5,
		"w":    "25%",
		"h":    0.1,
		"data": `data:image/svg+xml;base64,${s}`,
	});

	const valign = "top";

	$.addTable([[
		{
			"text":    "Low",
			"options": textopts({ "align": "left", valign }),
		}, {
			"text":    "Medium",
			"options": textopts({ "align": "center", valign }),
		}, {
			"text":    "High",
			"options": textopts({ "align": "right", valign }),
		},
	]], textopts({ x, "y": 2.6, "w": "25%" }));

	const i = SUMMARY[index]['canvas'].toDataURL();

	$.addImage({
		"x":      "10%",
		"y":      3.5,
		"sizing": { "type": "contain", "h": "30%", "w": "30%" },
		"data":   `data:image/png;base64,${i}`,
	});
};

function analysis_right($, index, rows) {
	$.addShape(
		this.ShapeType.rect,
		{ "x": "50%", "y": 0, "w": "50%", "h": "100%", "fill": { "color": grey } },
	);

	$.addTable(rows, textopts({ "x": "52%", "y": 1, "w": "46%", "colW": [3.2, 2] }));

	for (const k of ['population-density', 'area']) {
		let x = "55%";
		let t = "Population Share";

		if (k === "area") {
			x = "80%";
			t = "Area Share";
		}

		$.addText(
			t,
			textopts({ x, "y": 4, "w": 2, bold }),
		);

		const s = btoa(SUMMARY[index][k]['pie'].svg.outerHTML);

		$.addImage({
			x,
			"y":    4.3,
			"w":    1.5,
			"h":    1.5,
			"data": `data:image/svg+xml;base64,${s}`,
		});
	}
};

async function toplocation_prepare(t) {
	const r = {};

	for (const k in SUMMARY)
		r[k] = SUMMARY[k].raw_raster[t.i];

	const poi = await coords_search_pois({ "coords": t.c, "limit": 1 });

	return Object.assign(
		r,
		context(coordinates_to_raster_pixel(t.c))[1],
		{
			"long": t.c[0],
			"lat":  t.c[1],
			"poi":  maybe(poi, 0, 'name'),
		},
	);
};

function toplocations_list(points) {
	const $ = this.addSlide();

	const border = tableborder;

	title($, `Locations with highest ${U.output.toUpperCase()} Index`);

	const divs = GEOGRAPHY.divisions.slice(1).map(d => d.name);

	const vtot = v => d3.scaleQuantile()
		.domain([0,1])
		.range(["low", "low-med", "medium", "med-high", "high"])(v);

	const color = v => d3.rgb(...ea_analysis_colorscale.fn(v)).formatHex();

	const font = v => v > 0.80 ? black : white;

	// const path = p => divs.map(d => p["_" + d]).join(" → ");
	//
	function row(p,i) {
		return [
			{
				"text":    i+1,
				"options": { bold, "align": "right", "fontSize": 10, "fontFace": "monospace" },
			},
			...divs.map(t => ({
				"text":    p["_" + t],
				"options": { "fontSize": 9 },
			})),
			{
				"text":    p.poi,
				"options": { "align": "left", "fontSize": 8, "fontFace": "monospace" },
			}, {
				"text":    `[${(p.long).toFixed(4)}, ${(p.lat).toFixed(4)}]`,
				"options": { "align": "center", "fontSize": 8, "fontFace": "monospace" },
			}, {
				"text":    vtot(p.eai),
				"options": { bold, "align": "center", "fontSize": 9, "color": font(p.eai), "fill": { "color": color(p.eai) } },
			}, {
				"text":    vtot(p.ani),
				"options": { bold, "align": "center", "fontSize": 9, "color": font(p.ani), "fill": { "color": color(p.ani) } },
			}, {
				"text":    vtot(p.demand),
				"options": { bold, "align": "center", "fontSize": 9, "color": font(p.demand), "fill": { "color": color(p.demand) } },
			}, {
				"text":    vtot(p.supply),
				"options": { bold, "align": "center", "fontSize": 9, "color": font(p.supply), "fill": { "color": color(p.supply) } },
			},
		];
	};

	const header = [
		{
			"text":    "#",
			"options": textopts({ "align": "right", bold }),
		},
		...divs.map(t => ({
			"text":    t,
			"options": textopts({ "align": "center", bold }),
		})),
		{
			"text":    "POI",
			"options": textopts({ "align": "center", bold }),
		}, {
			"text":    "Long/Lat",
			"options": textopts({ "align": "center", bold }),
		}, {
			"text":    "EAI",
			"options": textopts({ "align": "center", bold }),
		}, {
			"text":    "ANI",
			"options": textopts({ "align": "center", bold }),
		}, {
			"text":    "Demand",
			"options": textopts({ "align": "center", bold }),
		}, {
			"text":    "Supply",
			"options": textopts({ "align": "center", bold }),
		},
	];

	const rows = [header, ...points.map((p,i) => row(p,i))];

	$.addTable(rows, textopts({ x, "y": 1, "w": "96%", "colW": [0.5, ...Array(divs.length).fill(1.5), 2, 2, 1, 1, 1, 1], border }));

	footer($);
};

function toplocations_index(index, points) {
	const $ = this.addSlide();

	const border = tableborder;

	title($, `High Priority Locations for Energy Interventions (${ea_indexes[index]['name']} Info)`);

	const datasets = DS.array.filter(d => and(d.on, d.index === index));

	const divs = GEOGRAPHY.divisions.slice(1).map(d => d.name);

	const cell = (p,d) => {
		let t = p[d.id];

		if (t) {
			t = t
				.replace(/<\/?code>/g, '')
				.replace(d.category.unit || "", "")
				.replace("km (proximity to)", "");
		}

		return {
			"text":    coalesce(t, ""),
			"options": { "align": "center", "fontSize": 8, "fontFace": "monospace", "fill": "#F5FAF8" },
		};
	};

	const numcell = t => ({
		"text":    t+1,
		"options": { "align": "right", "fontFace": "monospace", bold, "fontSize": 10 },
	});

	const header = [
		{
			"text":    "#",
			"options": { "align": "right", bold },
		},
		...divs.map(t => ({
			"text":    t,
			"options": textopts({ bold, "align": "center", "fontSize": 9 }),
		})),
		{
			"text":    "Long/Lat",
			"options": textopts({ bold, "align": "center", "fontSize": 9 }),
		},
	].concat(datasets.map(d => ({
		"text":    d.name + "\n\n" + (d.category.unit || "km (proximity to)"),
		"options": { "align": "center", "valign": "middle", "fill": "#F0F5F3", "fontFace": "monospace", "fontSize": 6, bold },
	})));

	const rows = [header];

	rows.push(...points.map((p,i) => [
		numcell(i),
		...divs.map(t => {
			return {
				"text":    p["_" + t],
				"options": { "fontSize": 7 },
			};
		}),
		{
			"text":    `[${(p.long).toFixed(4)}, ${(p.lat).toFixed(4)}]`,
			"options": { "align": "center", "fontSize": 7, "fontFace": "monospace" },
		},
	].concat(datasets.map(d => cell(p,d)))));

	$.addTable(rows, textopts({ x, "y": 1, "w": "96%", "colW": [0.5, ...Array(divs.length).fill(1.5), 1.5, ...Array(datasets.length).fill(1)], border }));

	footer($);
};

export async function pptx() {
	const p = new PptxGenJS();

	p.defineLayout({ "name": "A4", "width": a4(100, 'x'), "height": a4(100, 'y') });
	p.layout = 'A4';

	front.call(p);

	let c = 0;

	CONFIG = config_generate();

	{
		chapter.call(p, "" + (c++), "Report Summary");

		platform_overview.call(p);
		how_it_works.call(p);
		selected_datasets.call(p);
		geography_indexes.call(p);
	}

	{
		chapter.call(p, "" + (c++), "Analysis");

		analysis.call(p, 'demand');
		analysis.call(p, 'supply');
		analysis.call(p, 'eai');
		analysis.call(p, 'ani');
	}

	{
		chapter.call(p, "" + (c++), "Top Locations");

		const points = await toplocations_fetch(N_POINTS)
			.then(r => r.slice(0, N_POINTS))
			.then(async r => await Promise.all(r.map(async t => await toplocation_prepare(t))));

		toplocations_list.call(p, points);
		toplocations_index.call(p, 'demand', points);
		toplocations_index.call(p, 'supply', points);
	}

	p.writeFile();
};
