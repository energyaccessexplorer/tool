import { compute_share_amounts, share_scale_colors, share_scale_labels, OUTSIDE_BUCKET } from './summary.js';

import '../lib/jszip.js';

import '../lib/pptxgen.js';

import {
	aggregate_layer_values,
	analysis_colorscale_svg,
	medhigh_point_count,
} from './analysis.js';

import {
	build_detailed_data,
	compute_distribution,
	describe,
} from './right-panel-data-tab.js';

import {
	get_locations_results,
} from './right-panel-high-priority-areas.js';

import {
	prepare_tabular_data,
	generate_rows,
} from './area-analysis.js';

import {
	area_type,
} from './utils.js';

import {
	and,
	or,
} from '../lib/helpers.js';

import {
	t,
	translateDatasetName,
	translateIndexName,
	unesc,
} from './translate.js';

const N_POINTS = 20;

export const PPT_MAX_COLUMNS = 8;

const green = "#00794C";
const white = "#ffffff";
const black = "#393F44";
const grey = "#F9F8F8";
const bold = true;
const breakLine = true;
const x = 0.3;
const first_paragraph_y = 2;

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
		{ "path": `${window.BASE}/images/wri-hbox-white-on-yellow.jpg`, "x": 0.5, "y": (a4(100, 'y') - h) + 0.125, "w": (h*3), "h": h/2 },
	);

	$.addText(
		"ENERGY ACCESS EXPLORER",
		textopts({ "x": "60%", "y": a4(100, 'y') - h, "w": "38%", "h": h, "color": white, "valign": "middle" }),
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
		{ "x": a4(5, 'x') + 0.2, "y": a4(5, 'y') + 0.1, "w": 0.5, "h": 0.5, "color": white, "fontSize": 24, "bold": true },
	);

	$.addText(
		name,
		{ "color": green, x, "y": a4(50, 'y'), "w": "90%", "h": 2, "fontSize": 48, bold },
	);

	footer($);
};

function title($, text) {
	$.addText(
		text,
		{ "color": green, x, "y": 0.3, "w": "90%", "h": 0.5, "fontSize": 22, bold },
	);
};

function front() {
	const $ = this.addSlide();
	const color = white;

	$.background = { "color": green };
	$.color = color;

	const h = 1;
	$.addImage(
		{ "path": `${window.BASE}/images/wri-box-white-on-yellow.jpg`, "x": 0.5, "y": 0.5, "w": (h*2.12), h },
	);

	$.addText(
		"ENERGY ACCESS EXPLORER",
		{ color, "x": "50%", "y": 0.5, "w": "45%", "h": 0.4, bold },
	);

	$.addText(
		[
			{
				"text":    t(window.LOCALE, 'report.front.title'),
				"options": { "fontSize": 48, bold, breakLine },
			}, {
				"text":    GEOGRAPHY.name,
				"options": { "fontSize": 48, bold, breakLine },
			}, {
				"text":    t(window.LOCALE, 'report.front.subtitle'),
				"options": { "fontSize": 10 },
			},
		],
		{ color, x, "y": "50%", "w": "90%", "h": 2.5 },
	);

	$.addText(
		[
			{
				"text":    t(window.LOCALE, 'report.front.prepared_by'),
				"options": { bold, breakLine },
			}, {
				"text":    t(window.LOCALE, 'report.front.developed_with'),
				"options": { breakLine },
			}, {
				"text":    "https://www.energyaccessexplorer.org/",
				"options": { "fontSize": 8 },
			},
		],
		{ x, "y": "90%", "w": "70%", "h": 0.8, "fontSize": 10 },
	);

	$.addText(
		(new Date()).toDateString(),
		{ "x": "85%", "y": "90%", "w": "12%", "h": 0.3, "fontSize": 9, bold },
	);
};

function platform_overview() {
	const $ = this.addSlide();
	const color = black;

	title($, t(window.LOCALE, 'report.overview.title'));

	$.addText(
		t(window.LOCALE, 'report.overview.what_we_do'),
		{ color, x, "y": 1.1, "w": "90%", "h": 1.3, "fontSize": 12, bold },
	);

	$.addText(
		t(window.LOCALE, 'report.overview.audiences_title'),
		{ "color": green, x, "y": 2.7, "w": "90%", "h": 0.4, "fontSize": 12, bold },
	);

	const audiences = [
		'planning',
		'enterprise',
		'donors',
		'service',
		'cooking',
	];

	let y = 3.25;
	for (const key of audiences) {
		$.addText(
			[
				{
					"text":    t(window.LOCALE, `report.overview.audience.${key}.name`) + " ",
					"options": { bold },
				}, {
					"text": t(window.LOCALE, `report.overview.audience.${key}.desc`),
				},
			],
			textopts({ color, x, y, "w": "90%", "h": 0.8, "fontSize": 10 }),
		);

		y += 0.82;
	}

	footer($);
};

function how_it_works() {
	const $ = this.addSlide();
	const color = black;

	title($, t(window.LOCALE, 'report.how.title'));

	$.addText(
		t(window.LOCALE, 'report.how.para1'),
		{ color, x, "y": 1.1, "w": "90%", "h": 1.5, "fontSize": 12, bold },
	);

	$.addText(
		t(window.LOCALE, 'report.how.para2'),
		{ color, x, "y": 2.8, "w": "90%", "h": 1.5, "fontSize": 11 },
	);

	$.addText(
		t(window.LOCALE, 'report.how.methodology'),
		{ "color": green, x, "y": 4.5, "w": "90%", "h": 0.4, "fontSize": 12, bold },
	);

	const demand_color = "#1B4B8F";

	const stages = [
		{
			"key": "datasets",
			"sub": [
				{ "key": "demand", "color": demand_color },
				{ "key": "supply", "color": green },
			],
		}, {
			"key": "interactions",
		}, {
			"key": "analysis",
		}, {
			"key": "maps",
		},
	];

	const box_w = 2.4;
	const box_h = 1.5;
	const gap = 0.35;
	const box_y = 5.05;

	stages.forEach((stage, i) => {
		const box_x = x + (i * (box_w + gap));

		$.addShape(
			this.ShapeType.rect,
			{ "x": box_x, "y": box_y, "w": box_w, "h": box_h, "fill": { "color": grey } },
		);

		const runs = [
			{
				"text":    t(window.LOCALE, `report.how.stage.${stage.key}.name`),
				"options": { bold, breakLine, "color": green, "fontSize": 11 },
			},
		];

		if (stage.sub) {
			for (const s of stage.sub) {
				runs.push({
					"text":    t(window.LOCALE, `report.how.stage.${stage.key}.${s.key}`) + ": ",
					"options": { bold, "color": s.color, "fontSize": 9 },
				});
				runs.push({
					"text":    t(window.LOCALE, `report.how.stage.${stage.key}.${s.key}.desc`),
					"options": { breakLine, "color": black, "fontSize": 9 },
				});
			}
		} else {
			runs.push({
				"text":    t(window.LOCALE, `report.how.stage.${stage.key}.desc`),
				"options": { "color": black, "fontSize": 9 },
			});
		}

		$.addText(
			runs,
			{ "x": box_x + 0.1, "y": box_y + 0.1, "w": box_w - 0.2, "h": box_h - 0.2, "valign": "top" },
		);

		if (i < stages.length - 1) {
			$.addText(
				"→",
				{ "x": box_x + box_w, "y": box_y, "w": gap, "h": box_h, "color": green, "fontSize": 16, bold, "align": "center", "valign": "middle" },
			);
		}
	});

	footer($);
};

function open_data() {
	const $ = this.addSlide();
	const color = black;

	title($, t(window.LOCALE, 'report.open_data.title'));

	$.addText(
		t(window.LOCALE, 'report.open_data.para1'),
		{ color, x, "y": 1.1, "w": "90%", "h": 1.6, "fontSize": 12 },
	);

	$.addText(
		t(window.LOCALE, 'report.open_data.para2'),
		{ color, x, "y": 2.9, "w": "90%", "h": 2.2, "fontSize": 11 },
	);

	$.addText(
		t(window.LOCALE, 'report.attribution'),
		{ "color": green, x, "y": 5.4, "w": "90%", "h": 0.8, "fontSize": 10, bold },
	);

	footer($);
};

function selected_datasets() {
	for (const index of ['demand', 'supply']) {
		if (!STATE.config.datasets.some(d => d.index === index))
			continue;

		selected_datasets_index(this.addSlide(), index);
	}
};

function selected_datasets_index($, index) {
	title($, t(window.LOCALE, 'report.datasets.title', { "index": translateIndexName(window.LOCALE, index) }));

	const rows = [[
		{
			"text":    t(window.LOCALE, 'report.datasets.col.dataset'),
			"options": textopts({ "align": "left", bold }),
		}, {
			"text":    t(window.LOCALE, 'report.datasets.col.unit'),
			"options": textopts({ "align": "left", bold }),
		}, {
			"text":    t(window.LOCALE, 'report.datasets.col.range'),
			"options": textopts({ "align": "left", bold }),
		}, {
			"text":    t(window.LOCALE, 'report.datasets.col.selected_range'),
			"options": textopts({ "align": "left", bold }),
		}, {
			"text":    t(window.LOCALE, 'report.datasets.col.importance'),
			"options": textopts({ "align": "left", bold }),
		},
	]];

	const monospace = { "align": "left", "valign": "middle", "fontFace": "monospace", "fontSize": 9 };

	const selected = STATE.config.datasets
		.filter(d => d.index === index)
		.map(d => ([
			{
				"text":    d.name,
				"options": textopts({ "align": "left" }),
			}, {
				"text": d.unit ? d.unit.replace('<sup>2</sup>', '²') : t(window.LOCALE, 'report.datasets.proximity'),
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

	const tabletextopts = Object.assign(textopts({ "fontSize": 10, "align": "left", "valign": "middle" }));

	$.addTable(rows.concat(selected), Object.assign(tabletextopts, { x, "y": first_paragraph_y, "w": "90%" }));

	footer($);
};

async function selected_data() {
	const summary = SUMMARY[STATE.index];
	if (!summary || !summary['raw_raster']) return;

	let entries = [];

	try {
		const mask = { "raster": { "data": summary['raw_raster'].map(v => v === -1 ? -1 : 0) } };
		const layer_data = await aggregate_layer_values(mask);
		if (!layer_data) return;

		entries = build_detailed_data(layer_data);
	} catch {
		return;
	}

	const cards = entries.filter(e => e.value != null && String(e.value).trim() !== '' && String(e.value) !== 'NaN');
	if (!cards.length) return;

	const per_slide = 4;
	const card_h = 1.55;
	const card_y0 = 1.0;

	for (let i = 0; i < cards.length; i += per_slide) {
		const chunk = cards.slice(i, i + per_slide);

		const $ = this.addSlide();

		title($, i === 0 ? t(window.LOCALE, 'report.data.title') : t(window.LOCALE, 'report.data.title_continued'));

		chunk.forEach((e, j) => {
			const card_y = card_y0 + (j * card_h);
			const card_w = a4(100, 'x') - (x * 2);

			$.addShape(
				this.ShapeType.rect,
				{ "x": x, "y": card_y, "w": card_w, "h": card_h - 0.2, "fill": { "color": grey } },
			);

			const ds = DST.get(e.id);
			const label = ds ? translateDatasetName(window.LOCALE, ds) : e.label;

			$.addText(
				label,
				textopts({ "color": green, "x": x + 0.15, "y": card_y + 0.08, "w": card_w - 0.3, "h": 0.35, bold, "fontSize": 12 }),
			);

			data_card_body($, e, ds, x + 0.15, card_y + 0.5, card_w - 0.3, card_h - 0.7);
		});

		footer($);
	}
};

function data_card_body($, e, ds, tx, ty, tw, th) {
	if (ds && (ds.type === 'raster-valued' || ds.type === 'raster-valued-mutant')) {
		const distribution = compute_distribution(ds, null);
		if (distribution?.length) {
			const runs = [
				{
					"text":    t(window.LOCALE, 'right_panel.data.categorical_desc', { "name": translateDatasetName(window.LOCALE, ds) }),
					"options": { "color": black, breakLine },
				},
			];

			for (const c of distribution) {
				runs.push({
					"text":    `${c.name}: ${c.percentage.toFixed(1)}%`,
					"options": { "color": black, breakLine, "fontSize": 10 },
				});
			}

			$.addText(runs, textopts({ "x": tx, "y": ty, "w": tw, "h": th, "fontSize": 11 }));
			return;
		}
	}

	const name = ds ? translateDatasetName(window.LOCALE, ds) : e.label;
	const description = unesc(describe(e.datatype, e.unit, name, e.value, e.aggregation)).replace(/<\/?strong>/g, '');

	const runs = [];
	if (e.value) {
		const parts = description.split(e.value);
		parts.forEach((part, i) => {
			if (part)
				runs.push({ "text": part, "options": { "color": black } });
			if (i < parts.length - 1)
				runs.push({ "text": e.value, "options": { "color": green, bold } });
		});
	}

	$.addText(runs.length ? runs : description, textopts({ "x": tx, "y": ty, "w": tw, "h": th, "fontSize": 11 }));
}
function geography_indexes() {
	const $ = this.addSlide();

	geography_indexes_left.call(this, $);
	geography_indexes_right.call(this, $);

	footer($);
};

function geography_indexes_left($) {
	title($, GEOGRAPHY.name);

	$.addText(
		t(window.LOCALE, 'report.geography.outputs'),
		textopts({ x, "y": 1, "w": "45%", "h": 0.4, bold }),
	);

	let y = 2;
	for (const i of ['eai', 'demand', 'supply', 'ani']) {
		$.addText(
			[
				{
					"text":    translateIndexName(window.LOCALE, i) + " ",
					"options": { bold },
				}, {
					"text": t(window.LOCALE, 'modal.eae_info.index.' + i + '.explain'),
				},
			],
			textopts({ x, y, "w": "45%", "h": 1, "fontSize": 11 }),
		);

		y += 1.2;
	}
};

function geography_indexes_right($) {
	const tabletextopts = Object.assign(textopts({ "fontSize": 9, "align": "left", "valign": "middle" }));

	function th(o = {}) {
		return Object.assign({}, tabletextopts, { bold, "color": white, "align": "left" }, o);
	};

	const cs = share_scale_colors();

	function table(c, y) {
		// The same six legend entries as the UI's Area/Population share cards, in the
		// same order: High down to Low, then the out-of-analysis residual — it is not
		// part of the five-colour index scale and keeps its own neutral fill. Only the
		// two light fills (High and the residual) take dark text.
		const order  = [4, 3, 2, 1, 0, OUTSIDE_BUCKET];
		const labels = share_scale_labels(window.LOCALE);

		const header_cells = order.map(i => ({
			"text":    labels[i],
			"options": th(i >= 4 ? { "fill": cs[i], "color": black } : { "fill": cs[i] }),
		}));

		const rows = [
			[
				{ "text": "" },
				...header_cells,
			],
		];

		for (const k of Object.keys(SUMMARY)) {
			const r = [];

			r.push({ "text": translateIndexName(window.LOCALE, k), "options": { bold } });

			const amounts = compute_share_amounts(SUMMARY[k][c]).amounts;
			r.push(...order.map(i => ({ "text": amounts[i].toLocaleString(window.LOCALE) })));

			rows.push(r);
		}

		$.addTable(rows, Object.assign({ "x": "51%", y, "w": "45%" }, tabletextopts));
	};

	$.addShape(
		this.ShapeType.rect,
		{ "x": "50%", "y": 0, "w": "50%", "h": "100%", "fill": { "color": grey } },
	);

	$.addText(
		t(window.LOCALE, 'report.geography.area_share', { "unit": area_type(STATE.variant) }),
		textopts({ "x": "55%", "y": 1.5, "w": "40%", "h": 0.4, bold, "color": green }),
	);

	table('area', 2);

	$.addText(
		t(window.LOCALE, 'report.geography.pop_share'),
		textopts({ "x": "55%", "y": 4.5, "w": "40%", "h": 0.4, bold, "color": green }),
	);

	table('population-density', 5);

	const summary = SUMMARY[STATE.index];

	if (summary) {
		const area_share = compute_share_amounts(summary['area']);
		const pop_share = compute_share_amounts(summary['population-density']);

		const area_unit = area_type(STATE.variant);

		$.addText(
			t(window.LOCALE, 'report.geography.total_area', { "total": area_share.total.toLocaleString(window.LOCALE), "high": area_share.amounts[4].toLocaleString(window.LOCALE), "unit": area_unit }),
			textopts({ "x": "51%", "y": 4.1, "w": "45%", "h": 0.3, "fontSize": 9 }),
		);

		$.addText(
			t(window.LOCALE, 'report.geography.total_pop', { "total": pop_share.total.toLocaleString(window.LOCALE), "high": pop_share.amounts[4].toLocaleString(window.LOCALE) }),
			textopts({ "x": "51%", "y": 7.1, "w": "45%", "h": 0.3, "fontSize": 9 }),
		);
	}
};

async function analysis(index) {
	function row(d) {
		return [
			{
				"text": d.text,
			}, {
				"text":    (d.value).toLocaleString(window.LOCALE),
				"options": { "color": green, "fontSize": 24, "align": "left", bold, "wrap": false },
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
				"text":  t(window.LOCALE, 'report.analysis.row.pop_demand'),
				"value": Math.round(population_demand),
			}),
		];

		const health = DST.get('health');
		if (health?.on) {
			right_rows.push(
				row({
					"text":  t(window.LOCALE, 'report.analysis.row.health'),
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
					"text":  t(window.LOCALE, 'report.analysis.row.schools'),
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
		const points = STATE.datasets.filter(d => and(d.index === index, d.type === 'points'));

		// TODO: lines? transmission + distribution?
		const lines = STATE.datasets.filter(d => and(d.index === index, d.type === 'lines'));

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

		const ghi = DST.get('ghi');
		const wind = DST.get('windspeed');

		right_rows = [];

		if (points_count) {
			right_rows.push(
				row({
					"text":  t(window.LOCALE, 'report.analysis.row.supply_points'),
					"value": points_count,
				}),
			);
		}

		if (lines.length) {
			right_rows.push(
				row({
					"text":  t(window.LOCALE, 'report.analysis.row.pop_lines'),
					"value": Math.round(population_lines),
				}),
			);
		}

		if (ghi?.on) {
			const data = [];
			for (let i = 0; i < summary_raster.length; i++) {
				if (summary_raster[i] === -1) continue;
				else if (ghi.raster.data[i] === ghi.raster.nodata) continue;

				data.push(ghi.raster.data[i]);
			}

			right_rows.push(
				row({
					"text":  t(window.LOCALE, 'report.analysis.row.ghi'),
					"value": Math.round(data.reduce((a,b) => a+b) / data.length),
				}),
			);
		}

		if (wind?.on) {
			const data = [];
			for (let i = 0; i < summary_raster.length; i++) {
				if (summary_raster[i] === -1) continue;
				else if (wind.raster.data[i] === wind.raster.nodata) continue;

				data.push(wind.raster.data[i]);
			}

			right_rows.push(
				row({
					"text":  t(window.LOCALE, 'report.analysis.row.wind'),
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

		const points = STATE.datasets.filter(d => and(or(d.id === 'health', d.id === "schools")));
		const lines = STATE.datasets.filter(d => and((d.index === 'supply'), d.type === 'lines'));

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
				"text":  t(window.LOCALE, 'report.analysis.row.pop_covered'),
				"value": Math.round(population_count),
			}),
		];

		if (lines.length) {
			right_rows.push(
				row({
					"text":  t(window.LOCALE, 'report.analysis.row.pop_lines'),
					"value": Math.round(population_lines),
				}),
			);
		}

		if (points.length) {
			const x = [
				[schools?.on, t(window.LOCALE, 'report.analysis.points.schools')],
				[health?.on, t(window.LOCALE, 'report.analysis.points.health')],
			].filter(p => p[0]).map(p => p[1]).join(' and ');

			right_rows.push(
				row({
					"text":  t(window.LOCALE, 'report.analysis.row.points_amounts', { x }),
					"value": points_count,
				}),
			);
		}

		break;
	}
	}

	if (!right_rows.length) return;

	const $ = this.addSlide();

	await analysis_left.call(this, $, index);

	analysis_right.call(this, $, index, right_rows);

	footer($);
};

async function fetch_basemap(envelope) {
	// Reuse the same token/theme the client map uses; never hardcode it.
	const token = (EAE && EAE['settings'] && EAE['settings'].mapbox_token) || null;
	if (!token) return null;

	const [minLng, minLat, maxLng, maxLat] = envelope;
	// Pad the bbox ~10% on each side so neighbouring context shows around the geography.
	const padLng = (maxLng - minLng) * 0.1;
	const padLat = (maxLat - minLat) * 0.1;
	const bMinLng = minLng - padLng;
	const bMinLat = minLat - padLat;
	const bMaxLng = maxLng + padLng;
	const bMaxLat = maxLat + padLat;

	// The /static/[bbox]/ form fits the bbox into the requested pixels. Match the
	// aspect ratio to the padded bbox to avoid letterboxing.
	const W = 800;
	const H = Math.min(1280, Math.round(W * (bMaxLat - bMinLat) / (bMaxLng - bMinLng)));

	const url =
		`https://api.mapbox.com/styles/v1/mapbox/light-v10/static/[${bMinLng},${bMinLat},${bMaxLng},${bMaxLat}]/${W}x${H}` +
		`?access_token=${token}&logo=false&attribution=false`;

	try {
		const res = await fetch(url);
		if (!res.ok) return null;
		const blob = await res.blob();
		const dataUrl = await new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});
		return dataUrl;
	} catch {
		// Any failure (network, status, ...) falls back to the choropleth-only slide.
		return null;
	}
};

async function analysis_left($, index) {
	title($, translateIndexName(window.LOCALE, index));

	$.addText(
		t(window.LOCALE, `report.analysis.long.${index}`),
		textopts({ x, "y": 1, "w": "45%", "h": 1.5, bold }),
	);

	const s = btoa(new XMLSerializer().serializeToString(analysis_colorscale_svg));

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
			"text":    t(window.LOCALE, 'left_panel.output.ramp.low'),
			"options": textopts({ "align": "left", valign }),
		}, {
			"text":    t(window.LOCALE, 'left_panel.output.ramp.medium'),
			"options": textopts({ "align": "center", valign }),
		}, {
			"text":    t(window.LOCALE, 'left_panel.output.ramp.high'),
			"options": textopts({ "align": "right", valign }),
		},
	]], textopts({ x, "y": 2.6, "w": "25%" }));

	const c = SUMMARY[index]['canvas'];
	const data = c.toDataURL('image/png');

	const r = c.width / c.height;

	let w = 3;
	let h = 3;

	if (c.width > c.height) h = 3/r;
	if (c.height > c.width) w = 3*r;

	const [minLng, minLat, maxLng, maxLat] = GEOGRAPHY.envelope;

	// Basic basemap underneath the choropleth (falls back to null on any failure,
	// leaving the choropleth on the plain white background).
	const basemap = await fetch_basemap(GEOGRAPHY.envelope);

	// Choropleth placement and anchor points. Default to the original full
	// placement so the plain fallback slide is untouched when there is no
	// basemap; inset values are applied only when a basemap exists.
	let chx = "10%";
	let chy = 3.5;
	let chw = w;
	let chh = h;
	let ox = a4(10, 'x');
	let oy = 3.5 + h + 0.12;
	let fw = 1;

	if (basemap) {
		$.addImage({
			"x":    "10%",
			"y":    3.5,
			w, h,
			"data": basemap,
		});

		// The choropleth canvas extent matches GEOGRAPHY.envelope; inset it within
		// the basemap by the padding fractions used to build the basemap bbox.
		const padLng = (maxLng - minLng) * 0.1;
		const padLat = (maxLat - minLat) * 0.1;
		const bMinLng = minLng - padLng;
		const bMinLat = minLat - padLat;
		const bMaxLng = maxLng + padLng;
		const bMaxLat = maxLat + padLat;
		const fx = (minLng - bMinLng) / (bMaxLng - bMinLng);
		fw = (maxLng - minLng) / (bMaxLng - bMinLng);
		const fy = (bMaxLat - maxLat) / (bMaxLat - bMinLat);
		const fh = (maxLat - minLat) / (bMaxLat - bMinLat);

		chx = a4(10, 'x') + fx * w;
		chy = 3.5 + fy * h;
		chw = fw * w;
		chh = fh * h;
		ox = a4(10, 'x') + fx * w;
		oy = 3.5 + fh * h + 0.12;
	}

	$.addImage({
		"x": chx,
		"y": chy,
		"w": chw,
		"h": chh,
		data,
	});

	const centerLat = (minLat + maxLat) / 2;
	const totalKm   = (maxLng - minLng) * 111.32 * Math.cos(centerLat * Math.PI / 180);
	const kmPerInch = totalKm / (fw * w);
	const nice_vals = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
	const target_km = kmPerInch * w * 0.3;
	const niceKm    = nice_vals.reduce((p, c) => Math.abs(c - target_km) < Math.abs(p - target_km) ? c : p);
	const barW      = niceKm / kmPerInch;
	const niceMi    = niceKm * 0.621371;
	const kmLabel   = niceKm >= 1 ? `${niceKm} km` : `${Math.round(niceKm * 1000)} m`;
	const miLabel   = niceMi >= 1 ? `${Math.round(niceMi)} mi` : `${Math.round(niceMi * 5280)} ft`;

	// North arrow as SVG so N and needle are always aligned
	const north_svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 26">
		<text x="10" y="7" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="bold" fill="#333">N</text>
		<polygon points="10,9 14,19 10,17 6,19" fill="#333"/>
	</svg>`;
	$.addImage({ "x": ox, "y": oy, "w": 0.26, "h": 0.34, "data": `data:image/svg+xml;base64,${btoa(north_svg)}` });

	// Scale bar
	const bx = ox + 0.26 + 0.12;
	const by = oy + 0.15;
	const bh = 0.04;

	$.addShape(this.ShapeType.rect, { "x": bx,                  "y": by - 0.02, "w": 0.01, "h": bh + 0.04, "fill": { "color": "333333" } });
	$.addShape(this.ShapeType.rect, { "x": bx,                  "y": by,        "w": barW, "h": bh,         "fill": { "color": "333333" } });
	$.addShape(this.ShapeType.rect, { "x": bx + barW - 0.01,    "y": by - 0.02, "w": 0.01, "h": bh + 0.04, "fill": { "color": "333333" } });

	$.addText(`${kmLabel} / ${miLabel}`, textopts({ "x": bx, "y": by + bh + 0.02, "w": barW, "h": 0.12, "fontSize": 6, "align": "center" }));

	if (basemap) {
		$.addText('© Mapbox', textopts({ "x": ox, "y": by + bh + 0.02 + 0.14, "w": 1, "h": 0.12, "fontSize": 6, "align": "left" }));
	}
};

function analysis_right($, index, rows) {
	$.addShape(
		this.ShapeType.rect,
		{ "x": "50%", "y": 0, "w": "50%", "h": "100%", "fill": { "color": grey } },
	);

	$.addTable(rows, textopts({ "x": "52%", "y": 1, "w": "46%", "colW": [3.2, 2] }));

	for (const k of ['population-density', 'area']) {
		let x = "55%";
		let label = t(window.LOCALE, 'report.analysis.pop_share');

		if (k === "area") {
			x = "80%";
			label = t(window.LOCALE, 'report.analysis.area_share');
		}

		$.addText(
			label,
			textopts({ x, "y": 4, "w": 2, "h": 0.4, bold }),
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

function toplocations_table(slide_title, columns, rows_data) {
	const $ = this.addSlide();

	const border = tableborder;

	title($, slide_title);

	const header = [
		{
			"text":    "#",
			"options": textopts({ "align": "left", bold, "fontSize": 8 }),
		},
		...columns.map(name => ({
			"text":    name.replace(/\b\w/g, c => c.toUpperCase()),
			"options": textopts({ "align": "left", bold, "fontSize": 8 }),
		})),
	];

	const rows = [header, ...rows_data.map((row, i) => [
		{
			"text":    i + 1,
			"options": { "align": "left", "fontSize": 8, "fontFace": "monospace" },
		},
		...columns.map(col => ({
			"text":    row[col] != null ? String(row[col]) : "",
			"options": { "align": "left", "fontSize": 7 },
		})),
	])];

	const tableWidth = a4(100, 'x') - x * 2;
	const firstColWidth = 0.5;
	const remainingColWidth = (tableWidth - firstColWidth) / columns.length;
	const colW = [firstColWidth, ...Array(columns.length).fill(remainingColWidth)];

	$.addTable(rows, textopts({ x, "y": 1.1, "w": tableWidth, "colW": colW, "rowH": 0.27, border }));

	footer($);
};

export async function pptx(opts = {}) {
	const p = new PptxGenJS();

	p.defineLayout({ "name": "A4", "width": a4(100, 'x'), "height": a4(100, 'y') });
	p.layout = 'A4';

	front.call(p);

	let c = 0;

	{
		chapter.call(p, "" + (c++), t(window.LOCALE, 'report.chapter.summary'));

		platform_overview.call(p);
		how_it_works.call(p);
		open_data.call(p);
		selected_datasets.call(p);
		await selected_data.call(p);
		geography_indexes.call(p);
	}

	{
		chapter.call(p, "" + (c++), t(window.LOCALE, 'report.chapter.analysis'));

		await analysis.call(p, 'demand');
		await analysis.call(p, 'supply');
		await analysis.call(p, 'eai');
		await analysis.call(p, 'ani');
	}

	{
		const area_label = area_type(STATE.variant);
		const is_admin = STATE.variant !== 'raster';
		chapter.call(p, "" + (c++), is_admin ? t(window.LOCALE, 'report.toplocations.top_area', { "area": area_label }) : t(window.LOCALE, 'report.chapter.top_locations'));

		const results = (opts.results || get_locations_results()).slice(0, N_POINTS);

		if (results.length) {
			const { headers, is_raster, analysis_name, column_meta } = prepare_tabular_data(results);
			const rows = [...generate_rows(results, is_raster, analysis_name, 0, results.length)];

			const FIXED = ['Priority score', analysis_name];
			const selected = opts.visible_headers || headers.filter(h => column_meta.get(h)?.visible);
			const fixed_cols = FIXED.filter(h => headers.includes(h));
			const extra_cols = selected.filter(h => headers.includes(h) && !FIXED.includes(h));
			const columns = [...fixed_cols, ...extra_cols].slice(0, PPT_MAX_COLUMNS);

			const slide_title = is_admin
				? t(window.LOCALE, 'report.toplocations.admin_title', { "area": area_label, "index": STATE.index.toUpperCase() })
				: t(window.LOCALE, 'report.toplocations.raster_title', { "index": STATE.index.toUpperCase() });
			toplocations_table.call(p, slide_title, columns, rows);
		}
	}

	return p;
};

